-- V2 Module 04 — Per-variant pricing + self-service resolution (§8d, Option A).
-- Adds an optional per-size price override, a refund-requested marker on the
-- order, and the MerchOrderResolutionToken table backing the swap/refund links.
-- Fully additive; no data loss.

-- ── Per-variant price override (§8, Option A) ────────────────────────────────
-- NULL = use the parent item's price; set = overrides it (e.g. an XL surcharge).
ALTER TABLE `MerchVariant`
    ADD COLUMN `price` DECIMAL(10, 2) NULL;

-- ── Refund-requested marker (§8d) ────────────────────────────────────────────
ALTER TABLE `MerchOrder`
    ADD COLUMN `refundRequestedAt` DATETIME(3) NULL;

-- ── Self-service resolution tokens (§8d) ─────────────────────────────────────
CREATE TABLE `MerchOrderResolutionToken` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MerchOrderResolutionToken_tokenHash_key`(`tokenHash`),
    INDEX `MerchOrderResolutionToken_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchOrderResolutionToken` ADD CONSTRAINT `MerchOrderResolutionToken_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `MerchOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
