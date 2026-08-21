# Merch API (V2) — Org Merch Pre-Orders

> **Module 04 (M2) — Finance.** Public catalog + order flow under `/api/v2/merch`; finance
> admin under `/api/v2/admin/merch`. All financial transactions are handled **offline** via
> GCash — the portal only records and verifies reference numbers.

## Overview

Finance officers manage a merch catalog; students browse and pre-order without an account and
pay via GCash offline. Payments are verified by matching the student-submitted GCash reference
number. The entire public surface is gated behind the `merch_shop_open` system toggle
(Module 01).

**Roles:** `ADMIN_FINANCE` and `ADMIN_FINANCE_HEAD` manage the module (both pass
`requireAdminFinance`; archive + cancel are head-only). `SUPERADMIN` inherits all access.

**Response contract:** standard — `{ success, data?, message? }` on success,
`{ success, message }` for simple errors, `{ success, message: "Validation error", errors }`
for field-level Zod errors.

**Money:** prices/amounts are `Decimal(10,2)` in the DB, returned as JSON numbers (e.g. `350`).

---

## Public — Catalog

### 1. List Catalog

**Method:** `GET` **Path:** `/api/v2/merch` **Auth:** none

Returns all `ACTIVE` items with variants and computed stock flags. Returns **503** when the shop
is closed.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "…", "name": "MSC Shirt", "description": "Cotton tee",
        "price": 350, "photos": ["https://api.example/api/v2/merch/photos/item-abc.png"], "lowStockThreshold": 10,
        "createdAt": "…", "updatedAt": "…",
        "variants": [
          { "id": "…", "label": "S", "stock": 3, "inStock": true, "lowStock": true },
          { "id": "…", "label": "M", "stock": 0, "inStock": false, "lowStock": false }
        ]
      }
    ]
  }
}
```
**Errors:** `503` shop closed · `500` internal

### 2. Get Item

**Method:** `GET` **Path:** `/api/v2/merch/:itemId` **Auth:** none

Returns a single `ACTIVE` item. `ARCHIVED` items return `404` even by direct ID.

**Errors:** `404` not found / archived · `503` shop closed · `500` internal

### 2b. Get Catalog Photo (proxy)

**Method:** `GET` **Path:** `/api/v2/merch/photos/:filename` **Auth:** none

Streams a catalog photo from the private blob container (catalog `photos` are stored as filenames
and returned as absolute URLs pointing here). Restricted to the `item-` filename prefix, so it can
**never** serve a payment screenshot. Sends `Cache-Control: public, max-age=86400, immutable`.

**Errors:** `400` invalid / non-`item-` filename · `404` not found · `500` internal

---

## Public — Orders

### 3. Create Pre-Order

**Method:** `POST` **Path:** `/api/v2/merch/orders` **Auth:** none (links to account when a session cookie is present)
**Rate limit:** 10/min per IP

**Body (JSON):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `variantId` | string | Yes | Selected variant |
| `quantity` | int (1–20) | Yes | |
| `studentName` | string | Yes | |
| `email` | string (email) | Yes | Receives the payment QR + tracking link |
| `studentId` | string? | No | QCU Student ID |
| `gcashNumber` | string? | No | `09XXXXXXXXX` — recorded for reference only |

Runs a **real-time stock check**; stock is **not** reserved (only decremented at CONFIRMED).

**Success (201):**
```json
{
  "success": true,
  "data": {
    "orderRef": "MSC-MERCH-2026-0042",
    "amount": 700,
    "gcashNumber": "09171234567",
    "gcashQrImageUrl": "https://…/merch/org-gcash-qr.png",
    "trackingUrl": "https://frontend/merch/orders/MSC-MERCH-2026-0042",
    "instructions": "Scan the GCash QR and pay exactly ₱700.00…"
  },
  "message": "Pre-order created. Please complete your GCash payment."
}
```
**Errors:** `400` validation · `404` item/variant unavailable · `409` out of stock · `503` shop closed / GCash not configured · `500` internal

### 4. Track Order

**Method:** `GET` **Path:** `/api/v2/merch/orders/:orderRef?email=…` **Auth:** none
**Rate limit:** 30/min per IP

Requires the matching `email`. A mismatch returns **404** (never 403) so an order's existence is
never confirmed to a non-owner.

**Success (200):** `{ success, data: { order: { orderRef, itemName, variantLabel, quantity, amount, status, rejectionReason, financeNote, … } } }`

**Errors:** `400` missing/invalid email · `404` not found / email mismatch · `500` internal

### 5. Submit Payment Proof

**Method:** `POST` **Path:** `/api/v2/merch/orders/:orderRef/payment-proof` **Auth:** none
**Rate limit:** 10/min per IP · **Content-Type:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string (email) | Yes | Must match the order |
| `referenceNumber` | string (13 digits) | Yes | GCash reference number |
| `screenshot` | file (JPEG/PNG/WEBP, ≤10MB) | Yes | Magic-byte validated |

A submission is accepted only when the order is `AWAITING_PAYMENT`, or `REJECTED` with a
**student-fixable** reason (`REFERENCE_NOT_FOUND`, `AMOUNT_MISMATCH`, `SCREENSHOT_UNCLEAR`,
`DUPLICATE_REFERENCE`, `OTHER`). `OUT_OF_STOCK` and `REFUND_PENDING` are **not** resubmittable — a
paid-but-unfulfillable order can never be pushed into paying again (it awaits a refund). Runs an
**instant duplicate-reference check across every other order** — a duplicate auto-rejects
(`DUPLICATE_REFERENCE`) with no officer review. A unique reference moves the order to
`PENDING_VERIFICATION`.

**Success (200):** `{ success, message: "Your payment proof has been received…" }`

**Errors:** `400` validation / missing screenshot / non-image · `404` not found / email mismatch · `409` duplicate reference / not awaiting payment / order being refunded · `500` internal

---

## Admin — Item Management (Finance)

> All under `/api/v2/admin/merch`. `requireAdminFinance` (ADMIN_FINANCE, ADMIN_FINANCE_HEAD,
> SUPERADMIN) unless noted head-only. Mutations rate-limited (20/min) and audit-logged.

### 6. List Items (admin)

`GET /api/v2/admin/merch/items?status=ACTIVE|ARCHIVED` — full catalog incl. archived. Auth: finance.

### 7. Create Item

`POST /api/v2/admin/merch/items` — `multipart/form-data`. Auth: finance.

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | ≤150 |
| `description` | string | ≤2000 |
| `price` | number | > 0 |
| `lowStockThreshold` | int? | default 10 |
| `variants` | JSON string | `[{"label":"S","stock":50}]` — ≥1, unique labels |
| `photos` | file[] (1–6, JPEG/PNG/WEBP) | required |

**Success (201):** `{ success, data: { item }, message: "Item created" }` · Audit: `MERCH_ITEM_CREATED`
**Errors:** `400` validation / no photos / >6 photos / non-image · `500` internal

### 8. Update Item

`PATCH /api/v2/admin/merch/items/:itemId` — `multipart/form-data`, all fields optional. Auth: finance.
New `photos` **replace** the set; `variants` upsert by label (stock update / add; no delete).
**Success (200):** `{ success, data: { item }, message: "Item updated" }` · Audit: `MERCH_ITEM_EDITED`
**Errors:** `400` validation · `404` not found · `500` internal

### 9. Archive Item — head-only

`POST /api/v2/admin/merch/items/:itemId/archive` — Auth: **ADMIN_FINANCE_HEAD**. Preserves order history.
**Errors:** `403` non-head · `404` not found · `409` already archived · `500` internal · Audit: `MERCH_ITEM_ARCHIVED`

---

## Admin — Order Verification (Finance)

### 10. List Orders (queue)

`GET /api/v2/admin/merch/orders?status=&page=&pageSize=` — FCFS (createdAt asc), paginated (max 50). Auth: finance.
`status` accepts any `MerchOrderStatus` (incl. `REFUND_PENDING`). Each row includes the latest
reference number + screenshot filename (serve via §15), `attemptCount`, and notification tracking
(`lastNotifiedAt`, `lastNotificationOk`, `notificationCount`) so stale/failed notifications are findable.

### 11. Confirm Payment

`POST /api/v2/admin/merch/orders/:orderId/confirm` — Auth: finance. Order must be `PENDING_VERIFICATION`.
Decrements stock via a single **atomic conditional update** (`stock >= quantity`) and marks the
latest submission `VERIFIED`. If the decrement matches no row (oversold — stock gone), the order
moves to **`REFUND_PENDING`** (not `REJECTED`) and the student gets the out-of-stock email (no
resubmit button); process the refund via §17.
**Success (200):** confirmed + student emailed · Audit: `MERCH_ORDER_CONFIRMED`
**409 (oversold):** order set `REFUND_PENDING` + student notified · Audit: `MERCH_ORDER_REFUND_PENDING`
**Errors:** `404` not found · `409` not pending / oversold → refund pending · `500` internal

### 12. Reject Payment

`POST /api/v2/admin/merch/orders/:orderId/reject` — Auth: finance. Order must be `PENDING_VERIFICATION`.

| Field | Type | Notes |
|-------|------|-------|
| `reason` | enum | `REFERENCE_NOT_FOUND`, `AMOUNT_MISMATCH`, `SCREENSHOT_UNCLEAR`, `OUT_OF_STOCK`, `OTHER` |
| `financeNote` | string? | Required when `reason=OTHER` |

Student emailed the reason + resubmit link. The decision is recorded on the **latest submission**
(per-attempt history) and denormalised onto the order. Audit: `MERCH_ORDER_REJECTED`.
**Errors:** `400` validation · `404` not found · `409` not pending · `500` internal

### 13. Mark Claimed

`POST /api/v2/admin/merch/orders/:orderId/claim` — Auth: finance. Order must be `CONFIRMED` → `PAID_AND_CLAIMED` + receipt email. Audit: `MERCH_ORDER_CLAIMED`.
**Errors:** `404` not found · `409` not confirmed · `500` internal

### 14. Cancel Order — head-only

`POST /api/v2/admin/merch/orders/:orderId/cancel` — Auth: **ADMIN_FINANCE_HEAD**.

| Field | Type | Notes |
|-------|------|-------|
| `financeNote` | string | Required — cancellation reason |

Cancellable while live except `CANCELLED`, `PAID_AND_CLAIMED`, `REFUND_PENDING`, `REFUNDED`
(the last two are handled by the refund endpoint §17). If the order was `CONFIRMED`, its stock is
**restored**. Student emailed. Audit: `MERCH_ORDER_CANCELLED`.
**Errors:** `400` validation · `403` non-head · `404` not found · `409` terminal / refund-track state · `500` internal

### 15. Serve Screenshot

`GET /api/v2/admin/merch/screenshots/:filename` — Auth: finance. Streams the payment screenshot
through a protected proxy (screenshots are never linked publicly). Restricted to the `proof-`
filename prefix; rejects traversal / illegal filenames with `400`.

### 16. Order Detail (timeline)

`GET /api/v2/admin/merch/orders/:orderId` — Auth: finance. Returns the full order plus the
payment-proof **attempt timeline** (each with an `attempt` number, automated `result`, officer
`officerDecision`/`rejectionReason`/`financeNote`, reviewer + timestamp) and the `refund` record
if present. Lets an officer see e.g. "attempt 2 — attempt 1 rejected AMOUNT_MISMATCH".
**Errors:** `404` not found · `500` internal

### 17. Record Refund — head-only

`POST /api/v2/admin/merch/orders/:orderId/refund` — Auth: **ADMIN_FINANCE_HEAD**. Order must be `REFUND_PENDING`.

| Field | Type | Notes |
|-------|------|-------|
| `amount` | number | > 0 and ≤ order total |
| `method` | enum | `GCASH`, `CASH`, `OTHER` |
| `referenceNumber` | string? | Refund transfer reference |
| `note` | string? | Optional context (≤500) |

Creates a `MerchRefund`, moves the order to `REFUNDED`, emails the student a receipt. One refund
per order. Audit: `MERCH_ORDER_REFUNDED`.
**Errors:** `400` validation / amount > total · `403` non-head · `404` not found · `409` not refund-pending / already refunded · `500` internal

### 18. Resend Status Email

`POST /api/v2/admin/merch/orders/:orderId/resend-email` — Auth: finance. Resends the email matching
the order's **current status** (handles the case where an earlier send silently failed). Updates
notification tracking. Audit: `MERCH_ORDER_EMAIL_RESENT`.
**Errors:** `404` not found · `409` no email for status / no refund record yet · `502` send failed · `503` payment details unconfigured (AWAITING_PAYMENT) · `500` internal

---

## Settings & Audit

- **Toggle:** `merch_shop_open` (Module 01 whitelist) — gates all public endpoints.
- **Audit actions:** `MERCH_ITEM_CREATED`, `MERCH_ITEM_EDITED`, `MERCH_ITEM_ARCHIVED`,
  `MERCH_ORDER_CONFIRMED`, `MERCH_ORDER_REJECTED`, `MERCH_ORDER_CLAIMED`, `MERCH_ORDER_CANCELLED`,
  `MERCH_ORDER_REFUND_PENDING`, `MERCH_ORDER_REFUNDED`, `MERCH_ORDER_EMAIL_RESENT`.

## Oversell & Refunds

Stock is only decremented at `CONFIRMED` and never reserved earlier, so an item can be oversold
(more paid orders than stock). The confirm that loses the race moves its order to `REFUND_PENDING`
and the student is told (no resubmit). A head records the offline refund via §17. Structural
prevention (TTL soft-hold reservations) is proposed in **issue #178**.

## Related

- Module spec: [`docs/modules/v2/04-merch-pre-orders.md`](../../modules/v2/04-merch-pre-orders.md)
- Data model: [`docs/specs/data-models/merch.md`](../../specs/data-models/merch.md)
- Workflow: [`docs/guides/v2/workflows/merch.md`](../../guides/v2/workflows/merch.md)
