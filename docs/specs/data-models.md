# Data Models and Architecture

## Overview
This document describes the core data models used in the QCU MSC Central Portal and their relationships. Aligned with PRD-V1 (July V1 Release).

---

## Data Models

### User

Represents an authenticated user in the system. Users can have different roles that determine their access level and permissions.

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `email` | string | User's email address | Unique, required, valid email format |
| `name` | string | User's full name | Required, 1-100 characters |
| `student_id` | string | QCU-issued student ID (format: YY-NNNN) | Unique, required, matches pattern `^\d{2}-\d{4}$` |
| `emailVerified` | boolean | Email verification status | Defaults to false |
| `image` | string \| null | Profile image URL | Optional |
| `role` | enum: APPLICANT \| MEMBER \| ADMIN_HR \| ADMIN_LOGISTICS | User's access level | Defaults to APPLICANT |
| `password` | string \| null | Hashed password | Optional (managed by Better Auth) |
| `createdAt` | datetime | Account creation timestamp | Auto-generated |
| `updatedAt` | datetime | Last update timestamp | Auto-updated |

**Relationships:**
- One-to-Many: User → Sessions (a user can have multiple sessions)
- One-to-Many: User → Accounts (OAuth/social auth accounts)
- One-to-Many: User → Registrations (event registrations)
- One-to-One: User → Applicant (optional — set if this User originated from an accepted Applicant record)

**Roles and Permissions (per PRD-V1 Section 2):**
- `ADMIN_HR` (Admin — Management & Dev): Full access to the HR & Recruitment Pipeline — view/export applicant lists, access portfolio links, mutate application statuses, trigger branded emails to candidates.
- `ADMIN_LOGISTICS` (Admin — Logistics): Full access to Event Logistics & Check-In — create event entries, view attendee rosters, use the QR scanner route (`/admin/events/scan`), perform manual check-in overrides.
- `MEMBER`: Active QCU MSC student. Can register for all events (Public and Members-Only) and access internal community resources.
- `APPLICANT`: Prospective QCU MSC member with a system account (created after email verification from the membership application). Can view the landing page, register for Public events, and track their application status.
- **`Guest` (no User record):** A behavioral role for unauthenticated visitors — both External parties and QCU Students (Non-Member) who have not applied. Can view the landing page, submit sponsorship inquiries, and register for Public events via Zonal OCR without creating an account.

