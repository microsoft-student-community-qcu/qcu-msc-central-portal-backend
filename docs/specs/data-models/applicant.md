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
  SAN_BARTOLOME
  SAN_FRANCISCO
  BATASAN
}

enum RegistrationStatus {
  APPROVED
  CANCELLED
  PENDING_REVIEW
  REJECTED
}

model Applicant {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Account link
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  // OCR tracking
  manual_application       Boolean @default(false)
  ocrSessionId             String?

  // Personal Information
  firstName                String
  lastName                 String
  middleName               String?
  gender                   Gender
  campus                   Campus
  dateOfBirth              DateTime
  nationality              String

  // Contact Information
  phoneNumber              String
  qcuMscEmail              String   @unique
  emergencyContactName     String
  emergencyContactNumber   String

  // Academic Information
  college                  String
  program                  String
  yearLevel                String
  studentType              String

  // Supporting Requirements
  portfolio                String?
  githubOrProjectLinks     String?
  previousWorksAchievements String?

  // Why join the organization
  reasonForJoining         String
  expectations             String

  // Status
  status RegistrationStatus @default(PENDING_REVIEW)
  adminRemarks String?
}
```

## Fields

### Personal Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `firstName` | String | Yes | Max 50 chars, letters/spaces/hyphens only |
| `lastName` | String | Yes | Max 50 chars, letters/spaces/hyphens only |
| `middleName` | String? | No | Max 50 chars |
| `gender` | Gender (enum) | Yes | `MALE`, `FEMALE`, `LGBTQIA`, `PREFER_NOT_TO_SAY` |
| `campus` | Campus (enum) | Yes | `SAN_BARTOLOME`, `SAN_FRANCISCO`, `BATASAN` |
| `dateOfBirth` | DateTime (ISO date) | Yes | Must be a valid date string |
| `nationality` | String | Yes | Max 50 chars |

### Contact Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `phoneNumber` | String | Yes | 11 digits starting with `09` (`^09\d{9}$`) |
| `qcuMscEmail` | String | Yes, unique | Must end with `@qcu.edu.ph` |
| `emergencyContactName` | String | Yes | Max 100 chars |
| `emergencyContactNumber` | String | Yes | 11 digits starting with `09` (`^09\d{9}$`) |

### Academic Information

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `college` | String | Yes | Max 100 chars |
| `program` | String | Yes | Max 100 chars |
| `yearLevel` | String | Yes | Max 50 chars |
| `studentType` | String | Yes | Max 50 chars |

### Supporting Requirements

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `portfolio` | String? | No | Must be valid URL if provided |
| `githubOrProjectLinks` | String? | No | Must be valid URL if provided |
| `previousWorksAchievements` | String? | No | Max 500 chars if provided |

### Why Join

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `reasonForJoining` | String | Yes | Max 500 chars |
| `expectations` | String | Yes | Max 500 chars |

### Document Uploads

Sent as file fields in `multipart/form-data` alongside the above text fields:

| Field | Type | Required | Accepted Formats | Max Size |
|-------|------|----------|-----------------|----------|
| `certificateOfRegistration` | File | Yes | PDF, JPEG, PNG, DOCX | 10 MB |
| `curriculumVitae` | File | Yes | PDF, JPEG, PNG, DOCX | 10 MB |

### OCR Tracking

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `ocrSessionId` | String? | No | Server-generated ID from OCR verification step |
| `manual_application` | Boolean | No | `true` when OCR fails and manual entry is required |

### Status Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | RegistrationStatus | Yes | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `adminRemarks` | String? | No | Admin feedback when rejecting/reviewing |

### System Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (CUID) | Yes | Primary key |
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
- File uploads are stored at `DOCUMENT_STORAGE_PATH` (default `./uploads/documents`)
- The old `departmentChoice`, `resumeLink`, and `githubLink` fields were removed in the 2026-07-02 expansion
