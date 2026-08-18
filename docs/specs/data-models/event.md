# Data Model — Event

## Overview

Represents a workshop, seminar, or initiative that members and guests can register for. Supports public and members-only events with tiered registration windows and capacity management.

Events can be **cancelled** (V2 Flow 8) via a soft delete: the row and its full attendee roster are always preserved for audit and reporting, and cancelled events are simply filtered out of the public feed. This is distinct from `Registration.status = CANCELLED`, which represents a single attendee opting out.

## Prisma Definition

```prisma
enum EventType {
  PUBLIC
  MEMBERS_ONLY
}

model Event {
  id                 String         @id @default(uuid())
  title              String
  description        String?
  date               DateTime
  priorityStartDate  DateTime
  generalStartDate   DateTime
  type               EventType      @default(PUBLIC)
  maxCapacity        Int
  isCancelled        Boolean        @default(false)
  cancellationReason String?        @db.Text
  cancelledAt        DateTime?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  registrations      Registration[]

  @@index([isCancelled, date])
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `title` | String | Yes | Event name (1-150 chars) |
| `description` | String? | No | Event description (max 1000 chars) |
| `date` | DateTime | Yes | Event date (ISO 8601) |
| `priorityStartDate` | DateTime | Yes | When Members can start registering |
| `generalStartDate` | DateTime | Yes | When general admission opens (must be after priorityStartDate) |
| `type` | EventType | Yes | `PUBLIC` or `MEMBERS_ONLY` (defaults to `PUBLIC`) |
| `maxCapacity` | Int | Yes | Maximum number of attendees |
| `isCancelled` | Boolean | Yes | Soft-delete flag — `true` hides the event from the public feed and detail endpoint (defaults to `false`) |
| `cancellationReason` | String? (Text) | No | Admin-supplied reason; sent verbatim to every PENDING_REVIEW and APPROVED registrant |
| `cancelledAt` | DateTime? | No | Timestamp of the cancellation action |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Relations

- **Registrations**: one Event has many Registrations (cascade delete)

## Indexes

- `id` — primary key
- `[isCancelled, date]` — the public feed filters on `isCancelled` and orders by `date` on every request

## Cancellation Semantics

Cancellation is performed via `PATCH /api/v1/events/:eventId/cancel` and is **always a soft delete** — no `Event` or `Registration` row is ever destroyed.

| Surface | Behaviour when `isCancelled = true` |
|---------|--------------------------------------|
| `GET /api/v1/events` (public feed) | Event excluded from results |
| `GET /api/v1/events/:eventId` | `404` with `"This event has been cancelled."` |
| `POST /api/v1/events/:eventId/register` | `409` — registration refused |
| `PATCH .../registrations/checkin` | `409` — check-in disabled, all passes void |
| `POST .../resend-ticket` | `409` — tickets can no longer be sent |
| `GET /api/v1/events/:eventId/registrations` (admin) | Still readable; response echoes `isCancelled`, `cancellationReason`, `cancelledAt` |

Re-cancelling an already-cancelled event returns `409` and is a no-op.
