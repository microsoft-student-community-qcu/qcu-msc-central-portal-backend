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
| TC-10 | `POST …/orders/:id/confirm` (concurrent) | two officers confirm orders for the last unit | exactly one **200**; the other **409** auto-`OUT_OF_STOCK` | - [ ] |
| TC-11 | `GET /api/v2/admin/merch/screenshots/:file` | no token | **401** | - [ ] |

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
| TC-27 | resubmit after reject | `POST …/payment-proof` again | **200** → back to `PENDING_VERIFICATION`; prior reason cleared | - [ ] |
| TC-28 | `POST …/orders/:id/claim` | confirmed order | **200** → `PAID_AND_CLAIMED`; receipt email | - [ ] |
| TC-29 | `POST …/orders/:id/cancel` (head) | confirmed order | **200** → `CANCELLED`; **stock restored**; email | - [ ] |

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
