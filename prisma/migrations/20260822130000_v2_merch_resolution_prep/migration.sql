-- V2 Module 04 — Merch resolution groundwork (§8a/§8b/§8c/§8e).
-- Renames the oversell state to AWAITING_RESOLUTION (a student can swap OUT of
-- it, so "refund pending" overstated it), adds top-up / refund-owed / stock-held
-- columns, extends refund methods, and lets an order hold one FULL and one
-- PRICE_DIFFERENCE refund. Additive + a safe in-place enum rename; no data loss.

-- ── Rename MerchOrderStatus.REFUND_PENDING → AWAITING_RESOLUTION ─────────────
-- Done in 3 steps: a single Prisma-style `MODIFY` that dropped the old value in
-- one shot would truncate any row still holding it. Widen first, migrate rows,
-- then narrow.

-- Step 1: widen the enum to hold BOTH the old and new value.
ALTER TABLE `MerchOrder`
    MODIFY `status` ENUM('AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'CONFIRMED', 'PAID_AND_CLAIMED', 'REJECTED', 'REFUND_PENDING', 'AWAITING_RESOLUTION', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT';

-- Step 2: migrate existing rows to the new value.
UPDATE `MerchOrder` SET `status` = 'AWAITING_RESOLUTION' WHERE `status` = 'REFUND_PENDING';

-- Step 3: narrow the enum to the final set (drops REFUND_PENDING).
ALTER TABLE `MerchOrder`
    MODIFY `status` ENUM('AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'CONFIRMED', 'PAID_AND_CLAIMED', 'REJECTED', 'AWAITING_RESOLUTION', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT';

-- ── New MerchOrder columns (§8b/§8c/§8e) ─────────────────────────────────────
ALTER TABLE `MerchOrder`
    ADD COLUMN `shortfallAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `refundOwed` DECIMAL(10, 2) NULL,
    ADD COLUMN `stockHeld` BOOLEAN NOT NULL DEFAULT false;

-- Backfill stockHeld: any order that already committed stock is holding it.
UPDATE `MerchOrder` SET `stockHeld` = true WHERE `status` IN ('CONFIRMED', 'PAID_AND_CLAIMED');

-- ── New PaymentProofSubmission top-up columns (§8b) ──────────────────────────
ALTER TABLE `PaymentProofSubmission`
    ADD COLUMN `isTopUp` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `shortfallAmount` DECIMAL(10, 2) NULL;

-- ── Extend refund methods (§8c) ──────────────────────────────────────────────
ALTER TABLE `MerchRefund`
    MODIFY `method` ENUM('GCASH', 'CASH', 'MAYA', 'MARIBANK', 'OTHER') NOT NULL;

-- ── Refund type + one-of-each-kind uniqueness (§8c) ──────────────────────────
ALTER TABLE `MerchRefund`
    ADD COLUMN `type` ENUM('FULL', 'PRICE_DIFFERENCE') NOT NULL DEFAULT 'FULL';

-- Replace the one-refund-per-order constraint with one-per-(order,type).
-- The orderId unique index backs the FK, so drop the FK first, swap the index,
-- then re-add the FK.
ALTER TABLE `MerchRefund` DROP FOREIGN KEY `MerchRefund_orderId_fkey`;
DROP INDEX `MerchRefund_orderId_key` ON `MerchRefund`;
CREATE UNIQUE INDEX `MerchRefund_orderId_type_key` ON `MerchRefund`(`orderId`, `type`);
ALTER TABLE `MerchRefund` ADD CONSTRAINT `MerchRefund_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `MerchOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
