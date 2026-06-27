-- AlterTable
ALTER TABLE `registration` ADD COLUMN `manual_registration` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `status` ENUM('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN `studentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('APPLICANT', 'MEMBER', 'ADMIN_HR', 'ADMIN_LOGISTICS') NOT NULL DEFAULT 'APPLICANT';

-- CreateIndex
CREATE UNIQUE INDEX `Registration_eventId_studentId_key` ON `Registration`(`eventId`, `studentId`);

