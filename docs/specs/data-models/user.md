# Data Model — User

## Overview

Represents an authenticated system user. Users exist in strict roles; guests have no User record.

## Prisma Definition

```prisma
enum UserRole {
  APPLICANT
  MEMBER
  ADMIN_HR
  ADMIN_LOGISTICS
  SUPERADMIN
  ADMIN_FINANCE
  ADMIN_FINANCE_HEAD
  ADMIN_LOGISTICS_HEAD
  STARTUP_DEV
}

model User {
  id            String     @id @default(uuid())
  email         String     @unique
  lastName      String
  firstName     String
  middleInitial String?
  name          String?    // Full name (Better Auth standard field — constructed server-side from firstName + lastName)
  studentId     String     @unique
  emailVerified Boolean    @default(false)
  image         String?
  role          UserRole   @default(APPLICANT)
  password      String?    // Managed by Better Auth in Account table
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  sessions      Session[]
  accounts      Account[]
  registrations Registration[]
  applicant     Applicant?
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `email` | String | Yes, unique | Login/account email (any email, not necessarily QCU) |
| `firstName` | String | Yes | |
| `lastName` | String | Yes | |
| `middleInitial` | String? | No | |
| `name` | String? | No | Full name (Better Auth standard field) |
| `studentId` | String | Unique | QCU Student ID |
| `emailVerified` | Boolean | Yes | Default: `false` |
| `image` | String? | No | Profile picture URL |
| `role` | UserRole | Yes | Default: `APPLICANT` |
| `password` | String? | No | Managed by Better Auth in Account table |
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
| `SUPERADMIN` | System lead — inherits every restricted action; role management, system toggles, audit viewer |
| `ADMIN_FINANCE` | Finance — merch catalog, pre-orders, payment status |
| `ADMIN_FINANCE_HEAD` | Finance head — inherits finance perms + ADMIN_CORE (removed) perms |
| `ADMIN_LOGISTICS_HEAD` | Logistics head — inherits logistics perms + ADMIN_CORE (removed) perms |
| `STARTUP_DEV` | Technical talent — showcase submissions (student portal surface) |

> **Inheritance (PRD-V2 Global NFR):** SUPERADMIN passes every `require*` guard in the system.
> `ADMIN_CORE` was intentionally removed — its permissions are folded into the heads and SUPERADMIN.

## Relations

- **Sessions**: one User has many Sessions (cascade delete)
- **Accounts**: one User has many Accounts (cascade delete)
- **Registrations**: one User has many Registrations (cascade delete)
- **Applicant**: one User has zero or one Applicant (set null on delete)
