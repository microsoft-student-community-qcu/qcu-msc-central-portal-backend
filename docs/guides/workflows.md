# Core Workflows

## Overview
This document describes the primary business workflows and user journeys in the QCU MSC Central Portal. Detailed step-by-step flow diagrams for key processes are maintained in [docs/guides/flows/](flows/).

---

## 1. User Authentication Workflow

### Registration (New User)

```
User visits portal
	↓
User clicks "Register"
	↓
User enters: student_id, name, email, password
	↓
System validates input (Zod schema: createUserSchema)
	↓
Email already exists? → Error: "Email already registered"
	↓
Create User record in database (role defaults to APPLICANT)
	↓
Send verification email (managed by Better Auth)
	↓
User receives confirmation email
	↓
User clicks verification link
	↓
emailVerified set to true
	↓
Account activated ✓
```

**Key Decision Points:**
- Role assignment: Defaults to APPLICANT (admin assigns to ADMIN_HR, or ADMIN_LOGISTICS via admin panel)
- Email verification: Required before full access

---

### Login

```
User visits login page
	↓
User enters email and password
	↓
System validates input (Zod schema: loginUserSchema)
	↓
Query User by email
	↓
User not found? → Error: "Invalid credentials"
	↓
Compare passwords (Better Auth handles hashing)
	↓
Password incorrect? → Error: "Invalid credentials"
	↓
Create Session record
	↓
Generate JWT token
	↓
Return token to client
	↓
Client stores token (localStorage/sessionStorage)
	↓
User authenticated ✓
```

**Key Decision Points:**
- Authentication type: JWT token-based
- Session persistence: Token expires after 7 days (JWT_EXPIRES_IN)
- User role determines accessible endpoints

---

## 2. Recruitment & Applicant Tracking Workflow

### Application Submission

The applicant flow has been significantly updated with Zonal OCR verification and post-submission account creation. See the detailed flow diagram in [flows/membership-application-flow.md](flows/membership-application-flow.md).

**Summary:**
1. User captures an image of their Student ID for Zonal OCR pre-validation.
2. On success, the form is auto-filled; after 3 OCR failures, a manual upload fallback is revealed.
3. User submits the application (portfolio/resume links required).
4. System sends an email with a password setup link (also serves as email verification).
5. User sets a password → account activated → redirected to `/portal/tracking`.

**Key Decision Points:**
- No authentication required for submission (open recruitment)
- Student ID verified via Zonal OCR + Regex
- Manual fallback applications flagged as `{"manual_application": true}` for admin review

---

### Applicant Pipeline Management (ADMIN_HR or MEMBER)

```
MEMBER or ADMIN_HR logs in to dashboard
	↓
Accesses "Applicant Tracking" section
	↓
Views list of all applications (filtered by status)
	↓
Quarantine Queue — Applicants with "Pending ID Verification"
  flagged with a warning icon
	↓
  Click → Specialized view with uploaded ID photo
           side-by-side with typed student number
  "Approve ID" → unlocks status mutator
	↓
Member views applicant details:
  - Name, email, department choice
  - Resume and GitHub links
  - Current status
	↓
Member reviews qualifications (externally)
	↓
Member updates status:
  
  Route 1: APPLIED → INTERVIEWING
	↓ Send interview invitation email
	↓
  Route 2: INTERVIEWING → ACCEPTED
	↓ Send acceptance offer email
	↓ Create User account (role=MEMBER)
	↓
  Route 3: INTERVIEWING → REJECTED
	↓ Send rejection email
	↓
Status updated in database
	↓
Dashboard refreshed with new status
```

**Status Workflow:**
```
APPLIED (initial)
  ├─→ INTERVIEWING (interview scheduled)
  │   ├─→ ACCEPTED (offer made, User account created)
  │   └─→ REJECTED (not selected)
  └─→ REJECTED (rejected from initial review)
```

**Key Decision Points:**
- Only ADMIN_HR can update status
- Accepted applicants automatically become MEMBER users
- Email notifications sent at each status transition

---

## 3. Event Management Workflow

### Create Event (ADMIN_LOGISTICS)

```
ADMIN_LOGISTICS logs in
	↓
Clicks "Create Event"
	↓
Fills event details:
  - Title, description
  - Date/time (future date)
  - Type: PUBLIC or MEMBERS_ONLY
  - Max capacity
	↓
System validates input (Zod schema: createEventSchema)
	↓
Date in past? → Error: "Event date must be in future"
	↓
Create Event record in database
	↓
Event published ✓
	↓
Event appears in event listings
```

**Key Decision Points:**
- Only ADMIN_LOGISTICS can create events
- PUBLIC events visible to all, MEMBERS_ONLY restricted
- Capacity limits enforce registration cutoff

---

### Event Registration Workflow

The registration flow now includes Zonal OCR verification, email verification, and two approval paths. See the detailed flow diagram in [flows/event-registration-flow.md](flows/event-registration-flow.md).

