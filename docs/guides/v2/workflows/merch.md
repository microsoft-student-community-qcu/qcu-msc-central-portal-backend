# Workflow — Merch Pre-Orders (V2 Module 04, Finance)

Shipped implementation of the offline GCash merch pre-order system. This guide is the
authoritative workflow reference now that the module is built; the module spec
([`docs/modules/v2/04-merch-pre-orders.md`](../../../modules/v2/04-merch-pre-orders.md)) remains
the design record.

## Roles

| Role | Capabilities |
|------|--------------|
| Any student (guest or member) | Browse catalog, pre-order, submit payment proof, track order |
| `ADMIN_FINANCE` | Manage catalog, verify/reject payments, mark claimed |
| `ADMIN_FINANCE_HEAD` | Everything finance + archive items + cancel orders |
| `SUPERADMIN` | Full access (role inheritance) |

The whole public surface is gated by the `merch_shop_open` toggle (Super Admin Settings Hub).

## Order lifecycle

```
AWAITING_PAYMENT ──submit proof──▶ PENDING_VERIFICATION ──confirm──▶ CONFIRMED ──claim──▶ PAID_AND_CLAIMED
       │                                   │
       │                                   ├─reject──▶ REJECTED ──resubmit──▶ PENDING_VERIFICATION
       └──submit duplicate ref──▶ REJECTED (DUPLICATE_REFERENCE, automatic)

Any live stage ──head cancel──▶ CANCELLED   (stock restored if it was CONFIRMED)
```

## Flow (student)

1. **Browse** `GET /api/v2/merch` → pick an item + variant.
2. **Pre-order** `POST /api/v2/merch/orders` — real-time stock check (no reservation). Receives a
   payment screen (org GCash QR + exact amount + `orderRef`) and a confirmation email with the
   same QR and a tracking link. Order = `AWAITING_PAYMENT`.
3. **Pay via GCash** offline, then **submit proof** `POST …/payment-proof` with the 13-digit
   reference number + screenshot. Duplicate reference → instant auto-reject. Otherwise →
   `PENDING_VERIFICATION`.
4. **Track** `GET …/orders/:orderRef?email=…` at any time. On rejection, the tracking page shows
   the reason and re-opens the proof form (same order reused).

## Flow (finance)

1. **Catalog** — create items with photos + variants (goes live immediately); edit freely; head
   archives items (order history preserved).
2. **Verify queue** — `PENDING_VERIFICATION` orders sorted FCFS. Confirm (atomic stock decrement)
   or reject with a preset reason. If stock ran out between submission and confirmation, confirm
   auto-rejects `OUT_OF_STOCK`.
3. **Pickup** — mark `CONFIRMED` orders as claimed at handoff → `PAID_AND_CLAIMED` + receipt email.
4. **Cancel** (head only) — cancels at any live stage; restores stock if the order was confirmed.

## Key invariants

- **Stock is only decremented at CONFIRMED**, via `updateMany({ where: { id, stock: { gte: qty } } })`
  — never read-then-write, so concurrent confirms can't oversell.
- **Duplicate reference numbers are rejected across every order and submission**, not just within
  one order.
- **Anti-enumeration:** order tracking and proof submission require the order email; a mismatch
  returns 404, never 403.
- **Payment screenshots** are admin-only, served through `GET /api/v2/admin/merch/screenshots/:filename`.
- Every finance mutation writes a tamper-evident `MERCH_*` audit entry.

## Configuration

- `GCASH_NUMBER`, `GCASH_QR_IMAGE_URL` — org GCash details (see `.env.example`). Order creation
  returns 503 until both are set.
- `merch_shop_open` — global open/close toggle.

See [`docs/api/v2/merch.md`](../../../api/v2/merch.md) for the full endpoint reference.
