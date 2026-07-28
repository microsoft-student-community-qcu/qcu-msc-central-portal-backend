-- Drop the unique index first (must precede column drop)
DROP INDEX `Applicant_qcuMscEmail_key` ON `Applicant`;

-- Remove the qcuMscEmail column
ALTER TABLE `Applicant` DROP COLUMN `qcuMscEmail`;
