# Data Model — Merch (Pre-Orders)

## Overview

Data models for the **V2 Module 04 — Org Merch Pre-Orders** (Finance). A merch drop is a
catalog of `MerchItem`s, each with one or more sellable `MerchVariant`s (sizes). Students place
a `MerchOrder` and pay offline via GCash; every payment-proof upload is recorded as a
`PaymentProofSubmission` for a tamper-resistant audit trail.

Stock lives on the variant and is **decremented when an order becomes fulfillable** — at
`CONFIRMED`, or when an already-paid order accepts a pricier resolution swap (§8). It is never
reserved at order time (PRD-V2 Finance Flow 2). Because payment happens before verification, an
item can oversell: a paid order that can't be fulfilled moves to `AWAITING_RESOLUTION`, where the
student chooses a variant swap or a refund (closed out with a `MerchRefund`; see #178 for the
structural-prevention proposal).

## Prisma Definitions

```prisma
model MerchItem {
  id                String          @id @default(uuid())
  name              String
  description       String          @db.Text
  price             Decimal         @db.Decimal(10, 2) // PHP
  status            MerchItemStatus @default(ACTIVE)
  photos            Json            @default("[]") // Array of Blob image URLs
  lowStockThreshold Int             @default(10)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  variants          MerchVariant[]

  @@index([status])
}

model MerchVariant {
  id        String       @id @default(uuid())
  itemId    String
  item      MerchItem    @relation(fields: [itemId], references: [id], onDelete: Cascade)
  label     String
  price     Decimal?     @db.Decimal(10, 2) // Optional per-size override (§8); null → item price
  stock     Int          @default(0)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  orders    MerchOrder[]

  @@unique([itemId, label])
  @@index([itemId])
}

model MerchOrder {
  id                 String                   @id @default(uuid())
  orderRef           String                   @unique // MSC-MERCH-YYYY-NNNN
  userId             String?
  user               User?                    @relation(fields: [userId], references: [id], onDelete: SetNull)
  studentName        String
  studentId          String?
  email              String
  gcashNumber        String?
  variantId          String
  variant            MerchVariant             @relation(fields: [variantId], references: [id])
  quantity           Int
  amount             Decimal                  @db.Decimal(10, 2)
  status             MerchOrderStatus         @default(AWAITING_PAYMENT)
  rejectionReason    MerchRejectionReason? // Latest reason (denormalised from newest submission)
  financeNote        String?                  @db.Text
  shortfallAmount    Decimal?                 @db.Decimal(10, 2) // Top-up owed by student (§8b)
  refundOwed         Decimal?                 @db.Decimal(10, 2) // Difference owed to student after a cheaper swap (§8c)
  refundRequestedAt  DateTime? // Set when the student picks "refund" on the resolution page (§8d)
  stockHeld          Boolean                  @default(false) // Whether this order currently holds decremented stock (§8e)
  lastNotifiedAt     DateTime? // Time of most recent status-email attempt (§7b)
  lastNotificationOk Boolean? // Whether that attempt actually sent
  notificationCount  Int                      @default(0) // Count of successful status emails
  createdAt          DateTime                 @default(now())
  updatedAt          DateTime                 @updatedAt
  proofSubmissions   PaymentProofSubmission[]
  refunds            MerchRefund[] // FULL and/or PRICE_DIFFERENCE payouts (§8c)

  @@index([status])
  @@index([email])
  @@index([studentId])
  @@index([userId])
}

model PaymentProofSubmission {
  id              String                @id @default(uuid())
  orderId         String
  order           MerchOrder            @relation(fields: [orderId], references: [id], onDelete: Cascade)
  screenshotPath  String
  referenceNumber String
  result          PaymentProofResult // Automated intake outcome
  officerDecision PaymentProofDecision  @default(PENDING) // Human review of this attempt (§7b)
  rejectionReason MerchRejectionReason? // Officer's reason when REJECTED
  financeNote     String?               @db.Text
  isTopUp         Boolean               @default(false) // Pays only the outstanding difference (§8b)
  shortfallAmount Decimal?              @db.Decimal(10, 2) // Amount this top-up was meant to cover
  reviewedById    String? // Actor who reviewed this attempt
  reviewedAt      DateTime?
  createdAt       DateTime              @default(now())

  @@index([orderId])
  @@index([referenceNumber])
}

model MerchRefund {
  id              String            @id @default(uuid())
  orderId         String
  order           MerchOrder        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type            MerchRefundType   @default(FULL) // FULL (oversell) or PRICE_DIFFERENCE (cheaper swap)
  amount          Decimal           @db.Decimal(10, 2) // ≤ order.amount
  method          MerchRefundMethod
  referenceNumber String?
  note            String?           @db.Text
  processedById   String? // Actor (head) who recorded the refund
  processedAt     DateTime          @default(now())

  @@unique([orderId, type])
}

model MerchOrderResolutionToken {
  id         String     @id @default(uuid())
  orderId    String
  order      MerchOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  tokenHash  String     @unique // SHA-256 of the raw token (raw is never stored)
  expiresAt  DateTime   // 14-day TTL
  consumedAt DateTime?  // Set when a swap/refund completes through this link
  createdAt  DateTime   @default(now())

  @@index([orderId])
}
```

