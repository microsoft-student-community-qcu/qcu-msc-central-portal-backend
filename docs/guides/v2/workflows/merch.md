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
       │                                   ├─reject (fixable)──▶ REJECTED ──resubmit*──▶ PENDING_VERIFICATION
       │                                   └─oversold at confirm / reject OUT_OF_STOCK──▶ AWAITING_RESOLUTION
       └──submit duplicate ref──▶ REJECTED (DUPLICATE_REFERENCE, automatic)

AWAITING_RESOLUTION ──student swaps variant──▶ CONFIRMED   (or AWAITING_PAYMENT if pricier — top-up)
                    └──student/ head refund──▶ REFUNDED

Live stages except resolution-track ──head cancel──▶ CANCELLED   (stock restored if stockHeld)

* resubmit is allowed only for student-fixable rejections (bad reference, amount mismatch, unclear
  screenshot, duplicate typo, other). OUT_OF_STOCK never lands in REJECTED (it auto-reroutes), and
  AWAITING_RESOLUTION is NOT resubmittable.
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
   page shows the reason and re-opens the proof form (same order reused). An `AMOUNT_MISMATCH`
   rejection shows the exact top-up amount + QR (pay only the difference). If the item sold out
   after payment, the order shows `AWAITING_RESOLUTION` and the student swaps to another variant
   or takes a refund (self-service resolution flow, §8d) — the proof form stays closed.

## Flow (finance)

1. **Catalog** — create items with photos + variants (goes live immediately); edit freely; head
   archives items (order history preserved).
2. **Verify queue** — `PENDING_VERIFICATION` orders sorted FCFS. Open an order (`GET …/orders/:orderId`)
   to see the full attempt timeline. Confirm (atomic stock decrement, sets `stockHeld`) or reject
   with a preset reason. `AMOUNT_MISMATCH` requires the exact shortfall (student is emailed the
   precise top-up). If stock ran out between submission and confirmation — or you pick `OUT_OF_STOCK`
   on reject — the (paid) order routes to **`AWAITING_RESOLUTION`** (never rejected) and gets the
   sold-out email.
3. **Pickup** — mark `CONFIRMED` orders as claimed at handoff → `PAID_AND_CLAIMED` + receipt email.
4. **Refund** (head only) — for `AWAITING_RESOLUTION` orders the student chose to refund, `POST …/refund`
   records a `FULL` `MerchRefund` (amount ≤ order total, method incl. Maya/Maribank, reference) →
   `REFUNDED` + receipt email. A cheaper-swap `PRICE_DIFFERENCE` refund settles `refundOwed` and
   leaves the order `CONFIRMED` (surfaced by `?refundOwed=true`).
5. **Cancel** (head only) — cancels a live order (not resolution-track); restores stock if `stockHeld`.
6. **Resend** — `POST …/resend-email` re-sends the current-status email if a send silently failed
   (watch `lastNotificationOk === false` / `lastNotifiedAt` in the queue).

## Key invariants

- **Stock is decremented when an order becomes fulfillable** — at `CONFIRMED`, or at swap-acceptance
  for an already-paid order — via `updateMany({ where: { id, stock: { gte: qty } } })`, never
  read-then-write. `stockHeld` records whether an order holds stock (so cancel restores correctly).
  Because payment precedes verification, overselling is still possible; the losing confirm routes
  its order to `AWAITING_RESOLUTION` rather than rejecting a paid student (structural prevention
  proposed in issue #178).
- **A paid student is never told to "resubmit" for a sold-out item** — that path is a swap or refund,
  not a rejection; `OUT_OF_STOCK` auto-reroutes and `AWAITING_RESOLUTION` is not resubmittable.
- **The org never keeps a student's money silently** — a cheaper swap refunds 100% of the difference;
  a pricier swap asks the student to confirm before topping up (never a surprise charge).
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
- **Resolution links are unguessable + single-use:** the swap/refund link carries a 32-byte token
  stored only as its SHA-256 hash (14-day TTL). The token is the proof of ownership, so no email
  check is needed; each action consumes it, and expiry is never terminal (Finance can resend/regenerate).
- Every finance mutation writes a tamper-evident `MERCH_*` audit entry.

## Self-service resolution (§8d)

An oversold `AWAITING_RESOLUTION` order emails the student two CTAs — **Choose Another Size** and
**Request a refund** — both pointing at `${FRONTEND_URL}/merch/resolve/:token`:

- **Swap** (`POST …/resolve/:token/swap`): same-item variants only. Same price → `CONFIRMED`.
  Cheaper → `CONFIRMED` and 100% of the difference is refunded (`refundOwed`, settled by a
  `PRICE_DIFFERENCE` refund). Pricier → the student must acknowledge, stock is held, and the order
  waits in `AWAITING_PAYMENT` for a top-up of just the difference.
- **Refund** (`POST …/resolve/:token/refund`): records the request; a head then records the `FULL`
  refund → `REFUNDED`.

Reminder emails (e.g. a day-7 nudge before expiry) are **deferred** to a scheduled job — see issue
**#181**. Expiry is safe without it: the order stays `AWAITING_RESOLUTION` and Finance can
regenerate a link.

## Configuration

- `GCASH_NUMBER`, `GCASH_QR_IMAGE_URL` — org GCash details (see `.env.example`). Order creation
  returns 503 until both are set.
- `merch_shop_open` — global open/close toggle.

See [`docs/api/v2/merch.md`](../../../api/v2/merch.md) for the full endpoint reference.
