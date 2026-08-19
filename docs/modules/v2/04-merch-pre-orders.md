# Module 04 — Org Merch Pre-Orders (Finance)

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Org Merch Pre-Orders (Offline Payments) |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Org Merch Pre-Orders; PRD Module 1 (Finance) Flows 1–5 |
| **Milestone** | M2 — Merch |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Module 01 (guards + audit), Module 02 (email engine, QR generation) |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| Any student (guest or member) | Browses catalog, submits pre-orders, pays via GCash, tracks order status |
| `ADMIN_FINANCE` | Manages catalog, verifies GCash payments, marks orders claimed at pickup |
| `ADMIN_FINANCE_HEAD` | Everything Finance officers can do, plus: archives items, cancels orders at any stage, views analytics |
| `SUPERADMIN` | Full access |

> All financial transactions are handled **physically** — no online payment processing. GCash number + reference number are for verification only.

## 3. Workflows

### Flow 1 — Finance Officer Adds Merch to Catalog

Upload product photos (front/back/detail), name, description, PHP price, sizes/variants with stock quantities. Item goes live immediately (no approval needed). Any officer can edit (title, description, photos, price, variant stock). Head can archive/remove items while preserving past order records.

### Flow 2 — Student Pre-Orders and Receives a Payment QR

Catalog is public (no login). Item pages show photos, variant availability, live stock, "Low Stock" indicator. On pre-order: logged-in Member/Applicant → name/student ID/email pre-filled; guest → full name, QCU Student ID, email, GCash number entered manually. Select variant + quantity.

**Real-time stock check on submit:** if variant went out of stock since page load → error *"Sorry, the selected size is no longer available. Please choose a different size or check back later."* Other form data preserved.

On success:
1. Payment screen: official GCash QR (org GCash number + exact amount), unique Order Reference ID (e.g. `MSC-MERCH-2026-0042`), instruction to scan and return with the GCash reference number.
2. Confirmation email with same QR, order details, instructions, tracking link.

Order status: **AWAITING_PAYMENT**. **Stock is not reserved yet** — locked only at CONFIRMED.

### Flow 3 — Student Submits Screenshot + Reference Number

Student uploads GCash transaction screenshot + the 13-digit GCash Reference Number.

**Duplicate reference check (instant):** if the reference number exists on any other order (any status) → order auto-moved to **REJECTED** with reason `DUPLICATE_REFERENCE` + email. No officer review.

Unique → status **PENDING_VERIFICATION** + confirmation email. Multiple pre-orders per student allowed (each independent). Using another person's GCash is permitted — the reference number is what matters.

### Flow 4 — Finance Officer Verifies or Rejects

PENDING_VERIFICATION queue shows: student name/ID, item+variant, amount, GCash number, reference number, screenshot thumbnail. Officer checks their GCash app: (1) reference exists, (2) amount matches.

- **Confirm Payment** → **CONFIRMED**: variant stock decremented by quantity; student emailed pickup instructions.
- **Reject** → **REJECTED** with reason from preset list: reference not found / amount mismatch / screenshot unclear / other (free text). Student emailed the reason + "Resubmit Payment Proof" button. Order record reused — no new pre-order needed. Every submission attempt logged with timestamp (audit trail). Resubmit re-enters PENDING_VERIFICATION with the same checks. No resubmit cap; officers can cancel a repeatedly problematic order.

### Flow 5 — Physical Pickup and Final Claim

Officer finds CONFIRMED order, clicks **"Mark as Claimed"** → **PAID_AND_CLAIMED**; final receipt email sent.

## 4. Acceptance Criteria & Edge Cases

- [ ] Public catalog with pricing, sizes, live stock
- [ ] Reservation form with explicit offline-payment warning
- [ ] Finance tracker with transition to "Paid & Claimed"
- [ ] Stock limits: "Reserve" disabled + "Out of Stock" badge at threshold
- **Wrong amount paid:** REJECTED with reason; student resends correct amount + new reference; original handled offline.
- **Duplicate GCash reference:** instant auto-reject, no officer review.
- **Stock runs out between load and submit:** clear error, other fields preserved.
- **Stock runs out while AWAITING_PAYMENT:** no reservation at submit; officer rejects "Item out of stock" at confirm time if last unit claimed by another.
- **Head cancels confirmed order:** head-only; refund arranged offline; cancellation logged with head's note.

