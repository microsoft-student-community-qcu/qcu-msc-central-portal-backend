# Data Model — Applicant

## Overview

Represents a prospective MSC member's application. Created via `POST /api/v1/applicants` after OCR student ID verification. Admins review, approve, or reject applications.

## Prisma Definition

```prisma
enum Gender {
  MALE
  FEMALE
  LGBTQIA
  PREFER_NOT_TO_SAY
}

enum Campus {
  SAN_BARTOLOME_MAIN
  SAN_FRANCISCO
  BATASAN
}

enum ApplicantStatus {
  APPROVED
  PENDING_REVIEW
  REJECTED
  CANCELLED
  RESUBMIT
}

model Applicant {
  id                          String          @id @default(uuid())
  lastName                    String          @default("")
  firstName                   String          @default("")
  middleInitial               String?
  email                       String          @unique
  college                     String
  program                     String
  section                     String
  campus                      Campus
  studentId                   String?
  dateOfBirth                 DateTime
  placeOfBirth                String
  gender                      Gender
  membershipRole              String
  certificateOfRegistration   String
  curriculumVitae             String
  houseAddress                String
  cellphoneNumber             String
  qcuMscEmail                 String          @unique
  facebookLink                String
  interestsSkillsHobbies      String          @db.Text
  organizationHistory         String          @db.Text
  portfolio                   String?
  githubOrProjectLinks        String?
  previousWorksAchievements   String?         @db.Text
  status                      ApplicantStatus @default(PENDING_REVIEW)
  manual_application          Boolean         @default(false)
  idImagePath                 String?
  adminMessage                String?
  userId                      String?         @unique
  user                        User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt                   DateTime        @default(now())
  updatedAt                   DateTime        @updatedAt
}
```

## Fields

### Personal Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `firstName` | String | Yes | Max 100 chars |
| `lastName` | String | Yes | Max 100 chars |
| `middleInitial` | String? | No | Single letter, optionally followed by a dot |
| `email` | String | Yes, unique | Valid email (account/login email, not QCU email) |
| `college` | String | Yes | Max 200 chars |
| `program` | String | Yes | Max 200 chars |
| `section` | String | Yes | Max 100 chars |
| `campus` | Campus (enum) | Yes | `SAN_BARTOLOME_MAIN`, `SAN_FRANCISCO`, `BATASAN` |
| `studentId` | String? | No* | `YY-NNNN` format — extracted from OCR or entered manually if OCR fails |
| `dateOfBirth` | DateTime | Yes | ISO date |
| `placeOfBirth` | String | Yes | Max 300 chars |
| `gender` | Gender (enum) | Yes | `MALE`, `FEMALE`, `LGBTQIA`, `PREFER_NOT_TO_SAY` |
| `membershipRole` | String | Yes | Max 200 chars |

### Contact Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `houseAddress` | String | Yes | Max 500 chars |
| `cellphoneNumber` | String | Yes | 11 digits starting with `09` (`^09\d{9}$`) |
| `qcuMscEmail` | String | Yes, unique | Must end with `@qcu.edu.ph` |
| `facebookLink` | String | Yes | Valid URL |

### Additional Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `interestsSkillsHobbies` | String (Text) | Yes | |
| `organizationHistory` | String (Text) | Yes | Specify organization details or "N/A" |

### Supporting Requirements (Optional)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `portfolio` | String? | No | Valid URL |
| `githubOrProjectLinks` | String? | No | Valid URL |
| `previousWorksAchievements` | String? (Text) | No | |

### Document Uploads

Sent as file fields in `multipart/form-data` alongside the above text fields:

| Field | Type | Required | Accepted Formats | Max Size |
|-------|------|----------|-----------------|----------|
| `certificateOfRegistration` | File | Yes | PDF, JPEG, PNG, DOCX | 10 MB |
| `curriculumVitae` | File | Yes | PDF, JPEG, PNG, DOCX | 10 MB |

### OCR Tracking

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `manual_application` | Boolean | No | `true` when OCR fails and manual entry is required (set server-side only) |
| `idImagePath` | String? | No | Path to uploaded Student ID image in blob storage |

### Admin

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `adminMessage` | String? | No | Admin remark visible to the applicant (used for RESUBMIT reason, etc.) |

### Status Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | ApplicantStatus | Yes | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`, `RESUBMIT` |

### System Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `email` | String | Yes, unique | The account email (matches User.email) |
| `userId` | String? | Unique | FK to User (set null on user delete) |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Relations

- **User**: zero or one Applicant per User (set null on User delete)

## Indexes

- `email` — unique
- `qcuMscEmail` — unique
- `userId` — unique

## Notes

- The `email` field is the user's account/login email, not the QCU email
- `qcuMscEmail` is a separate field for the official QCU MSC correspondence address
- File presence is validated via injected `_certificateOfRegistration` / `_curriculumVitae` literal fields in Zod
- File uploads are stored in Azure Blob Storage (`documents` container)
- `manual_application` is **never client-settable** — derived server-side from OCR session's `manualRequired` flag
- OCR session ID (`ocrSessionId`) is stored in-memory (not in DB) — see OCR docs for details
