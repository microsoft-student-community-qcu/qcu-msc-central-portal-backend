# Data Model — User

## Overview

Represents an authenticated system user. Users exist in one of four strict roles after registration; guests have no User record.

## Prisma Definition

```prisma
enum UserRole {
  APPLICANT
  MEMBER
  ADMIN_HR
  ADMIN_LOGISTICS
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  firstName String
  lastName  String
  studentId String?  @unique
  role      UserRole @default(APPLICANT)
  image     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sessions      Session[]
  accounts      Account[]
  registrations Registration[]
  applicant     Applicant?
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (CUID) | Yes | Primary key |
| `email` | String | Yes, unique | Login/account email |
| `password` | String | Yes | Hashed with bcrypt |
| `firstName` | String | Yes | |
| `lastName` | String | Yes | |
| `studentId` | String? | Unique | QCU Student ID from Zonal OCR verification |
| `role` | UserRole | Yes | Default: `APPLICANT` |
| `image` | String? | No | Profile picture URL |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Role Descriptions

| Role | Description |
|------|-------------|
| `GUEST` | No User record; not polluting the User table at all. Behavioral role only |
| `APPLICANT` | Post-account-creation, pending membership approval |
| `MEMBER` | Active QCU MSC member |
| `ADMIN_HR` | Management & Dev — manages applicant pipeline only |
| `ADMIN_LOGISTICS` | Logistics — manages events only |

## Relations

- **Sessions**: one User has many Sessions (cascade delete)
- **Accounts**: one User has many Accounts (cascade delete)
- **Registrations**: one User has many Registrations (cascade delete)
- **Applicant**: one User has zero or one Applicant (set null on delete)
