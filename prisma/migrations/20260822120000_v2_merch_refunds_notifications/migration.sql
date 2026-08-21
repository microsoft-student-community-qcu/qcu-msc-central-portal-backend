-- V2 Module 04 — Merch refunds + operability (§7a/§7b).
-- Additive: adds refund states + MerchRefund record, per-submission officer
-- decision fields, and order notification-tracking columns. No data loss.

-- AlterTable — new order lifecycle states (REFUND_PENDING, REFUNDED)
ALTER TABLE `MerchOrder`
    MODIFY `status` ENUM('AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'CONFIRMED', 'PAID_AND_CLAIMED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT';

-- AlterTable — notification tracking (§7b)
ALTER TABLE `MerchOrder`
    ADD COLUMN `lastNotifiedAt` DATETIME(3) NULL,
    ADD COLUMN `lastNotificationOk` BOOLEAN NULL,
    ADD COLUMN `notificationCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable — per-submission officer decision history (§7b)
ALTER TABLE `PaymentProofSubmission`
    ADD COLUMN `officerDecision` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `rejectionReason` ENUM('REFERENCE_NOT_FOUND', 'AMOUNT_MISMATCH', 'SCREENSHOT_UNCLEAR', 'DUPLICATE_REFERENCE', 'OUT_OF_STOCK', 'OTHER') NULL,
    ADD COLUMN `financeNote` TEXT NULL,
    ADD COLUMN `reviewedById` VARCHAR(191) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL;

-- CreateTable — dedicated offline refund record (§7a)
CREATE TABLE `MerchRefund` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('GCASH', 'CASH', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `processedById` VARCHAR(191) NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MerchRefund_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchRefund` ADD CONSTRAINT `MerchRefund_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `MerchOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
