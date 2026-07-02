# Data Model — Sponsorship Inquiry

## Overview

Represents a corporate sponsorship lead submitted via the public sponsorship inquiry form.

## Prisma Definition

```prisma
model SponsorshipInquiry {
  id             String   @id @default(cuid())
  companyName    String
  contactPerson  String
  contactEmail   String
  contactNumber  String?
  eventName      String
  sponsorshipTier String?
  message        String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (CUID) | Yes | Primary key |
| `companyName` | String | Yes | Sponsoring organization |
| `contactPerson` | String | Yes | Name of the inquiry contact |
| `contactEmail` | String | Yes | Contact email address |
| `contactNumber` | String? | No | Contact phone number |
| `eventName` | String | Yes | Event to sponsor |
| `sponsorshipTier` | String? | No | Preferred tier/package |
| `message` | String? | No | Additional notes |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Notes

- This model has no relations to other models
- Intended for public-facing form submissions only
- Admins are notified of new inquiries out-of-band
