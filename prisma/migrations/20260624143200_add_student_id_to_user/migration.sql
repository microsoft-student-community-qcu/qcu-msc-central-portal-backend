-- AlterTable: Add studentId column to User table
ALTER TABLE `User` ADD COLUMN `studentId` VARCHAR(191) NOT NULL;

-- CreateIndex: Unique constraint on studentId
CREATE UNIQUE INDEX `User_studentId_key` ON `User`(`studentId`);
