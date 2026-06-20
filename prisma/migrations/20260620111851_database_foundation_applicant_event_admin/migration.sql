/*
  Warnings:

  - You are about to alter the column `status` on the `applicant` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.
  - You are about to alter the column `type` on the `event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.
  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(0))`.
  - A unique constraint covering the columns `[eventId,userId]` on the table `Registration` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `applicant` MODIFY `status` ENUM('APPLIED', 'INTERVIEWING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'APPLIED';

-- AlterTable
ALTER TABLE `event` MODIFY `type` ENUM('PUBLIC', 'MEMBERS_ONLY') NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('ADMIN', 'MEMBER', 'STUDENT') NOT NULL DEFAULT 'STUDENT';

-- CreateIndex
CREATE UNIQUE INDEX `Registration_eventId_userId_key` ON `Registration`(`eventId`, `userId`);
