# Data Model — Registration

## Overview

Represents a registration ticket linking a User (or guest student) to an Event. Supports both auto-approve (Path A) and manual review (Path B) flows. Guest registrations must first pass Zonal OCR verification.

## Prisma Definition

```prisma
enum RegistrationStatus {
  APPROVED
  PENDING_REVIEW
  REJECTED
  CANCELLED
}

model Registration {
  id                  String             @id @default(uuid())
  eventId             String
  event               Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId              String?
  user                User?              @relation(fields: [userId], references: [id], onDelete: SetNull)
  studentId           String?            // QCU Student ID from Zonal OCR (guest registrations)
  email               String
  lastName            String             @default("")
  firstName           String             @default("")
  middleInitial       String?
  status              RegistrationStatus @default(APPROVED)
  manual_registration Boolean            @default(false) // Flagged true when OCR fails -> manual upload
  qrPayload           String             @unique          // Unique UUID for QR code verification
  hasAttended         Boolean            @default(false)
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  @@unique([eventId, userId])    // One registration per authenticated user per event
  @@unique([eventId, studentId]) // One registration per student ID per event (guests)
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `eventId` | String | Yes | FK to Event |
| `userId` | String? | No | FK to User (null for guest registrations; set null on user delete) |
| `studentId` | String? | No | QCU Student ID for guest registrations (YY-NNNN format, extracted from OCR) |
| `email` | String | Yes | Attendee's email address |
| `lastName` | String | Yes | Attendee's last name |
| `firstName` | String | Yes | Attendee's first name |
| `middleInitial` | String? | No | Single letter, optionally followed by a dot |
| `status` | RegistrationStatus | Yes | `APPROVED`, `PENDING_REVIEW`, `REJECTED`, `CANCELLED` (defaults to `APPROVED`) |
| `manual_registration` | Boolean | Yes | `true` when OCR fails and manual review is required (never client-settable) |
| `qrPayload` | String | Yes, unique | UUID used as the QR code payload for event check-in |
| `hasAttended` | Boolean | Yes | Whether the attendee has checked in (defaults to `false`) |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Status Values

| Value | Description |
|-------|-------------|
| `APPROVED` | Registration confirmed (auto-approved for guest registrations without manual flag) |
| `PENDING_REVIEW` | Awaiting admin approval (set when manual_registration is true) |
| `REJECTED` | Registration denied |
| `CANCELLED` | Registration voided (by user or admin) |

## Relations

- **Event**: many Registrations belong to one Event (cascade delete)
- **User**: many Registrations belong to one User (set null on user delete)

## Unique Constraints

- `[eventId, userId]` — an authenticated User can register for an Event only once
- `[eventId, studentId]` — a guest student can register for an Event only once

## Notes

- Guest registrations follow a two-step flow: `POST /api/v1/ocr/verify` then `POST /api/v1/events/:eventId/register`
- Authenticated members bypass OCR; their profile data is used automatically
- `manual_registration` is derived server-side from the OCR session's `manualRequired` flag — never client-settable
