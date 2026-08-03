-- Drop legacy free-text `Applicant.membershipRole` rows before 20260729000548
-- converts the column to the `Office` enum.
--
-- `membershipRole` was VARCHAR(191) holding free-text labels from the previous
-- apply form ("Design & Creatives", "General Member", …). The
-- `CHANGE membershipRole office ENUM(...)` in 20260729000548 aborts with MySQL
-- error 1265 (Data truncated for column 'office') on any row whose value is not
-- an exact enum label, which blocks every later migration behind P3018.
-- Those rows are staging-only test submissions, so they are removed.
--
-- Guarded via dynamic SQL: on databases where 20260729000548 already applied,
-- the column is named `office` and this migration is a no-op.
--
-- No foreign keys point at `Applicant` — the User relation is stored on
-- `Applicant.userId` — so these deletes have no dependents.

SET @has_legacy_column = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Applicant'
    AND COLUMN_NAME = 'membershipRole'
);

-- Copy the doomed rows aside first. This migration also runs against
-- production, where the deletes are irreversible and the rows may not be test
-- data. Drop `_Applicant_legacy_office_backup` once the values are reviewed.
SET @backup_sql = IF(
  @has_legacy_column > 0,
  'CREATE TABLE IF NOT EXISTS `_Applicant_legacy_office_backup` AS SELECT * FROM `Applicant` WHERE `membershipRole` NOT IN (''SECRETARIAT_OFFICE'', ''RELATIONS_OFFICE'', ''FINANCE_OFFICE'', ''LOGISTICS_OFFICE'', ''CREATIVES_OFFICE'', ''MANAGEMENT_AND_DEVELOPMENT_OFFICE'', ''STARTUP_DEVELOPERS_OFFICE'')',
  'DO 0'
);

PREPARE backup_stmt FROM @backup_sql;
EXECUTE backup_stmt;
DEALLOCATE PREPARE backup_stmt;

SET @normalize_sql = IF(
  @has_legacy_column > 0,
  'DELETE FROM `Applicant` WHERE `membershipRole` NOT IN (''SECRETARIAT_OFFICE'', ''RELATIONS_OFFICE'', ''FINANCE_OFFICE'', ''LOGISTICS_OFFICE'', ''CREATIVES_OFFICE'', ''MANAGEMENT_AND_DEVELOPMENT_OFFICE'', ''STARTUP_DEVELOPERS_OFFICE'')',
  'DO 0'
);

PREPARE normalize_stmt FROM @normalize_sql;
EXECUTE normalize_stmt;
DEALLOCATE PREPARE normalize_stmt;
