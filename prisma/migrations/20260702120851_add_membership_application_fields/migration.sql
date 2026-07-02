-- CreateEnum
ALTER TABLE `Applicant` ADD COLUMN `campus` ENUM('SAN_BARTOLOME_MAIN', 'SAN_FRANCISCO', 'BATASAN') NOT NULL;

-- AlterTable: Remove old columns
ALTER TABLE `Applicant` DROP COLUMN `departmentChoice`, DROP COLUMN `resumeLink`, DROP COLUMN `githubLink`;

-- AlterTable: Add new columns
ALTER TABLE `Applicant` ADD COLUMN `college` VARCHAR(191) NOT NULL,
ADD COLUMN `program` VARCHAR(191) NOT NULL,
ADD COLUMN `section` VARCHAR(191) NOT NULL,
ADD COLUMN `dateOfBirth` DATETIME(3) NOT NULL,
ADD COLUMN `placeOfBirth` VARCHAR(191) NOT NULL,
ADD COLUMN `gender` ENUM('MALE', 'FEMALE', 'LGBTQIA', 'PREFER_NOT_TO_SAY') NOT NULL,
ADD COLUMN `membershipRole` VARCHAR(191) NOT NULL,
ADD COLUMN `certificateOfRegistration` VARCHAR(191) NOT NULL,
ADD COLUMN `curriculumVitae` VARCHAR(191) NOT NULL,
ADD COLUMN `houseAddress` VARCHAR(191) NOT NULL,
ADD COLUMN `cellphoneNumber` VARCHAR(191) NOT NULL,
ADD COLUMN `qcuMscEmail` VARCHAR(191) NOT NULL,
ADD COLUMN `facebookLink` VARCHAR(191) NOT NULL,
ADD COLUMN `interestsSkillsHobbies` TEXT NOT NULL,
ADD COLUMN `organizationHistory` TEXT NOT NULL,
ADD COLUMN `portfolio` VARCHAR(191),
ADD COLUMN `githubOrProjectLinks` VARCHAR(191),
ADD COLUMN `previousWorksAchievements` TEXT;

-- CreateIndex
CREATE UNIQUE INDEX `Applicant_qcuMscEmail_key` ON `Applicant`(`qcuMscEmail`);
