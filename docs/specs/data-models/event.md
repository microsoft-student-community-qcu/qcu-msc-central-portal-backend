# Data Model — Event

## Overview

Represents an organizational event that members and applicants can register for.

## Prisma Definition

```prisma
model Event {
  id        String   @id @default(cuid())
  title     String
  content   String?
  category  String?
  date      DateTime
  location  String?
  image     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  priorityStartDate DateTime?
  generalStartDate  DateTime?

  registrations Registration[]

  @@index([date])
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (CUID) | Yes | Primary key |
| `title` | String | Yes | Event name |
| `content` | String? | No | Event description / body |
| `category` | String? | No | Event category/tag |
| `date` | DateTime | Yes | Event date |
| `location` | String? | No | Venue or online link |
| `image` | String? | No | Event poster image URL |
| `priorityStartDate` | DateTime? | No | Early registration opens for priority groups |
| `generalStartDate` | DateTime? | No | General registration opens for all members |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Relations

- **Registrations**: one Event has many Registrations (cascade delete)

## Indexes

- `[date]` — for chronological event listing queries