> **Note:** `ADMIN_HR` and `ADMIN_LOGISTICS` are intentionally separate roles, not a single generic `ADMIN`. An HR admin should not have QR scanner access, and a Logistics admin should not be able to mutate applicant statuses — permissions are scoped per the PRD's distinct admin responsibilities.

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "hr.officer@qcu.edu",
  "name": "HR Officer",
  "student_id": "23-1234",
  "emailVerified": true,
  "image": null,
  "role": "ADMIN_HR",
  "createdAt": "2026-06-01T10:00:00Z",
  "updatedAt": "2026-06-01T10:00:00Z"
}
```

---

### Applicant

Represents a prospective MSC member who has submitted an application through the recruitment pipeline.

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `name` | string | Applicant's full name | Required, 1-100 characters |
| `email` | string | Applicant's email | Unique, required, valid email |
| `departmentChoice` | string | Preferred department/specialization | Required, 1-100 characters |
| `resumeLink` | string | URL to applicant's resume | Required, valid URL (must be HTTP/HTTPS) |
| `githubLink` | string | GitHub profile or project repository URL | Required, valid URL |
| `status` | enum: APPLIED \| INTERVIEWING \| ACCEPTED \| REJECTED | Application pipeline status | Defaults to APPLIED |
| `studentId` | string \| null | QCU Student ID extracted via Zonal OCR (YY-NNNN format) | Optional |
| `manual_application` | boolean | Flagged true when OCR fails and applicant manually enters credentials | Defaults to false |
| `userId` | UUID \| null | Linked User account, once accepted | Optional, unique, foreign key |
| `createdAt` | datetime | Application submission timestamp | Auto-generated |
| `updatedAt` | datetime | Last status update timestamp | Auto-updated |

**Status Workflow:**
1. `APPLIED` → Initial submission state
2. `INTERVIEWING` → Applicant is in interview process
3. `ACCEPTED` → Applicant has been accepted to MSC — a User account is created/linked (role becomes `MEMBER`) via `userId`
4. `REJECTED` → Applicant's application has been rejected

**Security note:** `status`, `manual_application`, and `userId` are never client-settable. Public submissions via `/apply` only ever set `status` to its default (`APPLIED`); `manual_application` is set server-side when OCR fails (determined from `ocrSessionId` at submission time); status changes require an `ADMIN_HR` session and go through a dedicated update endpoint.

**OCR Integration:**
- Applications use a two-step flow: `POST /api/v1/ocr/verify` → receives `ocrSessionId` → `POST /api/v1/applicants` with the session token.
- The `manual_application` flag is set by the backend based on the OCR session's `manualRequired` value.
- Student ID images (both successful and failed OCR) are saved to the configured storage path (placeholder — TBD) for audit and admin review.
- Zonal OCR zone coordinates for QCU Student ID card are configurable (placeholder — TBD).

**Example:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "departmentChoice": "Software Engineering",
  "resumeLink": "https://drive.google.com/file/d/1234567890",
  "githubLink": "https://github.com/janesmith",
  "status": "INTERVIEWING",
  "studentId": "23-5678",
  "manual_application": false,
  "userId": null,
  "createdAt": "2026-06-10T15:30:00Z",
  "updatedAt": "2026-06-15T11:00:00Z"
}
```

---

### Event

Represents a workshop, seminar, or initiative organized by MSC. Events have capacity limits, visibility settings, and tiered registration windows.

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `title` | string | Event name/title | Required, 1-150 characters |
| `description` | string \| null | Detailed event description | Optional, max 1000 characters |
| `date` | datetime | Event scheduled date/time | Required, ISO 8601 format |
| `priorityStartDate` | datetime | When Members can begin registering | Required |
| `generalStartDate` | datetime | When general admission opens to all | Required, must be after `priorityStartDate` |
| `type` | enum: PUBLIC \| MEMBERS_ONLY | Event visibility | Defaults to PUBLIC |
| `maxCapacity` | integer | Maximum attendees allowed | Required, positive integer |
| `createdAt` | datetime | Event creation timestamp | Auto-generated |
| `updatedAt` | datetime | Last update timestamp | Auto-updated |

**Event Types:**
- `PUBLIC`: Any student can register once `generalStartDate` is reached (or `MEMBER`s during the priority window)
- `MEMBERS_ONLY`: Only `MEMBER` users can register, at any point after `priorityStartDate`

**Tiered Registration (per PRD-V1 Event Registration & Ticketing module):**
- **Priority Window** — between `priorityStartDate` and `generalStartDate`: only authenticated `MEMBER` users can view and submit the registration form.
- **General Window** — from `generalStartDate` onward: all eligible users (per event `type`) can register.
- A request hitting the registration endpoint during the Priority Window from a non-Member must be rejected with `403 Forbidden: General Admission has not started.`

