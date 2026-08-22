# Module 04 (M2) — Org Merch Pre-Orders — Manual Test Cases

- **Module doc:** `docs/modules/v2/04-merch-pre-orders.md`
- **API docs:** `docs/api/v2/merch.md`
- **Data models:** `docs/specs/data-models/merch.md`
- **Branch:** `feat/v2-merch`
- **Automated coverage:** `src/__tests__/merch.routes.test.ts`, `src/__tests__/authMiddleware.guards.test.ts`

## Setup

1. Apply migrations: `npx prisma migrate deploy`
2. Set `GCASH_NUMBER` and `GCASH_QR_IMAGE_URL` in `.env`.
3. Open the shop: `PATCH /api/v2/admin/settings { "merch_shop_open": true }` (SUPERADMIN).
4. Seed a finance officer + finance head, or promote users via `PATCH /api/v2/admin/users/:id/role`.
5. Start the server (`npm run dev`). Base URL: `http://localhost:5000`.

## Priority legend

- **P0** — Security & critical: RBAC, anti-enumeration, duplicate reference, stock integrity.
- **P1** — Core functionality: happy paths + primary error codes.
- **P2** — Edge & regression: filters, malformed input, toggle gating.

---

## P0 — Security & critical

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-01 | `POST /api/v2/admin/merch/items` | no token | **401** + `message` | - [ ] |
| TC-02 | `POST /api/v2/admin/merch/items` | MEMBER token | **403** + `message` | - [ ] |
| TC-03 | `POST /api/v2/admin/merch/items/:id/archive` | `ADMIN_FINANCE` (non-head) | **403** (head-only) | - [ ] |
| TC-04 | `POST /api/v2/admin/merch/orders/:id/cancel` | `ADMIN_FINANCE` (non-head) | **403** (head-only) | - [ ] |
| TC-05 | `POST …/items/:id/archive` | `ADMIN_FINANCE_HEAD` | **200** (head passes finance guard too) | - [ ] |
| TC-06 | `GET /api/v2/merch/orders/:ref?email=wrong@x.com` | email ≠ order email | **404** (not 403) | - [ ] |
| TC-07 | `POST …/orders/:ref/payment-proof` | email mismatch | **404** | - [ ] |
| TC-08 | `POST …/payment-proof` | reference already used on another order | **409** `DUPLICATE_REFERENCE`; order REJECTED; email sent | - [ ] |
| TC-09 | `POST …/payment-proof` | upload a `.pdf` as screenshot | **400** (images only) | - [ ] |
| TC-10 | `POST …/orders/:id/confirm` (concurrent) | two officers confirm orders for the last unit | exactly one **200**; the other **409** → order `AWAITING_RESOLUTION` (not REJECTED), sold-out email sent | - [ ] |
| TC-11 | `GET /api/v2/admin/merch/screenshots/:file` | no token | **401** | - [ ] |
| TC-12 | `GET /api/v2/merch/photos/proof-x.png` | public tries to fetch a screenshot via photo proxy | **400** (only `item-` served publicly) | - [ ] |

## P1 — Core functionality

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-20 | `POST /api/v2/admin/merch/items` | valid multipart (1–6 photos + variants JSON) | **201** item live; `MERCH_ITEM_CREATED` audited | - [ ] |
| TC-21 | `GET /api/v2/merch` | shop open | **200** ACTIVE items with `inStock`/`lowStock` flags | - [ ] |
| TC-22 | `POST /api/v2/merch/orders` | valid body, in-stock variant | **201** `orderRef` + amount + QR URL; email sent; **stock unchanged** | - [ ] |
| TC-23 | `POST /api/v2/merch/orders` | quantity > variant stock | **409** "no longer available" | - [ ] |
| TC-24 | `POST …/payment-proof` | unique 13-digit reference + PNG | **200** → order `PENDING_VERIFICATION` | - [ ] |
| TC-25 | `POST …/orders/:id/confirm` | pending order, stock available | **200** → `CONFIRMED`; variant stock −qty; email | - [ ] |
| TC-26 | `POST …/orders/:id/reject` | `reason=AMOUNT_MISMATCH` | **200** → `REJECTED`; reason emailed | - [ ] |
| TC-27 | resubmit after reject | `POST …/payment-proof` again (reason was AMOUNT_MISMATCH) | **200** → back to `PENDING_VERIFICATION`; new submission row added, earlier attempt's rejection preserved in timeline | - [ ] |
| TC-28 | `POST …/orders/:id/claim` | confirmed order | **200** → `PAID_AND_CLAIMED`; receipt email | - [ ] |
| TC-29 | `POST …/orders/:id/cancel` (head) | confirmed order | **200** → `CANCELLED`; **stock restored**; email | - [ ] |

