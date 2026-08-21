-- Restore ApplicationDraft free-text fields to TEXT (schema uses @db.Text,
-- matching the Applicant model). The previously generated migration narrowed
-- these to VARCHAR(191), which would reject/truncate long user input.
-- AlterTable
ALTER TABLE `applicationdraft` MODIFY `interestsSkillsHobbies` TEXT NULL,
    MODIFY `organizationHistory` TEXT NULL,
    MODIFY `previousWorksAchievements` TEXT NULL;

-- DropTable
-- One-time backup table from the normalize_membership_role migration;
-- safe to drop. IF EXISTS guards the case where it was already removed.
DROP TABLE IF EXISTS `_applicant_legacy_office_backup`;