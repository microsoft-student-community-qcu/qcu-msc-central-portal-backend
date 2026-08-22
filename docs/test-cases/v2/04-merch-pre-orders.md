# Module 04 (M2) — Org Merch Pre-Orders — Manual Test Cases

- **Module doc:** `docs/modules/v2/04-merch-pre-orders.md`
- **API docs:** `docs/api/v2/merch.md`
- **Data models:** `docs/specs/data-models/merch.md`
- **Branch:** `feat/v2-merch`
- **Automated coverage:** `src/__tests__/merch.routes.test.ts` (56 cases), `src/__tests__/authMiddleware.guards.test.ts`

This is a **linear walkthrough** — run it top to bottom. Each phase lists its prerequisites, and
later phases reuse orders created earlier. IDs shown (`order-1`, `<token>`, …) are placeholders —
substitute the real values from earlier responses.

---

## Your feedback → where it's proven

Every item from the manual-testing rounds, mapped to the case that verifies the fix:

| # | Original feedback | Verified by |
|---|-------------------|-------------|
| 1 | Oversell email must offer **change order** + **refund** CTAs on a protected, unguessable, expiring link | TC-30, TC-31, TC-34–TC-41 |
| 1b | `/reject` with `OUT_OF_STOCK` "stole" money (resubmit email) | TC-32 |
| 2 | Predictable `orderRef` — accepted as-is | (no change; see data-models §orderRef) |
| 4 | `AMOUNT_MISMATCH` must tell the student the **exact** top-up, not re-pay in full | TC-20, TC-21, TC-22, TC-23 |
| 5 | Manual **resend** of a status email | TC-44 |
| 6 | See "**last notified**" so a silent failure is visible | TC-46 (queue fields) |
| 7 | Per-attempt history preserved across resubmissions | TC-45 (order detail timeline) |
| 8 | 7-photo upload closed the connection | TC-56 |
| 9 / TC-12 | Photo/screenshot proxy confusion; how to stream a screenshot | TC-51–TC-54 |
| Note | Static email header ("We couldn't verify your payment") | TC-24 |
| Note | `financeNote` missing from the email | TC-19, TC-24 |
| Note | "Note from the admin" showed **system** text, not the admin's | TC-21, TC-24 |
| TC-55 (old) | Refund email printed the raw enum ("via OTHER") | TC-48, TC-49 |

---

## Setup

1. **Migrate + generate:** `npx prisma migrate deploy` then `npx prisma generate`.
2. **Env:** set `GCASH_NUMBER` and `GCASH_QR_IMAGE_URL` in `.env` (order creation 503s without them).
3. **Open the shop:** `PATCH /api/v2/admin/settings { "merch_shop_open": true }` as SUPERADMIN.
4. **Accounts:** have one `ADMIN_FINANCE` (officer) and one `ADMIN_FINANCE_HEAD` (head) — promote via
   `PATCH /api/v2/admin/users/:id/role`. Seed logins are in `prisma/seed.ts`.
5. **Run:** `npm run dev` — base URL `http://localhost:5000`.
6. **Use a real inbox** for the order emails (Resend/SMTP send for real). Emails carry the payment QR,
   rejection reasons, and the resolution link.

**How to get a resolution link (needed for Phase D swap/refund):** an oversold order emails the link,
but you can also mint one on demand as finance:
`POST /api/v2/admin/merch/orders/:orderId/resolution-link` → returns `{ swapUrl, refundUrl }`. The
`<token>` is the path segment: `…/merch/resolve/<token>?intent=swap`.

**How to age an order (needed for TC-47 overdue top-up):** run once against the dev DB —
`UPDATE MerchOrder SET updatedAt = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE orderRef = '<ref>';`

**Legend:** ✅ 200/201 · 4xx = documented error. Fill the **Result** box as you go.

---

