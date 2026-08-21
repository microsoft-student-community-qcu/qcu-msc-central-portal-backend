# Data Model — Merch (Pre-Orders)

## Overview

Data models for the **V2 Module 04 — Org Merch Pre-Orders** (Finance). A merch drop is a
catalog of `MerchItem`s, each with one or more sellable `MerchVariant`s (sizes). Students place
a `MerchOrder` and pay offline via GCash; every payment-proof upload is recorded as a
`PaymentProofSubmission` for a tamper-resistant audit trail.

Stock lives on the variant and is **only decremented when an order reaches `CONFIRMED`** — it is
never reserved at order time (PRD-V2 Finance Flow 2).

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
  stock     Int          @default(0)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  orders    MerchOrder[]

  @@unique([itemId, label])
  @@index([itemId])
}

model MerchOrder {
  id               String                   @id @default(uuid())
  orderRef         String                   @unique // MSC-MERCH-YYYY-NNNN
  userId           String?
  user             User?                    @relation(fields: [userId], references: [id], onDelete: SetNull)
  studentName      String
  studentId        String?
  email            String
  gcashNumber      String?
  variantId        String
  variant          MerchVariant             @relation(fields: [variantId], references: [id])
  quantity         Int
  amount           Decimal                  @db.Decimal(10, 2)
  status           MerchOrderStatus         @default(AWAITING_PAYMENT)
  rejectionReason  MerchRejectionReason?
  financeNote      String?                  @db.Text
  createdAt        DateTime                 @default(now())
  updatedAt        DateTime                 @updatedAt
  proofSubmissions PaymentProofSubmission[]

  @@index([status])
  @@index([email])
  @@index([studentId])
  @@index([userId])
}

model PaymentProofSubmission {
  id              String             @id @default(uuid())
  orderId         String
  order           MerchOrder         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  screenshotPath  String
  referenceNumber String
  result          PaymentProofResult
  createdAt       DateTime           @default(now())

  @@index([orderId])
  @@index([referenceNumber])
}
```

## Enums

| Enum | Values | Notes |
|------|--------|-------|
| `MerchItemStatus` | `ACTIVE`, `ARCHIVED` | ARCHIVED hides the item from the public catalog but preserves order history |
| `MerchOrderStatus` | `AWAITING_PAYMENT`, `PENDING_VERIFICATION`, `CONFIRMED`, `PAID_AND_CLAIMED`, `REJECTED`, `CANCELLED` | Lifecycle per Flows 2–5. Stock decremented at `CONFIRMED` |
| `MerchRejectionReason` | `REFERENCE_NOT_FOUND`, `AMOUNT_MISMATCH`, `SCREENSHOT_UNCLEAR`, `DUPLICATE_REFERENCE`, `OUT_OF_STOCK`, `OTHER` | `OTHER` pairs with free-text `financeNote` |
| `PaymentProofResult` | `ACCEPTED`, `DUPLICATE_REJECTED` | Automated intake outcome of a single submission attempt |

## Field Notes

- **`MerchItem.photos`** — JSON array of Blob URLs. MySQL has no scalar string arrays, so JSON is used; the app always sets it (defaults to `[]`).
- **`MerchItem.price` / `MerchOrder.amount`** — `Decimal(10,2)`, never `Float`, to avoid floating-point money errors. `amount` is a snapshot of `price × quantity` at order time so later price edits don't rewrite historical orders.
- **`MerchOrder.orderRef`** — human-facing tracking ID, format `MSC-MERCH-YYYY-NNNN`, unique.
- **`MerchOrder.userId`** — set when the buyer was logged in; guest fields are always stored regardless.
- **`MerchOrder.gcashNumber`** — recorded for reference only; verification hinges on `referenceNumber`, not on whose GCash paid.
- **`PaymentProofSubmission.referenceNumber`** — indexed but **not unique**: a duplicate reference is the exact event we must record, so a unique constraint would block the write that logs the violation. Duplicate detection is enforced in application code across all orders and submissions.

## Relationships

```
MerchItem (1) ──→ (Many) MerchVariant        [cascade delete]
MerchVariant (1) ──→ (Many) MerchOrder       [restrict delete — orders pin variants]
MerchOrder (1) ──→ (Many) PaymentProofSubmission [cascade delete]
User (0 or 1) ──→ (Many) MerchOrder          [SetNull on user delete]
```

**Cascade rules:**
- Deleting a `MerchItem` cascades to its `MerchVariant`s.
- Deleting a `MerchOrder` cascades to its `PaymentProofSubmission`s.
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

## Related

- Module spec: [`docs/modules/v2/04-merch-pre-orders.md`](../../modules/v2/04-merch-pre-orders.md)
- API: [`docs/api/v2/merch.md`](../../api/v2/merch.md)
- Audit: every finance mutation emits a `MERCH_*` entry — see [`audit-log.md`](audit-log.md)
- Toggle: `merch_shop_open` in [`system-setting.md`](system-setting.md)
