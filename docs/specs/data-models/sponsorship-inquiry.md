# Data Model — Sponsorship Inquiry

## Overview

Represents a corporate sponsorship lead submitted via the public "Collaborate With Us" form on the landing page. Admins track inquiries through a simple status workflow.

## Prisma Definition

```prisma
enum SponsorshipStatus {
  NEW
  CONTACTED
  CLOSED
}

model SponsorshipInquiry {
  id           String            @id @default(uuid())
  email        String
  contactName  String
  contactPhone String?
  company      String
  message      String            @db.Text
  status       SponsorshipStatus @default(NEW)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `email` | String | Yes | Contact email address |
| `contactName` | String | Yes | Name of the inquiry contact |
| `contactPhone` | String? | No | Contact phone number |
| `company` | String | Yes | Sponsoring organization |
| `message` | String (Text) | Yes | Inquiry message details |
| `status` | SponsorshipStatus | Yes | `NEW`, `CONTACTED`, `CLOSED` (defaults to `NEW`) |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Status Values

| Value | Description |
|-------|-------------|
| `NEW` | Inquiry received, not yet acted upon |
| `CONTACTED` | Admin has reached out to the inquirer |
| `CLOSED` | Inquiry resolved or no longer relevant |

## Notes

- This model has no relations to other models
- Intended for public-facing form submissions only
- Admins are notified of new inquiries out-of-band