## 5. Data Model Impact

> Proposed — refine during build.

- **Models:**
  - `MerchItem` — name, description, price (PHP), `status` (`ACTIVE`/`ARCHIVED`), photos (array/paths), low-stock threshold, timestamps
  - `MerchVariant` — `itemId` FK, label/size, stock (Int), unique `[itemId, label]`
  - `MerchOrder` — `orderRef` (unique, `MSC-MERCH-YYYY-NNNN`), studentName, studentId, email, gcashNumber, `variantId` FK, quantity, amount, `status` (`AWAITING_PAYMENT`/`PENDING_VERIFICATION`/`CONFIRMED`/`PAID_AND_CLAIMED`/`REJECTED`/`CANCELLED`), rejectionReason, financeNote, timestamps
  - `PaymentProofSubmission` — `orderId` FK, screenshotPath, referenceNumber, result, createdAt (audit trail)
- **Indexes:** `MerchOrder.orderRef` unique; `PaymentProofSubmission.referenceNumber` (duplicate lookup)
- **Env/config:** org GCash number + amount encoding for payment QR (`.env.example`)

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| GET | `/api/v1/merch` | none | — | Public catalog (active items + variants + stock) |
| GET | `/api/v1/merch/:itemId` | none | — | Item detail |
| POST | `/api/v1/merch/orders` | none (branches auth) | apply | Pre-order; real-time stock check |
| GET | `/api/v1/merch/orders/:orderRef` | none (orderRef + email) | apply | Public order tracking |
| POST | `/api/v1/merch/orders/:orderRef/payment-proof` | none | apply | Screenshot + reference; duplicate auto-reject |
| POST | `/api/v1/admin/merch/items` | `requireAdminFinance` | — | Create item |
| PATCH | `/api/v1/admin/merch/items/:itemId` | `requireAdminFinance` | — | Edit item |
| POST | `/api/v1/admin/merch/items/:itemId/archive` | `requireAdminFinanceHead` | — | Archive (head only) |
| GET | `/api/v1/admin/merch/orders` | `requireAdminFinance` | — | Finance queue (PENDING_VERIFICATION + filters) |
| POST | `/api/v1/admin/merch/orders/:orderId/confirm` | `requireAdminFinance` | — | Decrement stock |
| POST | `/api/v1/admin/merch/orders/:orderId/reject` | `requireAdminFinance` | — | Preset reasons |
| POST | `/api/v1/admin/merch/orders/:orderId/claim` | `requireAdminFinance` | — | PAID_AND_CLAIMED + receipt email |
| POST | `/api/v1/admin/merch/orders/:orderId/cancel` | `requireAdminFinanceHead` | — | Head only |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Pre-order created | Payment QR + order details | Student |
| Payment proof received | Verification in progress | Student |
| Payment CONFIRMED | Pre-order secured + pickup instructions | Student |
| Payment REJECTED | Reason + resubmit button | Student |
| Duplicate reference | Auto-reject notice | Student |
| Order claimed | Final receipt | Student |
| Order cancelled (head) | Cancellation note | Student |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** `merch_shop_open` (global open/close)
- **AuditLog events:** `MERCH_ITEM_CREATED`, `MERCH_ITEM_EDITED`, `MERCH_ITEM_ARCHIVED`, `MERCH_ORDER_CONFIRMED`, `MERCH_ORDER_REJECTED`, `MERCH_ORDER_CLAIMED`, `MERCH_ORDER_CANCELLED`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Should `ADMIN_FINANCE_HEAD` be a separate role or a flag on `ADMIN_FINANCE`? (PRD lists it as separate role) | TBD | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Duplicate reference auto-rejects regardless of other order status
- [ ] Real-time stock check on submit; stock decrement only on CONFIRMED
- [ ] Archive preserves order records
- [ ] Head-only endpoints 403 for plain finance officers
- [ ] Docs updated (new merch data models + workflow guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Org Merch Pre-Orders; Module 1 (Finance) Flows 1–5
- Guides: `docs/guides/v2/workflows.md` (Merch topic) · V1 email baseline `docs/guides/v1/workflows/email-notifications.md`
- API: `docs/api/v2/`
- Data models: `docs/specs/data-models/` (new merch docs)