**Example:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "title": "Python Workshop 2026",
  "description": "Learn advanced Python programming techniques and best practices",
  "date": "2026-07-15T14:00:00Z",
  "priorityStartDate": "2026-07-01T09:00:00Z",
  "generalStartDate": "2026-07-03T09:00:00Z",
  "type": "PUBLIC",
  "maxCapacity": 50,
  "createdAt": "2026-06-15T10:30:00Z",
  "updatedAt": "2026-06-15T10:30:00Z"
}
```

---

### Registration

Represents a student's registration for an event. Each registration generates a unique QR code for check-in.

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `eventId` | UUID | Reference to the event | Required, foreign key |
| `event` | Event | Event object (relation) | Required |
| `userId` | UUID \| null | User ID if registered member | Optional, foreign key |
| `user` | User \| null | User object (relation) | Optional |
| `studentId` | string \| null | QCU Student ID extracted via Zonal OCR (for guest registrations) | Optional |
| `email` | string | Attendee's email | Required |
| `name` | string | Attendee's full name | Required |
| `status` | enum: APPROVED \| PENDING_REVIEW \| REJECTED \| CANCELLED | Registration lifecycle status | Defaults to APPROVED |
| `manual_registration` | boolean | Flagged true when OCR fails and manual upload is used | Defaults to false |
| `qrPayload` | string | Unique UUID for QR code | Unique, auto-generated |
| `hasAttended` | boolean | Attendance confirmation flag | Defaults to false |
| `createdAt` | datetime | Registration timestamp | Auto-generated |

**Constraints:**
- `@@unique([eventId, userId])` — one registration per authenticated user per event.
- `@@unique([eventId, studentId])` — one registration per student ID per event (for guest registrations).

**OCR Integration:**
- Event registrations use a two-step flow: `POST /api/v1/ocr/verify` → receives `ocrSessionId` → `POST /api/v1/events/:eventId/register` with the session token.
- The `manual_registration` flag is set by the backend based on the OCR session's `manualRequired` value.
- Student ID images (both successful and failed OCR) are saved to the configured storage path (placeholder — TBD) for audit and admin review.
- Authenticated members bypass Zonal OCR entirely — their credentials are auto-pulled from their profile, and `manual_registration` defaults to `false`.

**Example:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "eventId": "770e8400-e29b-41d4-a716-446655440002",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "studentId": null,
  "email": "user@example.com",
  "name": "John Member",
  "status": "APPROVED",
  "manual_registration": false,
  "qrPayload": "880e8400-e29b-41d4-a716-446655440003",
  "hasAttended": false,
  "createdAt": "2026-06-15T11:00:00Z"
}
```

---

### SponsorshipInquiry

Represents a corporate sponsorship lead submitted by an external Guest via the landing page's "Collaborate With Us" CTA (PRD-V1 Section 2 — Guest/External role).

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `email` | string | Contact email | Required, valid email |
| `contactName` | string | Name of the contact person | Required, 1-100 characters |
| `contactPhone` | string \| null | Contact phone number | Optional, max 30 characters |
| `company` | string | Company/organization name | Required, 1-200 characters |
| `message` | string | Inquiry details | Required, min 10 characters |
| `status` | enum: NEW \| CONTACTED \| CLOSED | Relations Office follow-up status | Defaults to NEW |
| `createdAt` | datetime | Submission timestamp | Auto-generated |
| `updatedAt` | datetime | Last status update timestamp | Auto-updated |

**No authentication required** — this is a public-facing form per PRD-V1 (Guest/External role can submit sponsorship inquiries without registering).

