/*
  Warnings:

  - You are about to drop the `_applicant_legacy_office_backup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX `AuditLog_createdAt_idx` ON `auditlog`;

-- DropTable
DROP TABLE `_applicant_legacy_office_backup`;

-- CreateIndex
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt` DESC);
