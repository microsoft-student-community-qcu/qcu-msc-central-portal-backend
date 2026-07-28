-- Rename membershipRole to office and change type from String to Office enum
ALTER TABLE `Applicant` CHANGE `membershipRole` `office` ENUM(
  'SECRETARIAT_OFFICE',
  'RELATIONS_OFFICE',
  'FINANCE_OFFICE',
  'LOGISTICS_OFFICE',
  'CREATIVES_OFFICE',
  'MANAGEMENT_AND_DEVELOPMENT_OFFICE',
  'STARTUP_DEVELOPERS_OFFICE'
) NOT NULL;