## Phase A — Catalog & per-variant pricing (feedback #4/#7 groundwork)

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-01 | `POST /api/v2/admin/merch/items` (finance) — multipart: `name`, `description`, `price=350`, 1–6 photos, `variants=[{"label":"S","stock":5},{"label":"M","stock":1},{"label":"L","stock":5,"price":400},{"label":"XL","stock":0,"price":400}]` | **201**; item live; `MERCH_ITEM_CREATED` audited. Keep the item + variant IDs. | ☐ |
| TC-02 | `GET /api/v2/merch` (public) | **200**; item shows per-variant `price` (S/M = 350, L/XL = 400), `inStock`/`lowStock` flags | ☐ |
| TC-03 | `GET /api/v2/merch/photos/item-<uuid>.png` (copy a filename from the item's `photos`) | **200** image bytes + `Cache-Control: …immutable` | ☐ |
| TC-04 | `GET /api/v2/merch/:itemId` for an item you archived (`POST …/items/:id/archive` as head first) | **404** (archived hidden from public) | ☐ |

## Phase B — Happy path (order → pay → confirm → claim)

Prereq: Phase A item, shop open, GCash env set.

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-05 | `POST /api/v2/merch/orders` `{variantId:<S>, quantity:1, studentName, email}` | **201**; `orderRef` + `amount=350` + QR URL; confirmation email; **variant stock unchanged**. Keep `orderRef`. | ☐ |
| TC-06 | `POST /api/v2/merch/orders` `{variantId:<L>, quantity:1, …}` | **201**; `amount=400` (per-variant override applied) | ☐ |
| TC-07 | `GET /api/v2/merch/orders/<orderRef>?email=<email>` | **200**; order shows `AWAITING_PAYMENT`, `amount`, `shortfallAmount:null`, `refundOwed:null` | ☐ |
| TC-08 | `POST /api/v2/merch/orders/<orderRef>/payment-proof` — multipart `email`, `referenceNumber` (13 digits), `screenshot` (PNG) | **200** → `PENDING_VERIFICATION`; "proof received" email | ☐ |
| TC-09 | `POST /api/v2/admin/merch/orders/<id>/confirm` (finance) | **200** → `CONFIRMED`; variant stock −1; confirmation email; `MERCH_ORDER_CONFIRMED` audited | ☐ |
| TC-10 | `POST /api/v2/admin/merch/orders/<id>/claim` (finance) | **200** → `PAID_AND_CLAIMED`; receipt email | ☐ |

## Phase C — Rejections, dynamic emails & the amount-mismatch top-up (feedback #4 + email notes)

Prereq: a fresh order taken to `PENDING_VERIFICATION` (repeat TC-05 + TC-08) for each reject case.

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-15 | `POST …/orders/:id/reject` `{reason:"REFERENCE_NOT_FOUND"}` | **200** → `REJECTED`; email headline is reason-specific (not "We couldn't verify your payment"); CTA "Resubmit Payment Proof" | ☐ |
| TC-16 | `POST …/orders/:id/reject` `{reason:"SCREENSHOT_UNCLEAR"}` | **200**; email headline = "We couldn't read your payment screenshot" (proves dynamic copy) | ☐ |
| TC-17 | `POST …/orders/:id/reject` `{reason:"OTHER"}` (no `financeNote`) | **400** `errors.financeNote` (note required for OTHER) | ☐ |
| TC-18 | `POST …/orders/:id/reject` `{reason:"OTHER", financeNote:"Wrong recipient GCash"}` | **200**; email shows a **Reason** block ("Other") **and** a separate **Note from the admin** = your text | ☐ |
| TC-19 | Inspect the TC-18 email | The admin's words appear under **Note from the admin**; the system label under **Reason** — not swapped | ☐ |
| TC-20 | `POST …/orders/:id/reject` `{reason:"AMOUNT_MISMATCH"}` (no `shortfallAmount`) | **400** `errors.shortfallAmount` (exact top-up is mandatory) | ☐ |
| TC-21 | `POST …/orders/:id/reject` `{reason:"AMOUNT_MISMATCH", shortfallAmount:100}` (order total 350) | **200** → `REJECTED`; email says **send ₱100.00 more** + shows the GCash QR + a **Reason** block | ☐ |
| TC-22 | `GET /api/v2/merch/orders/<orderRef>?email=…` after TC-21 | **200**; `shortfallAmount:100` (page shows the **₱100 owed**, not ₱350) | ☐ |
| TC-23 | `POST …/orders/:id/reject` `{reason:"AMOUNT_MISMATCH", shortfallAmount:350}` (≥ total) | **400** "less than the order total" | ☐ |
| TC-24 | Compare the TC-15 / TC-16 / TC-21 emails | Subjects + headlines differ per reason; `financeNote` (when sent) always appears as **Note from the admin** | ☐ |
| TC-25 | After TC-21, resubmit: `POST …/payment-proof` with a new 13-digit ref | **200** → `PENDING_VERIFICATION`; submission recorded `isTopUp:true` (verify in TC-45) | ☐ |
| TC-26 | Reject with a shortfall on a non-mismatch reason: `{reason:"SCREENSHOT_UNCLEAR", shortfallAmount:100}` | **400** `errors.shortfallAmount` (only valid for AMOUNT_MISMATCH) | ☐ |

## Phase D — Oversell resolution: the swap/refund flow (feedback #1 + #1b)

This is the headline flow. To force an oversell: variant **M** has stock 1. Place **two** orders on M
(TC-05 pattern), pay proof on both, then confirm both — the second confirm loses the race.

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-30 | Confirm the **first** M order | **200** → `CONFIRMED` (took the last unit) | ☐ |
| TC-31 | Confirm the **second** M order | **409**; order → **`AWAITING_RESOLUTION`** (NOT `REJECTED`); `MERCH_ORDER_AWAITING_RESOLUTION` audited; sold-out email sent | ☐ |
| TC-32 | Separately: take a fresh PENDING order and `POST …/reject {reason:"OUT_OF_STOCK"}` | **200**; order → `AWAITING_RESOLUTION` (NOT `REJECTED`); response says "routed to refund/replacement"; sold-out email (proves the reject "stealing" bug is fixed) | ☐ |
| TC-33 | Read the sold-out email from TC-31/TC-32 | **No "Resubmit" button**; has **Choose Another Size** button + **Request a refund** link; reassures money is safe | ☐ |
| TC-34 | `POST /api/v2/admin/merch/orders/<id>/resolution-link` (finance) | **200**; returns `{ swapUrl, refundUrl }`. Copy `<token>` from the URL. | ☐ |
| TC-35 | `GET /api/v2/merch/resolve/<token>` | **200**; `options` = same-item, in-stock variants (current M + sold-out XL excluded) with `priceDelta` + `direction` (S=cheaper −50, L=pricier +50); `canRefund:true` | ☐ |
| TC-36 | `POST /api/v2/merch/resolve/<token>/swap` `{variantId:<L>}` (pricier, no ack) | **409**; `data.requiresTopUp:true`, `shortfall:50`; **no state change** | ☐ |
| TC-37 | Re-issue a link (TC-34), then swap to **L** with `{variantId:<L>, acknowledgedTopUp:true}` | **200**; order → `AWAITING_PAYMENT`, `shortfallAmount:50`, `stockHeld:true`; top-up email (send ₱50 + QR); token consumed | ☐ |
| TC-38 | `GET /api/v2/merch/orders/<orderRef>?email=…` after TC-37 | **200**; `shortfallAmount:50` shown (student sees they owe **₱50**, not ₱400) | ☐ |
| TC-39 | Pay the ₱50: `POST …/payment-proof` (new ref) → then `POST …/confirm` (finance) | proof **200**; confirm **200** → `CONFIRMED`; **variant L stock decremented only once** (not twice — stock was already held) | ☐ |
| TC-40 | New oversell order → new link → swap to **S** `{variantId:<S>}` (cheaper) | **200**; order → `CONFIRMED`; `refundOwed:50`; swap-confirmed email mentions a ₱50 refund coming | ☐ |
| TC-41 | New oversell order → new link → `POST /api/v2/merch/resolve/<token>/refund` | **200**; `refundRequestedAt` set; order stays `AWAITING_RESOLUTION`; ack email; `MERCH_ORDER_REFUND_REQUESTED` audited; token consumed | ☐ |
| TC-42 | Reuse a token already consumed (from TC-37/TC-40/TC-41) | **410** "already been used" | ☐ |
| TC-43 | `GET /api/v2/merch/resolve/<token>/swap` target that just sold out (set the target variant stock to 0 first, then swap to it) | **409** "sold out" (token **not** consumed) | ☐ |

## Phase E — Refunds (full + price-difference, methods) (old TC-55)

Prereq: an `AWAITING_RESOLUTION` order (TC-41's, or any) for the FULL cases; TC-40's `CONFIRMED`
order with `refundOwed:50` for the PRICE_DIFFERENCE case.

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-48 | `POST …/orders/:id/refund` (head) `{amount:350, method:"MAYA", referenceNumber:"…"}` on the `AWAITING_RESOLUTION` order | **200** → `REFUNDED`; `FULL` `MerchRefund`; email reads "processed via **Maya**" (human label, not "MAYA"/enum) | ☐ |
| TC-49 | `POST …/orders/:id/refund` (head) `{amount:350, method:"OTHER"}` (no note) | **400** `errors.note` (OTHER requires a note; email would otherwise be meaningless) | ☐ |
| TC-50 | `POST …/orders/:id/refund` (head) `{amount:50, method:"GCASH"}` on TC-40's order (`refundOwed:50`) | **200**; `PRICE_DIFFERENCE` `MerchRefund`; `refundOwed` cleared; order **stays `CONFIRMED`** | ☐ |
| TC-50b | Repeat TC-50 (already settled) | **409** difference already refunded | ☐ |
| TC-50c | Full refund `{amount:500}` where total is 350 | **400** "cannot exceed" | ☐ |
| TC-50d | Full refund on a `CONFIRMED` order with nothing owed | **409** (nothing to refund) | ☐ |

## Phase F — Operability (feedback #5/#6/#7)

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-44 | `POST …/orders/:id/resend-email` (finance) on any order | **200**; resends the current-status email; `MERCH_ORDER_EMAIL_RESENT` audited (no status guard — works at any state) | ☐ |
| TC-45 | `GET /api/v2/admin/merch/orders/:id` on the TC-25 order (rejected then resubmitted) | **200**; `submissions` timeline with `attempt` 1..N; attempt 1 shows the AMOUNT_MISMATCH rejection; latest shows `isTopUp:true` — **earlier attempt not erased** | ☐ |
| TC-46 | `GET /api/v2/admin/merch/orders?status=AWAITING_RESOLUTION` | **200**; rows include `attemptCount`, `lastNotifiedAt`, `lastNotificationOk`, `stockHeld`, `shortfallAmount`, `refundOwed` | ☐ |
| TC-46b | `GET /api/v2/admin/merch/orders?refundOwed=true` | **200**; only orders still owing a swap difference (e.g. TC-40's before TC-50) | ☐ |
| TC-47 | Age TC-37's order 8 days (SQL in Setup), then `GET /api/v2/admin/merch/orders?overdueTopUp=true` | **200**; lists the unpaid pricier-swap order | ☐ |

## Phase G — Security, RBAC & the image proxies (feedback #9)

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-51 | `GET /api/v2/admin/merch/screenshots/<proof-file>` with a **finance** session, save output | **200** image bytes (this is how you view a payment screenshot) | ☐ |
| TC-52 | `GET /api/v2/admin/merch/screenshots/<proof-file>` with **no token** | **401** | ☐ |
| TC-53 | `GET /api/v2/merch/photos/proof-<uuid>.jpg` (public photo proxy, wrong class) | **400** "This file is not a catalog photo." (distinct from "invalid filename") | ☐ |
| TC-54 | `GET /api/v2/admin/merch/screenshots/item-<uuid>.png` (screenshot proxy, wrong class) | **400** "This file is not a payment screenshot." | ☐ |
| TC-54b | `GET /api/v2/merch/photos/..%2f..%2fetc%2fpasswd` (traversal) | **400** "Invalid photo filename" | ☐ |
| TC-55 | `POST …/items` (no token) · `POST …/items` (MEMBER token) | **401** · **403** | ☐ |
| TC-55b | Head-only as plain finance officer: `…/items/:id/archive`, `…/orders/:id/cancel`, `…/orders/:id/refund` | **403** each | ☐ |
| TC-55c | Head-only as `ADMIN_FINANCE_HEAD`: `…/items/:id/archive` | **200** (head passes the finance guard too) | ☐ |
| TC-55d | `GET /api/v2/merch/orders/<orderRef>?email=wrong@x.com` and `POST …/payment-proof` with a mismatched email | **404** each (never 403 — anti-enumeration) | ☐ |
| TC-55e | `POST …/payment-proof` with a `referenceNumber` already used on another order | **409** `DUPLICATE_REFERENCE`; order → `REJECTED`; auto-reject email | ☐ |

## Phase H — Edge & regression (feedback #8 + validation/toggles)

| # | Do this | Expect | Result |
|----|---------|--------|--------|
| TC-56 | `POST …/items` with **7** photos attached | clean **400** "You can upload at most 6 photos" (connection **not** dropped) | ☐ |
| TC-57 | `POST …/payment-proof` uploading a `.pdf` as the screenshot | **400** (images only) | ☐ |
| TC-58 | `POST …/payment-proof` with `referenceNumber` not 13 digits | **400** `errors.referenceNumber` | ☐ |
| TC-59 | `POST …/items` with duplicate variant labels | **400** `errors.variants` | ☐ |
| TC-60 | `POST /api/v2/merch/orders` `quantity` > variant stock | **409** "no longer available" | ☐ |
| TC-61 | `GET /api/v2/merch` with `merch_shop_open=false` | **503** | ☐ |
| TC-62 | `POST /api/v2/merch/orders` with `GCASH_*` unset | **503** | ☐ |
| TC-63 | `POST /api/v2/merch/orders` 11× within a minute | **429** with `message` (rate limit) | ☐ |
| TC-64 | `POST …/orders/:id/confirm` on an already-`CONFIRMED` order | **409** | ☐ |
| TC-65 | `POST /api/v2/merch/resolve/<token>` after the order was resolved (e.g. refunded) | **409** "already resolved" | ☐ |

---

> Found a behaviour change while testing? Update `CHANGELOG.md` under `[Unreleased]` and, if an
> endpoint's contract changed, `docs/api/v2/merch.md`.
