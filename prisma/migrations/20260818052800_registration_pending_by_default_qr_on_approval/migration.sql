-- Registrations now enter the pipeline as PENDING_REVIEW and receive a QR
-- payload only when an ADMIN_LOGISTICS officer approves them.

-- 1. Default status becomes PENDING_REVIEW (was APPROVED).
ALTER TABLE `Registration`
  MODIFY `status` ENUM('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW';

-- 2. qrPayload becomes nullable — it is null until approval.
ALTER TABLE `Registration`
  MODIFY `qrPayload` VARCHAR(191) NULL;

-- 3. Backfill: clear the QR payload of any registration that is not APPROVED,
--    so pre-existing pending/rejected rows cannot be used to check in.
UPDATE `Registration` SET `qrPayload` = NULL WHERE `status` <> 'APPROVED';
