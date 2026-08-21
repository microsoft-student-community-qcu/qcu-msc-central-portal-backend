# Workflow — Merch Pre-Orders (V2 Module 04, Finance)

Shipped implementation of the offline GCash merch pre-order system. This guide is the
authoritative workflow reference now that the module is built; the module spec
([`docs/modules/v2/04-merch-pre-orders.md`](../../../modules/v2/04-merch-pre-orders.md)) remains
the design record.

## Roles

| Role | Capabilities |
|------|--------------|
| Any student (guest or member) | Browse catalog, pre-order, submit payment proof, track order |
| `ADMIN_FINANCE` | Manage catalog, verify/reject payments, mark claimed, resend emails |
| `ADMIN_FINANCE_HEAD` | Everything finance + archive items + cancel orders + record refunds |
| `SUPERADMIN` | Full access (role inheritance) |

The whole public surface is gated by the `merch_shop_open` toggle (Super Admin Settings Hub).

## Order lifecycle

```
AWAITING_PAYMENT ──submit proof──▶ PENDING_VERIFICATION ──confirm──▶ CONFIRMED ──claim──▶ PAID_AND_CLAIMED
       │                                   │
       │                                   ├─reject──▶ REJECTED ──resubmit*──▶ PENDING_VERIFICATION
       │                                   └─oversold at confirm──▶ REFUND_PENDING ──record refund──▶ REFUNDED
       └──submit duplicate ref──▶ REJECTED (DUPLICATE_REFERENCE, automatic)

Live stages except refund-track ──head cancel──▶ CANCELLED   (stock restored if it was CONFIRMED)

* resubmit is allowed only for student-fixable rejections (bad reference, amount mismatch, unclear
  screenshot, duplicate typo, other). OUT_OF_STOCK / REFUND_PENDING are NOT resubmittable.
```

## Flow (student)

1. **Browse** `GET /api/v2/merch` → pick an item + variant. Catalog photos load via the public
   proxy `GET /api/v2/merch/photos/:filename` (the blob container is private).
2. **Pre-order** `POST /api/v2/merch/orders` — real-time stock check (no reservation). Receives a
   payment screen (org GCash QR + exact amount + `orderRef`) and a confirmation email with the
   same QR and a tracking link. Order = `AWAITING_PAYMENT`.
3. **Pay via GCash** offline, then **submit proof** `POST …/payment-proof` with the 13-digit
   reference number + screenshot. Duplicate reference → instant auto-reject. Otherwise →
   `PENDING_VERIFICATION`.
4. **Track** `GET …/orders/:orderRef?email=…` at any time. On a fixable rejection, the tracking
   page shows the reason and re-opens the proof form (same order reused). If the item sold out
   after payment, the order shows `REFUND_PENDING` and Finance arranges a refund/swap — the proof
   form stays closed.

## Flow (finance)

1. **Catalog** — create items with photos + variants (goes live immediately); edit freely; head
   archives items (order history preserved).
2. **Verify queue** — `PENDING_VERIFICATION` orders sorted FCFS. Open an order (`GET …/orders/:orderId`)
   to see the full attempt timeline. Confirm (atomic stock decrement) or reject with a preset reason.
   If stock ran out between submission and confirmation, confirm routes the order to
   **`REFUND_PENDING`** (the student paid — never rejected) and sends the out-of-stock email.
3. **Pickup** — mark `CONFIRMED` orders as claimed at handoff → `PAID_AND_CLAIMED` + receipt email.
4. **Refund** (head only) — for `REFUND_PENDING` orders, `POST …/refund` records a `MerchRefund`
   (amount ≤ order total, method, reference) → `REFUNDED` + receipt email.
5. **Cancel** (head only) — cancels a live order (not refund-track); restores stock if confirmed.
6. **Resend** — `POST …/resend-email` re-sends the current-status email if a send silently failed
   (watch `lastNotificationOk === false` / `lastNotifiedAt` in the queue).

## Key invariants

- **Stock is only decremented at CONFIRMED**, via `updateMany({ where: { id, stock: { gte: qty } } })`
  — never read-then-write. Because payment precedes verification, overselling is still possible;
  the losing confirm routes its order to `REFUND_PENDING` rather than rejecting a paid student
  (structural prevention proposed in issue #178).
- **A paid student is never told to "resubmit" for a sold-out item** — that path is a refund, not a
  rejection, and resubmission is blocked for `OUT_OF_STOCK` / `REFUND_PENDING`.
- **Duplicate reference numbers are rejected across every order and submission**, not just within
  one order.
- **Per-attempt history:** each payment-proof submission keeps its own officer decision, so a
  resubmission never erases why an earlier attempt failed.
- **Notification tracking:** merch emails record `lastNotifiedAt` / `lastNotificationOk`; a failed
  send is visible and re-sendable rather than silent.
- **Anti-enumeration:** order tracking and proof submission require the order email; a mismatch
  returns 404, never 403.
- **Image proxies are prefix-scoped:** the public photo proxy serves only `item-*`; the finance
  screenshot proxy serves only `proof-*`. Neither accepts traversal filenames.
- Every finance mutation writes a tamper-evident `MERCH_*` audit entry.

## Configuration

- `GCASH_NUMBER`, `GCASH_QR_IMAGE_URL` — org GCash details (see `.env.example`). Order creation
  returns 503 until both are set.
- `merch_shop_open` — global open/close toggle.

See [`docs/api/v2/merch.md`](../../../api/v2/merch.md) for the full endpoint reference.
