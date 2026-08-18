-- V2 Flow 1/2/6: event venue, registration deadline, banner, QR flag,
-- manual registration toggle, QCU_STUDENTS_ONLY tier, and registration
-- course / year level capture.

-- Event: new V2 columns
ALTER TABLE `Event`
  ADD COLUMN `venue` VARCHAR(191) NULL,
  ADD COLUMN `registrationDeadline` DATETIME(3) NULL,
  ADD COLUMN `bannerImageUrl` VARCHAR(191) NULL,
  ADD COLUMN `requiresQrTicket` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `isRegistrationOpen` BOOLEAN NOT NULL DEFAULT true;

-- Event: the tiered priority/general window is deprecated in V2 and no
-- longer enforced. Relaxed to NULL-able so new events can omit it.
ALTER TABLE `Event`
  MODIFY `priorityStartDate` DATETIME(3) NULL,
  MODIFY `generalStartDate` DATETIME(3) NULL;

-- Event: backfill registrationDeadline for existing rows so the new gate
-- does not immediately close registration on legacy events.
UPDATE `Event` SET `registrationDeadline` = `date` WHERE `registrationDeadline` IS NULL;

-- EventType: add the QCU_STUDENTS_ONLY tier.
ALTER TABLE `Event`
  MODIFY `type` ENUM('PUBLIC', 'QCU_STUDENTS_ONLY', 'MEMBERS_ONLY') NOT NULL DEFAULT 'PUBLIC';

-- Registration: capture course and year level.
ALTER TABLE `Registration`
  ADD COLUMN `course` VARCHAR(191) NULL,
  ADD COLUMN `yearLevel` VARCHAR(191) NULL;
