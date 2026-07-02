# Data Model — Registration

## Overview

Represents a registration ticket linking a User (or guest student) to an Event.

## Prisma Definition

```prisma
model Registration {
  id        String             @id @default(cuid())
  eventId   String
  userId    String?
  studentId String?
  status    RegistrationStatus @default(PENDING_REVIEW)
  qrPayload String             @unique
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  event   Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user    User? @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@unique([eventId, studentId])
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (CUID) | Yes | Primary key |
| `eventId` | String | Yes | FK to Event |
| `userId` | String? | No | FK to User (null for guest registrations) |
| `studentId` | String? | No | QCU Student ID for guest registrations |
| `status` | RegistrationStatus | Yes | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `qrPayload` | String | Yes, unique | QR code payload for check-in |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Status Values

| Value | Description |
|-------|-------------|
| `PENDING_REVIEW` | Awaiting admin approval |
| `APPROVED` | Registration confirmed |
| `REJECTED` | Registration denied |
| `CANCELLED` | Registration voided (by user or admin) |

## Relations

- **Event**: many Registrations belong to one Event (cascade delete)
- **User**: many Registrations belong to one User (cascade delete)

## Unique Constraints

- `[eventId, userId]` — a User can register for an Event only once
- `[eventId, studentId]` — a guest student can register for an Event only once