**Example:**
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "email": "partnerships@techcorp.com",
  "contactName": "Alex Rivera",
  "contactPhone": "+63 912 345 6789",
  "company": "TechCorp Inc.",
  "message": "We'd like to discuss a potential workshop sponsorship for the upcoming semester.",
  "status": "NEW",
  "createdAt": "2026-06-15T11:00:00Z",
  "updatedAt": "2026-06-15T11:00:00Z"
}
```

---

### Session

Represents an authenticated user session. Managed by Better Auth.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Session identifier |
| `token` | string | Session token (unique) |
| `userId` | UUID | Associated user ID |
| `expiresAt` | datetime | Session expiration time |
| `ipAddress` | string \| null | Client IP address |
| `userAgent` | string \| null | Client user agent |
| `createdAt` | datetime | Session creation time |
| `updatedAt` | datetime | Last activity timestamp |

---

### Account

Represents OAuth and social authentication accounts linked to a User. Managed by Better Auth.

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Account identifier |
| `userId` | UUID | Associated user ID |
| `accountId` | string | Provider-specific account ID |
| `providerId` | string | OAuth provider (e.g., "google", "github") |
| `accessToken` | string \| null | OAuth access token |
| `refreshToken` | string \| null | OAuth refresh token |
| `idToken` | string \| null | OIDC ID token |
| `scope` | string \| null | OAuth scopes |
| `createdAt` | datetime | Account link creation time |

---

## Relationships Diagram

```
User (1) ──→ (Many) Session
User (1) ──→ (Many) Account
User (1) ──→ (Many) Registration
User (1) ──→ (0 or 1) Applicant
Event (1) ──→ (Many) Registration
```

**Cascade Delete Rules:**
- Deleting a User cascades to: Sessions, Accounts, Registrations
- Deleting a User sets `Applicant.userId` to null (soft unlink, Applicant record retained)
- Deleting an Event cascades to: Registrations

---

## Validation Rules

### User
- Email must be unique across the system
- Student ID must be unique across the system and follow the format YY-NNNN (e.g., 23-1234)
- Password handled by Better Auth, not validated/stored directly via the public signup schema
- Role must be one of: APPLICANT, MEMBER, ADMIN_HR, ADMIN_LOGISTICS — **never client-settable on creation**, always defaults to APPLICANT server-side
- Name must be 1-100 characters

### Applicant
- Email must be unique across applicants
- Resume and GitHub links must be valid URLs
- Department choice: 1-100 characters
- Status transitions follow pipeline: APPLIED → (INTERVIEWING or REJECTED) → (ACCEPTED or REJECTED)
- `status` and `userId` are never client-settable on creation — only mutable via an `ADMIN_HR`-protected endpoint

### Event
- Title: 1-150 characters
- Description: 0-1000 characters
- `generalStartDate` must be after `priorityStartDate` (enforced at the validation layer)
- Date must be in the future (validation in service layer)
- Max capacity must be positive integer
- Type must be PUBLIC or MEMBERS_ONLY
- Only `ADMIN_LOGISTICS` may create or update events

### Registration
- Only one registration per authenticated user per event (unique constraint on eventId + userId)
- Only one registration per student ID per event (unique constraint on eventId + studentId) — covers guest registrations
- For guest registrations: `studentId` is required (captured via Zonal OCR), `userId` is null
- Email and name are always required
- QR payload must be unique (auto-generated UUID)
- Requests during the Priority Window from non-Members are rejected with 403
- Registrations with `manual_registration: true` enter Path B (manual review) and have `status: PENDING_REVIEW`

### SponsorshipInquiry
- Email must be valid format
- Message must be at least 10 characters
- No authentication required for submission

---

## Indexes and Performance Optimizations

**Database Indexes:**
- `User.email` (unique)
- `User.student_id` (unique)
- `Applicant.email` (unique)
- `Applicant.userId` (unique)
- `Session.token` (unique)
- `Registration.qrPayload` (unique)
- `Registration.[eventId, userId]` (unique composite)
- `Event.date` (for date-range queries)

---

## Data Migration Strategy

When evolving data models:
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
| 2026-06-24 | Added `student_id` field to User model (unique identifier, YY-NNNN format) with corresponding schema, type, and Better Auth config updates |
| 2026-06-27 | Synced with PRD-V1 4-role model: removed `STUDENT` from User role enum, added `APPLICANT`; added `Guest` behavioral role (no User record); added `studentId`, `status`, `manual_registration` to Registration model; updated validation rules |
| 2026-06-28 | Added `manual_application` field to Applicant model — server-side boolean flagged when OCR fails |
| 2026-06-28 | Documented two-step OCR flow for Applicant and Registration: `POST /api/v1/ocr/verify` → `ocrSessionId` → submission endpoint; added OCR integration notes, image storage placeholder, Zonal OCR zone placeholder |