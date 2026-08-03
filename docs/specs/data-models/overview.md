# Data Models — Overview

## Introduction

This directory contains the core data models used in the QCU MSC Central Portal, split by entity for focused reference.

| Entity | File | Description |
|--------|------|-------------|
| User | [user.md](user.md) | Authenticated system users |
| Applicant | [applicant.md](applicant.md) | Prospective MSC member applications |
| Event | [event.md](event.md) | Organizational events |
| Registration | [registration.md](registration.md) | Event registration tickets |
| Sponsorship Inquiry | [sponsorship-inquiry.md](sponsorship-inquiry.md) | Corporate sponsorship leads |
| Application Draft | — | Inline in API docs: multi-step draft table for batch application submission |

---

## Relationships

```
User (1) ──→ (Many) Session
User (1) ──→ (Many) Account
User (1) ──→ (Many) Registration
User (1) ──→ (0 or 1) Applicant
Event (1) ──→ (Many) Registration
ApplicationDraft ──→ (references) OCR session (in-memory)
```

**Cascade Delete Rules:**
- Deleting a User cascades to: Sessions, Accounts, Registrations
- Deleting a User sets `Applicant.userId` to null (soft unlink, Applicant record retained)
- Deleting an Event cascades to: Registrations

---

## Indexes

| Table | Index | Type |
|-------|-------|------|
| `User` | `email` | Unique |
| `User` | `studentId` | Unique |
| `Applicant` | `email` | Unique |
| `Applicant` | `userId` | Unique |
| `Session` | `token` | Unique |
| `Registration` | `qrPayload` | Unique |
| `Registration` | `[eventId, userId]` | Unique composite |
| `Registration` | `[eventId, studentId]` | Unique composite |
| `ApplicationDraft` | `ocrSessionId` | Unique |

---

## Application Draft — Resume Link Fields

The `ApplicationDraft` model supports cross-device resume via emailed links:

| Field | Type | Description |
|-------|------|-------------|
| `lastResumeEmailSentAt` | DateTime? | Timestamp of the last successful resume-link email — enforces the 30-min cooldown (`RESUME_EMAIL_COOLDOWN_MINUTES`) and is only set on successful sends so failed sends can retry |

Draft lifecycle: created by the multi-step flow, blocks a new application while active, expires after `DRAFT_TTL_HOURS` (7 days, lazy delete at next scan). See the [Draft Resume Flow](../../api/v1/ocr.md) in the OCR API docs.

---

## Data Migration Strategy

1. Create new fields with backward-compatible defaults
2. Run Prisma migrations with `prisma migrate dev`
3. Update validation schemas in `src/schemas/`
4. Update API documentation in `/docs/api/`
5. Test all affected endpoints before deployment

---

## Revision History

| Date | Change |
|------|--------|
| 2026-06-20 | Realigned with PRD-V1: split single `ADMIN` role into `ADMIN_HR`/`ADMIN_LOGISTICS`, added `priorityStartDate`/`generalStartDate` to Event, added `SponsorshipInquiry` model, added `Applicant.userId` link, added `Registration` unique composite constraint |
| 2026-06-24 | Added `student_id` field to User model |
| 2026-06-27 | Synced with PRD-V1 4-role model; added `Guest` behavioral role |
| 2026-06-28 | Added `manual_application` field to Applicant; documented two-step OCR flow |
| 2026-07-02 | Major Applicant model expansion: 22 new fields across Personal Info, Contact Info, Additional Info, Supporting Requirements; new `Gender` and `Campus` enums; data models split into per-entity files |
| 2026-07-29 | Added `ApplicationDraft` model (multi-step batch submission); added `Office` enum |
| 2026-08-02 | Added `lastResumeEmailSentAt` to `ApplicationDraft` for the draft resume-link cooldown; documented 7-day draft TTL and lazy expiry |
