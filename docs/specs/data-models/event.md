# Data Model — Event

## Overview

Represents a workshop, seminar, or initiative that members and guests can register for. Supports public and members-only events with tiered registration windows and capacity management.

## Prisma Definition

```prisma
enum EventType {
  PUBLIC
  MEMBERS_ONLY
}

model Event {
  id                String         @id @default(uuid())
  title             String
  description       String?
  date              DateTime
  priorityStartDate DateTime
  generalStartDate  DateTime
  type              EventType      @default(PUBLIC)
  maxCapacity       Int
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  registrations     Registration[]
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
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Relations

- **Registrations**: one Event has many Registrations (cascade delete)

## Indexes

- `id` — primary key
