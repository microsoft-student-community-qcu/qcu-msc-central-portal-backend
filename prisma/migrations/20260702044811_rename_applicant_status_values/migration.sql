/*
  Warnings:

  - You are about to alter the column `status` on the `applicant` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(0))` to `Enum(EnumId(3))`.

*/
-- AlterTable
ALTER TABLE `applicant` MODIFY `status` ENUM('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW';