**Summary:**
1. User clicks "Register Now" and captures an image of their Student ID.
2. System performs Zonal OCR to extract and validate the student number.
3. After 3 OCR failures, a manual upload fallback is revealed.
4. User submits the registration form (Name + Email).
5. System validates the student number against existing attendees to prevent duplicates.
6. User receives an email verification link.
7. After verification, the system follows one of two paths:

**Path A — Automatic Approval** (`manual_registration: false`):
- QR Ticket / QR Pass is immediately dispatched via email.
- Status: `approved`

**Path B — Manual Review** (`manual_registration: true`):
- Registration enters a pending review queue.
- Admin reviews the uploaded ID and submitted information.
- On approval: QR Ticket dispatched, status → `approved`.
- On rejection: status → `rejected` with optional reason.

**For Members-Only Events (Authenticated):**
- Authenticated members bypass the Zonal OCR entirely — credentials are auto-pulled.
- System checks role (ADMIN_LOGISTICS/MEMBER only) and capacity, then dispatches the QR ticket directly.

---

### Event Check-In Workflow

```
Event day arrives
	↓
MEMBER or ADMIN_LOGISTICS opens check-in dashboard
	↓
Views event and list of registrations
	↓
Student arrives at event
	↓
Student shows QR code (from email or phone)
	↓
Member scans/enters QR code
	↓
System looks up Registration by qrPayload
	↓
Check: Already marked attended?
	↓ Yes: Error: "Already checked in"
	↓ No: Continue
	↓
Update Registration record:
  - hasAttended = true
	↓
Display: "✓ {Name} checked in successfully"
	↓
Attendance recorded ✓
```

---

### Event Cancellation Workflow

#### Admin-Driven (Whole Event)
```
Event date approaching
	↓
Admin decides to cancel event (e.g., low registrations, unexpected issue)
	↓
Admin clicks "Delete Event"
	↓
System confirms deletion warning
	↓
Delete Event record (cascade delete)
	↓
Cascade: All Registrations for this event deleted
	↓
Send cancellation email to all registered attendees
	↓
Event removed from listings ✓
	↓
Cancellation data retained in audit logs
```

**Key Decision Points:**
- Deletion is permanent (no soft delete for events currently)
- All registrations for the event are removed
- Registrants notified of cancellation

#### User-Driven (Individual Registration)

Attendees can cancel their own registration via a unique cancellation link. See [flows/registration-cancellation-flow.md](flows/registration-cancellation-flow.md) for the detailed flow.

---

## 4. Authorization & Role-Based Access Control (RBAC)

### Role Hierarchy

```
ADMIN_HR / ADMIN_LOGISTICS (highest privilege)
  ├─ All MEMBER permissions
  ├─ ADMIN_HR: HR & Recruitment Pipeline
  │   ├─ View/export applicant lists
  │   ├─ Access portfolio links
  │   ├─ Mutate application statuses
  │   ├─ Accept → create Member account
  │   └─ Trigger branded emails to candidates
  │
  └─ ADMIN_LOGISTICS: Event Logistics & Check-In
      ├─ Create/Edit/Delete events
      ├─ View attendee rosters
      ├─ Use QR scanner (/admin/events/scan)
      ├─ Manual check-in override
      └─ Approve manual registrations

MEMBER (medium privilege)
  ├─ All APPLICANT permissions
  ├─ Create/Update events
  ├─ View applicant tracking
  ├─ Update applicant statuses (excluding final accept)
  ├─ View event registrations
  ├─ Check-in users to events
  └─ Priority window registration for Members-Only events

APPLICANT (post-account-creation)
  ├─ View public events
  ├─ Register for Public events
  ├─ Track own application status (/portal/tracking)
  └─ View own profile

——— (no User record) ———

GUEST (unauthenticated)
  ├─ View landing page
  ├─ Register for Public events via Zonal OCR (account-free)
  ├─ Submit sponsorship inquiries ("Collaborate With Us")
  └─ Cancel own registration via unique link
```

### Access Control Checks

**Endpoint Protection:**
```
GET /api/v1/users/me
  ├─ No auth: Error 401
  └─ Any authenticated role (APPLICANT, MEMBER, ADMIN_HR, ADMIN_LOGISTICS): Allowed ✓

POST /api/v1/events/:eventId/register
  ├─ Unauthenticated (Guest): Allowed ✓ (account-free registration via Zonal OCR, studentId required)
  ├─ APPLICANT/MEMBER/ADMIN_LOGISTICS: Allowed ✓ (auto-pulls credentials, no studentId needed)
  └─ Already registered: Error 409 (Conflict)

GET /api/v1/applicants/:id
  ├─ No auth: Error 401
  ├─ ADMIN_HR/MEMBER: Allowed ✓
  └─ APPLICANT: Error 403 (Forbidden)

POST /api/v1/events (create)
  ├─ No auth: Error 401
  ├─ ADMIN_LOGISTICS: Allowed ✓
  └─ All others: Error 403 (Forbidden)

POST /api/v1/events/:eventId/attendance
  ├─ No auth: Error 401
  ├─ ADMIN_LOGISTICS/MEMBER: Allowed ✓
  └─ Others: Error 403 (Forbidden)

PATCH /api/v1/applicants/:id/status
  ├─ No auth: Error 401
  ├─ ADMIN_HR/MEMBER: Allowed ✓
  └─ Others: Error 403 (Forbidden)
```

