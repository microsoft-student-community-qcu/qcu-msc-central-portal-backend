-- V2 Module 04 — Org Merch Pre-Orders (Finance).
-- Adds the merch catalog (item + variants) and the offline GCash pre-order
-- flow (orders + payment-proof audit trail). Purely additive.

-- CreateTable
CREATE TABLE `MerchItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `photos` JSON NOT NULL,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MerchItem_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchVariant` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MerchVariant_itemId_idx`(`itemId`),
    UNIQUE INDEX `MerchVariant_itemId_label_key`(`itemId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchOrder` (
    `id` VARCHAR(191) NOT NULL,
    `orderRef` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `studentName` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `gcashNumber` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'CONFIRMED', 'PAID_AND_CLAIMED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT',
    `rejectionReason` ENUM('REFERENCE_NOT_FOUND', 'AMOUNT_MISMATCH', 'SCREENSHOT_UNCLEAR', 'DUPLICATE_REFERENCE', 'OUT_OF_STOCK', 'OTHER') NULL,
    `financeNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MerchOrder_orderRef_key`(`orderRef`),
    INDEX `MerchOrder_status_idx`(`status`),
    INDEX `MerchOrder_email_idx`(`email`),
    INDEX `MerchOrder_studentId_idx`(`studentId`),
    INDEX `MerchOrder_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentProofSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `screenshotPath` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NOT NULL,
    `result` ENUM('ACCEPTED', 'DUPLICATE_REJECTED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentProofSubmission_orderId_idx`(`orderId`),
    INDEX `PaymentProofSubmission_referenceNumber_idx`(`referenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchVariant` ADD CONSTRAINT `MerchVariant_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `MerchItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchOrder` ADD CONSTRAINT `MerchOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchOrder` ADD CONSTRAINT `MerchOrder_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `MerchVariant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentProofSubmission` ADD CONSTRAINT `PaymentProofSubmission_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `MerchOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