## Enums

| Enum | Values | Notes |
|------|--------|-------|
| `MerchItemStatus` | `ACTIVE`, `ARCHIVED` | ARCHIVED hides the item from the public catalog but preserves order history |
| `MerchOrderStatus` | `AWAITING_PAYMENT`, `PENDING_VERIFICATION`, `CONFIRMED`, `PAID_AND_CLAIMED`, `REJECTED`, `AWAITING_RESOLUTION`, `REFUNDED`, `CANCELLED` | Lifecycle per Flows 2–5. Stock decremented at `CONFIRMED` (or a pricier resolution swap). `AWAITING_RESOLUTION` = paid but unfulfillable (oversold) — student swaps or refunds; `REFUNDED` = full refund recorded |
| `MerchRejectionReason` | `REFERENCE_NOT_FOUND`, `AMOUNT_MISMATCH`, `SCREENSHOT_UNCLEAR`, `DUPLICATE_REFERENCE`, `OUT_OF_STOCK`, `OTHER` | `OTHER` pairs with free-text `financeNote`; `AMOUNT_MISMATCH` pairs with `shortfallAmount`. `OUT_OF_STOCK` is not a rejection — it auto-reroutes to `AWAITING_RESOLUTION` |
| `PaymentProofResult` | `ACCEPTED`, `DUPLICATE_REJECTED` | Automated intake outcome of a single submission attempt |
| `PaymentProofDecision` | `PENDING`, `VERIFIED`, `REJECTED` | Officer's review decision on a single submission (§7b); distinct from the automated `result` |
| `MerchRefundMethod` | `GCASH`, `CASH`, `MAYA`, `MARIBANK`, `OTHER` | How an offline refund was issued. `OTHER` requires an explanatory note |
| `MerchRefundType` | `FULL`, `PRICE_DIFFERENCE` | `FULL` = whole payment returned (oversell refund); `PRICE_DIFFERENCE` = overpaid difference after a cheaper swap |

## Field Notes

