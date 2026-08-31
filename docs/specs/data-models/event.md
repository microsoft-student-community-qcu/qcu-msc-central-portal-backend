# Data Model — Event

## Overview

Represents a workshop, seminar, or initiative that members and guests can register for. Events are split into three visibility tiers (`PUBLIC`, `QCU_STUDENTS_ONLY`, `MEMBERS_ONLY`) and carry a single registration deadline, a manual open/close toggle, a venue, an optional banner image, and capacity management.

## Prisma Definition

```prisma
// QCU_STUDENTS_ONLY (V2 Flow 2) sits between PUBLIC and MEMBERS_ONLY:
// members bypass verification, non-members must pass Zonal OCR.
enum EventType {
  PUBLIC
  QCU_STUDENTS_ONLY
  MEMBERS_ONLY
}

model Event {
  id                   String         @id @default(uuid())
  title                String
  description          String?
  date                 DateTime
  venue                String?        // Physical location — V2 Flow 1
  // DEPRECATED (V2): the tiered priority/general window is superseded by
  // registrationDeadline + isRegistrationOpen. Kept nullable for existing
  // V1 rows and no longer enforced by the register endpoint.
  priorityStartDate    DateTime?      // Deprecated — member priority start
  generalStartDate     DateTime?      // Deprecated — general admission start
  registrationDeadline DateTime?      // Cutoff after which no new registrations are accepted
  bannerImageUrl       String?        // Azure Blob URL of the event banner/poster
  requiresQrTicket     Boolean        @default(true)  // Whether attendees present a QR at the door
  isRegistrationOpen   Boolean        @default(true)  // Manual open/close toggle — V2 Flow 6
  type                 EventType      @default(PUBLIC)
  maxCapacity          Int
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  registrations        Registration[]
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `title` | String | Yes | Event name (1-150 chars) |
| `description` | String? | No | Event description (max 1000 chars) |
| `date` | DateTime | Yes | Event date (ISO 8601) |
| `venue` | String? | Yes on create | Physical or online venue (1-200 chars). Nullable in the DB for pre-V2 rows |
| `registrationDeadline` | DateTime? | Yes on create | Cutoff for new registrations; must be on or before `date`. Nullable for pre-V2 rows |
| `bannerImageUrl` | String? | No | Azure Blob URL. Always derived server-side from the uploaded `bannerImage` file — never accepted from the client |
| `requiresQrTicket` | Boolean | Yes | Defaults to `true`. Whether attendees receive/present a QR ticket |
| `isRegistrationOpen` | Boolean | Yes | Defaults to `true`. Manual open/close toggle (V2 Flow 6); closing blocks new registrations only |
| `priorityStartDate` | DateTime? | No | **Deprecated (V2)** — no longer accepted on create nor enforced on register |
| `generalStartDate` | DateTime? | No | **Deprecated (V2)** — no longer accepted on create nor enforced on register |
| `type` | EventType | Yes | `PUBLIC`, `QCU_STUDENTS_ONLY`, or `MEMBERS_ONLY` (defaults to `PUBLIC`) |
| `maxCapacity` | Int | Yes | Maximum number of attendees |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Registration Gating by Type

| `type` | Who may register | OCR required? | Auth required? |
|--------|------------------|---------------|----------------|
| `PUBLIC` | Anyone | No | No |
| `QCU_STUDENTS_ONLY` | Verified QCU students + members | Yes for non-members; members bypass | No |
| `MEMBERS_ONLY` | Active MSC members only | No | Yes (role `MEMBER`) |

## Relations

- **Registrations**: one Event has many Registrations (cascade delete)

## Indexes

- `id` — primary key