---

## 5. Email Notification Workflow

**Triggers:**

| Event | Recipients | Template |
|-------|-----------|----------|
| User registers | User | Verification email with activation link |
| Applicant submits app | Applicant | Confirmation of application receipt |
| Applicant → INTERVIEWING | Applicant | Interview invitation |
| Applicant → ACCEPTED | Applicant | Offer acceptance letter |
| Applicant → REJECTED | Applicant | Rejection email |
| Event registration (public) | Attendee | Confirmation + QR code |

---

## 6. User Journeys

### 1. The Guest / Corporate Lead / Potential Sponsors

**Goal:** Verify the organization's prestige and initiate a sponsorship or partnership.

**Entry:** Lands on the Unified Public Landing Page.

**Discovery:** Scrolls through the high-impact Hero section, views the leadership board, and checks the "Wall of Logos" static grid displaying past corporate collaborators.

**Action:** Navigates to the "Collaborate With Us" section.

**Completion:** Clicks the direct, brand-aligned `mailto:` button (or "Copy Email" clipboard function) to contact the official Relations Office and initiate a partnership.

### 2. The Guest / QCU Student (Non-Member Attendee)

**Goal:** Register for a public technical workshop or seminar.

**Entry:** Lands on the Unified Public Landing Page and views the "Active Initiatives Feed" fetching the top 3 upcoming events.

**Initiation:** Clicks "Register Now" on a specific event, which routes them to the `/events` registration gateway.

**Verification (Zonal OCR):** The system prompts the student to capture an image of their QCU Student ID using a guided camera overlay.

**Fallback Route:** If the OCR fails three consecutive times, the hidden manual entry and photo upload form is revealed.

**Form Completion:** Upon successful extraction (or manual fallback), the user submits their Name and Email address.

**Completion:** The system verifies the student number against the current attendee roster to prevent duplicate registration, generates a unique QR payload, and dispatches the digital ticket via website and email.

> **Detailed flow:** [flows/event-registration-flow.md](flows/event-registration-flow.md)

### 3. The Applicant (Prospective Member)

**Goal:** Apply for official membership in the QCU Microsoft Student Community.

**Entry:** Clicks the prominent "Apply" CTA on the Unified Public Landing Page.

**Verification (Zonal OCR):** Must capture an image of their QCU Student ID for pre-validation, where the backend extracts and validates the student number via strict Regex.

**Application Form:** Completes the multi-step form detailing basic information, department preference, and mandatory portfolio/resume links.

**Account Creation:** Immediately upon submission, creates a secure account by setting a password paired with their verified QCU email.

**Completion:** Is routed to `/portal/tracking` (the Applicant Dashboard) to view their application status tracker, update timeline, and check the notification inbox for messages from the M&D team.

> **Detailed flow:** [flows/membership-application-flow.md](flows/membership-application-flow.md)

### 4. The Member (Active QCU MSC Student)

**Goal:** Access priority event registration and the authenticated hub.

**Entry:** Navigates to the portal and logs in.

**Authentication & Routing:** The backend checks the user's role and automatically routes them to `/portal/dashboard`.

**Dashboard View:** Lands on the ultra-lean Member Dashboard featuring the static "Coming Soon" UI (e.g., "Status 200: OK. Workspace Initialized.") to confirm authentication.

**Frictionless Registration:** If the member navigates back to the landing page and clicks "Register" on an upcoming event, the system automatically pulls their credentials and dispatches the QR ticket, entirely bypassing the Zonal OCR requirement.

### 5. The Admin — HR (ADMIN_HR, Management & Development)

**Goal:** Process new member applications and trigger communications.

**Entry:** Logs securely into the HR & Recruitment Pipeline (`/admin/hr`).

**Data Review:** Views the sortable list of all applicants and accesses submitted portfolio links.

**Quarantine Resolution:** Identifies applicants flagged with a "Pending ID Verification" status (from the manual ID fallback queue). Clicks the profile to view the uploaded photo alongside the typed student number and clicks "Approve ID".

**Status Mutation:** Utilizes the Status Mutator to accept or reject the applicant.

**Completion:** Confirms the status change via a modal, which automatically triggers the email engine to dispatch a branded communication to the candidate.

### 6. The Admin — Logistics (ADMIN_LOGISTICS)

**Goal:** Deploy new events to the frontend and manage physical check-ins at the venue doors.

**Entry (Pre-Event):** Logs into the Event Logistics & Check-In dashboard (`/admin/events`).

**Event Creation:** Fills out the Event Creation Form (Title, Date, Type, Max Capacity), which immediately pushes the event to the landing page's Active Initiatives feed.

**Execution (Event Day):** Accesses the mobile-friendly route (`/admin/events/scan`) on their device.

**Ticket Validation:** Uses the device camera to scan student QR tickets at the door. The system validates the UUID against the database and flips the `hasAttended` boolean flag.

**Manual Override:** If a student's phone screen is cracked or the scanner fails, uses the search bar to manually perform a check-in override.
