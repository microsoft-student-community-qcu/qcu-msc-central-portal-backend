/*
  Warnings:

  - Added the required column `updatedAt` to the `Registration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `registration` ADD COLUMN `updatedAt` DATETIME(3) NULL;
UPDATE `registration` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `registration` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;
