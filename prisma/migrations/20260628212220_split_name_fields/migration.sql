/*
  Warnings:

  - You are about to drop the column `name` on the `applicant` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `registration` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `user` table. All the data in the column will be lost.
  - Added the required column `firstName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `applicant` DROP COLUMN `name`,
    ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `idImagePath` VARCHAR(191) NULL,
    ADD COLUMN `lastName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `manual_application` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `middleInitial` VARCHAR(191) NULL,
    ADD COLUMN `studentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `registration` DROP COLUMN `name`,
    ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `lastName` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `middleInitial` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `name`,
    ADD COLUMN `firstName` VARCHAR(191) NOT NULL,
    ADD COLUMN `lastName` VARCHAR(191) NOT NULL,
    ADD COLUMN `middleInitial` VARCHAR(191) NULL;