- **`MerchItem.photos`** — JSON array of stored **filenames** (`item-<uuid>.<ext>`), not blob URLs. MySQL has no scalar string arrays, so JSON is used; the app always sets it (defaults to `[]`). Serializers turn filenames into absolute proxy URLs (`/api/v2/merch/photos/:filename`) because the blob container is private. Legacy rows storing full URLs still resolve (the serializer passes absolute URLs through unchanged).
- **`MerchItem.price` / `MerchVariant.price` / `MerchOrder.amount`** — `Decimal(10,2)`, never `Float`. A variant may override the item price (§8, e.g. an "XL" surcharge); the **effective** unit price is `variant.price ?? item.price`. `amount` snapshots `effectivePrice × quantity` at order time so later edits don't rewrite historical orders.
- **`MerchOrder.orderRef`** — human-facing tracking ID, format `MSC-MERCH-YYYY-NNNN`, unique. Sequential/predictable by design; anti-enumeration relies on the required order email (see #178 discussion for the accepted trade-off).
- **`MerchOrder.userId`** — set when the buyer was logged in; guest fields are always stored regardless.
- **`MerchOrder.gcashNumber`** — recorded for reference only; verification hinges on `referenceNumber`, not on whose GCash paid.
- **`MerchOrder.rejectionReason`** — denormalised "latest" reason; the authoritative per-attempt history lives on `PaymentProofSubmission`.
- **`MerchOrder.shortfallAmount`** (§8b) — the exact top-up a student still owes after an `AMOUNT_MISMATCH` rejection (or a pricier resolution swap). The student pays only this, not the whole order again. Cleared on `CONFIRMED`.
- **`MerchOrder.refundOwed`** (§8c) — money the org owes the student after a cheaper-variant swap. The order stays `CONFIRMED`; Finance clears it by recording a `PRICE_DIFFERENCE` `MerchRefund`. Surfaced by the `?refundOwed=true` queue filter.
- **`MerchOrder.stockHeld`** (§8e) — authoritative flag for "this order holds decremented stock". Set on confirm (or a pricier already-paid swap), cleared on cancel/restore. Replaces inferring stock-held from status, which broke once stock can be held while `AWAITING_PAYMENT` (top-up).
- **`MerchOrder.refundRequestedAt`** (§8d) — set when the student picks "refund" on the resolution page. The order stays `AWAITING_RESOLUTION`; a head then records the `FULL` refund. Distinguishes "wants a refund" from "still deciding".
- **`MerchOrderResolutionToken`** (§8d) — unguessable single-use link for an oversold student to self-serve a swap or refund without an account. Only the SHA-256 hash is stored (password-reset precedent); 14-day TTL; minting deletes prior unconsumed tokens for the order. Expiry is never terminal — the order stays `AWAITING_RESOLUTION` and Finance can regenerate.
- **`MerchOrder.lastNotifiedAt` / `lastNotificationOk` / `notificationCount`** (§7b) — merch email senders return a boolean; these record the latest attempt so Finance can spot silently-failed notifications (`lastNotificationOk === false`) and re-send.
- **`PaymentProofSubmission.officerDecision`** (§7b) — the officer's decision on **that specific attempt**, so a later resubmission never erases why an earlier attempt failed. `result` (automated) and `officerDecision` (human) are independent: a `DUPLICATE_REJECTED` attempt is terminal via `result` and never reaches an officer.
- **`PaymentProofSubmission.isTopUp` / `shortfallAmount`** (§8b) — mark a submission that pays only the outstanding difference (not the full amount) and snapshot how much it was meant to cover, so the attempt timeline reads correctly.
- **`PaymentProofSubmission.referenceNumber`** — indexed but **not unique**: a duplicate reference is the exact event we must record, so a unique constraint would block the write that logs the violation. Duplicate detection is enforced in application code across all orders and submissions.
- **`MerchRefund`** — up to one `FULL` and one `PRICE_DIFFERENCE` per order (`@@unique([orderId, type])`). A dedicated record (rather than a note on the order) keeps refund amount, method, and reference transparently auditable. A `FULL` refund (head-only) moves an oversold order `AWAITING_RESOLUTION → REFUNDED`; a `PRICE_DIFFERENCE` refund settles a cheaper swap and leaves the order `CONFIRMED`.

## Relationships

```
MerchItem (1) ──→ (Many) MerchVariant        [cascade delete]
MerchVariant (1) ──→ (Many) MerchOrder       [restrict delete — orders pin variants]
MerchOrder (1) ──→ (Many) PaymentProofSubmission [cascade delete]
MerchOrder (1) ──→ (0..2) MerchRefund         [cascade delete — one FULL + one PRICE_DIFFERENCE]
MerchOrder (1) ──→ (Many) MerchOrderResolutionToken [cascade delete]
User (0 or 1) ──→ (Many) MerchOrder          [SetNull on user delete]
```

**Cascade rules:**
- Deleting a `MerchItem` cascades to its `MerchVariant`s.
- Deleting a `MerchOrder` cascades to its `PaymentProofSubmission`s, `MerchRefund`s, and resolution tokens.
- A `MerchVariant` cannot be deleted while orders reference it (`RESTRICT`) — archive the parent item instead.
- Deleting a `User` sets `MerchOrder.userId` to null (order record retained).

## Indexes

| Table | Index | Type |
|-------|-------|------|
| `MerchItem` | `status` | Index |
| `MerchVariant` | `[itemId, label]` | Unique composite |
| `MerchVariant` | `itemId` | Index |
| `MerchOrder` | `orderRef` | Unique |
| `MerchOrder` | `status`, `email`, `studentId`, `userId` | Index (each) |
| `PaymentProofSubmission` | `orderId`, `referenceNumber` | Index (each) |
| `MerchRefund` | `orderId` | Unique |

## Related

- Module spec: [`docs/modules/v2/04-merch-pre-orders.md`](../../modules/v2/04-merch-pre-orders.md)
- API: [`docs/api/v2/merch.md`](../../api/v2/merch.md)
- Audit: every finance mutation emits a `MERCH_*` entry — see [`audit-log.md`](audit-log.md)
- Toggle: `merch_shop_open` in [`system-setting.md`](system-setting.md)
