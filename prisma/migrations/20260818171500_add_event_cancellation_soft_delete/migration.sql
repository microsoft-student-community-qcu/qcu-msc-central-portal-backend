-- AlterTable
-- Event cancellation soft delete (V2 Flow 8).
-- Cancelling an event never destroys rows: the Event and its Registrations are
-- preserved for audit/reporting; the public feed filters on `isCancelled`.
ALTER TABLE `event` ADD COLUMN `isCancelled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `cancellationReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL;

-- CreateIndex
-- The public feed filters on isCancelled and orders by date on every request.
CREATE INDEX `Event_isCancelled_date_idx` ON `event`(`isCancelled`, `date`);
