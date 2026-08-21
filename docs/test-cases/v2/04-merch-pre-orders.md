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
| TC-10 | `POST …/orders/:id/confirm` (concurrent) | two officers confirm orders for the last unit | exactly one **200**; the other **409** → order `REFUND_PENDING` (not REJECTED), out-of-stock email sent | - [ ] |
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

## §7a/§7b — Refunds, resubmit lock, proxies, operability

Reproduces the reported feedback (oversell email, screenshot streaming, 7-photo upload) plus the new refund/notification features.

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-50 | oversell email (was the bug) | drive an order to `REFUND_PENDING` via TC-10, read the student email | headline = sold-out/refund due; **no "Resubmit Payment Proof" button**; reassures money is safe | - [ ] |
| TC-51 | `POST …/payment-proof` | order is `REFUND_PENDING` | **409** "being refunded" (cannot pay again) | - [ ] |
| TC-52 | `POST …/payment-proof` | order `REJECTED` with reason `OUT_OF_STOCK` | **409** not awaiting (not resubmittable) | - [ ] |
| TC-53 | `POST …/payment-proof` | order `REJECTED` with reason `AMOUNT_MISMATCH` | **200** accepted (student-fixable) | - [ ] |
| TC-54 | `POST …/orders/:id/refund` | `ADMIN_FINANCE` (non-head) | **403** (head-only) | - [ ] |
| TC-55 | `POST …/orders/:id/refund` (head) | `REFUND_PENDING`, `{amount ≤ total, method:"GCASH"}` | **200** → `REFUNDED`; `MerchRefund` created; refund email; `MERCH_ORDER_REFUNDED` audited | - [ ] |
| TC-56 | `POST …/orders/:id/refund` (head) | `amount` > order total | **400** "cannot exceed" | - [ ] |
| TC-57 | `POST …/orders/:id/refund` (head) | order not `REFUND_PENDING` | **409** | - [ ] |
| TC-58 | `POST …/orders/:id/refund` (head) | refund already recorded | **409** | - [ ] |
| TC-59 | `GET …/orders/:id` (detail) | order with 2 submission attempts | **200**; `submissions` array with `attempt` 1..N + each `officerDecision` | - [ ] |
| TC-60 | `POST …/orders/:id/resend-email` | any order | **200**; `lastNotifiedAt` updated; `MERCH_ORDER_EMAIL_RESENT` audited | - [ ] |
| TC-61 | `GET …/orders?status=REFUND_PENDING` | queue filter | **200**; only refund-pending orders; rows show `attemptCount` + `lastNotificationOk` | - [ ] |
| TC-62 | screenshot streaming (how-to #3) | `GET …/merch/screenshots/<proof-file>` with finance session, `--download` | **200** image bytes | - [ ] |
| TC-63 | `GET …/merch/screenshots/item-x.png` | finance token, wrong prefix | **400** (screenshot proxy serves only `proof-`) | - [ ] |
| TC-64 | `GET /api/v2/merch/photos/item-<uuid>.png` | valid catalog photo | **200** image + `Cache-Control: …immutable` | - [ ] |
| TC-65 | `POST /api/v2/admin/merch/items` | attach 7 photos (HTTPie) | clean **400** "You can upload at most 6 photos" (no dropped connection) | - [ ] |

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
