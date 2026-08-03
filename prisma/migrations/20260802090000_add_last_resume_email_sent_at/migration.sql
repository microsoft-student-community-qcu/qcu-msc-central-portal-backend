-- Add lastResumeEmailSentAt to ApplicationDraft for the draft resume-link email cooldown
ALTER TABLE `ApplicationDraft` ADD COLUMN `lastResumeEmailSentAt` DATETIME(3) NULL;
