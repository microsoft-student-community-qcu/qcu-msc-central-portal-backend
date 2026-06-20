# Data Models and Architecture

## Overview
This document describes the core data models used in the QCU MSC Central Portal and their relationships.

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
| `emailVerified` | boolean | Email verification status | Defaults to false |
| `image` | string \| null | Profile image URL | Optional |
| `role` | enum: ADMIN \| MEMBER \| STUDENT | User's access level | Defaults to STUDENT |
| `password` | string \| null | Hashed password | Optional (managed by Better Auth) |
| `createdAt` | datetime | Account creation timestamp | Auto-generated |
| `updatedAt` | datetime | Last update timestamp | Auto-updated |

**Relationships:**
- One-to-Many: User → Sessions (a user can have multiple sessions)
- One-to-Many: User → Accounts (OAuth/social auth accounts)
- One-to-Many: User → Registrations (event registrations)

**Roles and Permissions:**
- `ADMIN`: Full system access, can create/manage users, events, and applicants
- `MEMBER`: Can create/manage events and view applicants
- `STUDENT`: Can register for events, submit applications

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@qcu.edu",
  "name": "Admin User",
  "emailVerified": true,
  "image": null,
  "role": "ADMIN",
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
| `createdAt` | datetime | Application submission timestamp | Auto-generated |
| `updatedAt` | datetime | Last status update timestamp | Auto-updated |

**Status Workflow:**
1. `APPLIED` → Initial submission state
2. `INTERVIEWING` → Applicant is in interview process
3. `ACCEPTED` → Applicant has been accepted to MSC
4. `REJECTED` → Applicant's application has been rejected

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
  "createdAt": "2026-06-10T15:30:00Z",
  "updatedAt": "2026-06-15T11:00:00Z"
}
```

---

### Event

Represents a workshop, seminar, or initiative organized by MSC. Events have capacity limits and visibility settings.

**Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | UUID | Unique identifier (auto-generated) | Primary key, auto-generated |
| `title` | string | Event name/title | Required, 1-150 characters |
| `description` | string \| null | Detailed event description | Optional, max 1000 characters |
| `date` | datetime | Event scheduled date/time | Required, ISO 8601 format |
| `type` | enum: PUBLIC \| MEMBERS_ONLY | Event visibility | Defaults to PUBLIC |
| `maxCapacity` | integer | Maximum attendees allowed | Required, positive integer |
| `createdAt` | datetime | Event creation timestamp | Auto-generated |
| `updatedAt` | datetime | Last update timestamp | Auto-updated |

**Event Types:**
- `PUBLIC`: Any student can register (no authentication required)
- `MEMBERS_ONLY`: Only MEMBER and ADMIN users can register

**Example:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "title": "Python Workshop 2026",
  "description": "Learn advanced Python programming techniques and best practices",
  "date": "2026-07-15T14:00:00Z",
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
| `email` | string | Attendee's email | Required (non-member registrations) |
| `name` | string | Attendee's name | Required (non-member registrations) |
| `qrPayload` | string | Unique UUID for QR code | Unique, auto-generated |
| `hasAttended` | boolean | Attendance confirmation flag | Defaults to false |
| `createdAt` | datetime | Registration timestamp | Auto-generated |

**Registration Types:**
- **Member Registration**: `userId` is populated, can be used for analytics
- **Non-Member Registration**: `userId` is null, `email` and `name` capture attendee info

**Example:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "eventId": "770e8400-e29b-41d4-a716-446655440002",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "John Member",
  "qrPayload": "880e8400-e29b-41d4-a716-446655440003",
  "hasAttended": false,
  "createdAt": "2026-06-15T11:00:00Z"
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
Event (1) ──→ (Many) Registration
```

**Cascade Delete Rules:**
- Deleting a User cascades to: Sessions, Accounts, Registrations
- Deleting an Event cascades to: Registrations
- Deleting a User in Registration: Sets userId to null (soft delete)

---

## Validation Rules

### User
- Email must be unique across the system
- Password minimum 8 characters (enforced in API layer)
- Role must be one of: ADMIN, MEMBER, STUDENT
- Name must be 1-100 characters

### Applicant
- Email must be unique across applicants
- Resume and GitHub links must be valid URLs
- Department choice: 1-100 characters
- Status transitions follow pipeline: APPLIED → (INTERVIEWING or REJECTED or ACCEPTED)

### Event
- Title: 1-150 characters
- Description: 0-1000 characters
- Date must be in the future (validation in service layer)
- Max capacity must be positive integer
- Type must be PUBLIC or MEMBERS_ONLY

### Registration
- Only one registration per user per event (unique constraint on eventId + userId)
- For non-member registrations: email and name are required
- QR payload must be unique (auto-generated UUID)

---

## Indexes and Performance Optimizations

**Database Indexes:**
- `User.email` (unique)
- `Applicant.email` (unique)
- `Session.token` (unique)
- `Registration.qrPayload` (unique)
- `Registration.eventId` (for filtering registrations by event)
- `Registration.userId` (for filtering registrations by user)
- `Event.date` (for date-range queries)

---

## Data Migration Strategy

When evolving data models:
1. Create new fields with backward-compatible defaults
2. Run Prisma migrations with `prisma migrate dev`
3. Update TypeScript domain models in `src/types/models.ts`
4. Update validation schemas in `src/schemas/`
5. Update API documentation in `/docs/api/`
6. Test all affected endpoints before deployment