## §7a/§7b/§8 — Refunds, resolution, resubmit lock, proxies, operability

Reproduces the reported feedback (oversell email, `/reject` OUT_OF_STOCK, static/mislabelled emails,
amount-mismatch top-up, refund method labels, screenshot streaming, 7-photo upload) plus the refund/
notification features.

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-50 | oversell email (was the bug) | drive an order to `AWAITING_RESOLUTION` via TC-10, read the student email | headline = sold-out; **no "Resubmit Payment Proof" button**; reassures money is safe | - [ ] |
| TC-51 | `POST …/payment-proof` | order is `AWAITING_RESOLUTION` | **409** "being resolved" (cannot pay again) | - [ ] |
| TC-52 | `POST …/payment-proof` | order `REJECTED` with reason `OUT_OF_STOCK` | **409** not awaiting (not resubmittable) | - [ ] |
| TC-53 | `POST …/payment-proof` | order `REJECTED` with reason `AMOUNT_MISMATCH` | **200** accepted; submission flagged `isTopUp` | - [ ] |
| TC-54 | `POST …/orders/:id/refund` | `ADMIN_FINANCE` (non-head) | **403** (head-only) | - [ ] |
| TC-55 | `POST …/orders/:id/refund` (head) | `AWAITING_RESOLUTION`, `{amount ≤ total, method:"MAYA"}` | **200** → `REFUNDED`; `FULL` `MerchRefund`; email says "via **Maya**" (not the enum); `MERCH_ORDER_REFUNDED` audited | - [ ] |
| TC-55b | `POST …/orders/:id/refund` (head) | `method:"OTHER"` with no note | **400** `errors.note` (note required for OTHER) | - [ ] |
| TC-56 | `POST …/orders/:id/refund` (head) | `amount` > order total | **400** "cannot exceed" | - [ ] |
| TC-57 | `POST …/orders/:id/refund` (head) | order not `AWAITING_RESOLUTION` | **409** | - [ ] |
| TC-58 | `POST …/orders/:id/refund` (head) | full refund already recorded | **409** | - [ ] |
| TC-59 | `GET …/orders/:id` (detail) | order with 2 submission attempts | **200**; `submissions` array with `attempt` 1..N + each `officerDecision`; `refunds` array | - [ ] |
| TC-60 | `POST …/orders/:id/resend-email` | any order | **200**; `lastNotifiedAt` updated; `MERCH_ORDER_EMAIL_RESENT` audited | - [ ] |
| TC-61 | `GET …/orders?status=AWAITING_RESOLUTION` | queue filter | **200**; only awaiting-resolution orders; rows show `attemptCount` + `lastNotificationOk` + `stockHeld` | - [ ] |
| TC-62 | screenshot streaming (how-to #3) | `GET …/merch/screenshots/<proof-file>` with finance session, `--download` | **200** image bytes | - [ ] |
| TC-63 | `GET …/merch/screenshots/item-x.png` | finance token, wrong prefix | **400** "This file is not a payment screenshot." | - [ ] |
| TC-64 | `GET /api/v2/merch/photos/item-<uuid>.png` | valid catalog photo | **200** image + `Cache-Control: …immutable` | - [ ] |
| TC-64b | `GET /api/v2/merch/photos/proof-x.jpg` | public tries a screenshot via photo proxy | **400** "This file is not a catalog photo." (distinct from "Invalid … filename") | - [ ] |
| TC-65 | `POST /api/v2/admin/merch/items` | attach 7 photos (HTTPie) | clean **400** "You can upload at most 6 photos" (no dropped connection) | - [ ] |
| TC-66 | `POST …/orders/:id/reject` | `{reason:"OUT_OF_STOCK"}` on a PENDING order | **200**; order → `AWAITING_RESOLUTION` (NOT `REJECTED`); sold-out email (no resubmit); `MERCH_ORDER_AWAITING_RESOLUTION` audited | - [ ] |
| TC-67 | `POST …/orders/:id/reject` | `{reason:"AMOUNT_MISMATCH"}` with no `shortfallAmount` | **400** `errors.shortfallAmount` | - [ ] |
| TC-68 | `POST …/orders/:id/reject` | `{reason:"AMOUNT_MISMATCH", shortfallAmount:100}` (total 350) | **200** → `REJECTED`; email shows "send **₱100.00** more" + QR, distinct **Reason** block, and the officer note as **Note from the admin** | - [ ] |
| TC-69 | `POST …/orders/:id/reject` | `{reason:"AMOUNT_MISMATCH", shortfallAmount:350}` (≥ total) | **400** "less than the order total" | - [ ] |
| TC-70 | `POST …/orders/:id/reject` | `{reason:"SCREENSHOT_UNCLEAR", shortfallAmount:100}` | **400** `errors.shortfallAmount` (only applies to AMOUNT_MISMATCH) | - [ ] |
| TC-71 | rejection email copy | reject with each of REFERENCE_NOT_FOUND / SCREENSHOT_UNCLEAR / OTHER | subject + headline differ per reason (not the old static "We couldn't verify your payment"); `financeNote` appears as **Note from the admin** for every reason | - [ ] |

## §8d — Self-service resolution (swap / refund) + per-variant price

Requires an order in `AWAITING_RESOLUTION` with a resolution link (from the sold-out email, or resend). Create an item with variants at different prices (e.g. M ₱350, L ₱400, S ₱300) to exercise deltas.

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-80 | `POST /api/v2/admin/merch/items` | variant with a `price` override | **201**; catalog shows that variant's own price; ordering it uses the override × qty | - [ ] |
| TC-81 | `GET /api/v2/merch/resolve/:token` | valid link | **200**; `options` = in-stock same-item variants (current + sold-out excluded) with `priceDelta` + `direction` (same/cheaper/pricier); `canRefund:true` | - [ ] |
| TC-82 | `GET …/resolve/:token` | consumed link | **410** already used | - [ ] |
| TC-83 | `GET …/resolve/:token` | expired link (or unknown) | **410** expired / **404** invalid | - [ ] |
| TC-84 | `GET …/resolve/:token` | order already resolved (e.g. CONFIRMED) | **409** already resolved | - [ ] |
| TC-85 | `POST …/resolve/:token/swap` | pricier variant, no `acknowledgedTopUp` | **409** `data.requiresTopUp:true` + exact `shortfall` (no state change) | - [ ] |
| TC-86 | `POST …/resolve/:token/swap` | pricier variant, `acknowledgedTopUp:true` | **200**; order → `AWAITING_PAYMENT`, `shortfallAmount` set, `stockHeld:true`; top-up email (exact ₱ + QR); token consumed | - [ ] |
| TC-87 | resubmit top-up | after TC-86, `POST …/payment-proof` with the top-up reference | **200** → `PENDING_VERIFICATION`; submission `isTopUp:true`; **confirm does not double-decrement stock** | - [ ] |
| TC-88 | `POST …/resolve/:token/swap` | cheaper variant | **200**; order → `CONFIRMED`, `refundOwed` = difference; swap-confirmed email mentions the refund | - [ ] |
| TC-89 | `POST …/admin/merch/orders/:id/refund` (head) | CONFIRMED order with `refundOwed>0`, `{amount=diff}` | **200**; `PRICE_DIFFERENCE` MerchRefund; `refundOwed` cleared; order stays `CONFIRMED` | - [ ] |
| TC-90 | `POST …/resolve/:token/swap` | target variant sold out mid-swap (stock 0) | **409** "sold out" (token **not** consumed) | - [ ] |
| TC-91 | `POST …/resolve/:token/refund` | student picks refund | **200**; `refundRequestedAt` set; token consumed; ack email; `MERCH_ORDER_REFUND_REQUESTED` audited; order stays `AWAITING_RESOLUTION` | - [ ] |
| TC-92 | `GET …/admin/merch/orders?overdueTopUp=true` | pricier-swap order unpaid 7+ days | **200**; lists the overdue top-up order | - [ ] |
| TC-93 | reuse after action | reuse a token already consumed by a swap/refund | **410** already used | - [ ] |

## P2 — Edge & regression

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-40 | `GET /api/v2/merch` | shop closed (`merch_shop_open=false`) | **503** | - [ ] |
| TC-41 | `POST /api/v2/merch/orders` | shop open but `GCASH_*` unset | **503** | - [ ] |
| TC-42 | `GET /api/v2/merch/:id` | ARCHIVED item by direct ID | **404** | - [ ] |
| TC-43 | `POST /api/v2/admin/merch/items` | 7 photos | **400** (max 6) | - [ ] |
| TC-44 | `POST /api/v2/admin/merch/items` | `variants` with duplicate labels | **400** `errors.variants` | - [ ] |
| TC-45 | `POST …/orders/:id/reject` | `reason=OTHER` without `financeNote` | **400** `errors.financeNote` | - [ ] |
| TC-46 | `POST …/orders/:id/confirm` | order already `CONFIRMED` | **409** | - [ ] |
| TC-47 | `POST /api/v2/merch/orders` | 11 requests in < 1 min | **429** with `message` | - [ ] |
| TC-48 | `POST …/payment-proof` | `referenceNumber` not 13 digits | **400** `errors.referenceNumber` | - [ ] |

> Any behavior change discovered during testing → update `CHANGELOG.md` under `[Unreleased]`.
