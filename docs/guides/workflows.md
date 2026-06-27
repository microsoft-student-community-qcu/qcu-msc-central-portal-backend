# Core Workflows

## Overview
This document describes the primary business workflows and user journeys in the QCU MSC Central Portal.

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
Create User record in database (role defaults to STUDENT)
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
- Role assignment: Defaults to STUDENT (ADMIN/MEMBER assigned via admin panel)
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

```
Prospective member visits applicant portal
	↓
User fills application form:
  - Name, Email, Department choice
  - Resume URL (Google Drive, GitHub, etc.)
  - GitHub profile link
	↓
System validates input (Zod schema: createApplicantSchema)
	↓
Email already exists? → Error: "You've already applied"
	↓
URLs valid? (HTTP/HTTPS check)
	↓
Create Applicant record with status = "APPLIED"
	↓
Send confirmation email to applicant
	↓
Applicant dashboard shows "Application Submitted" ✓
```

**Key Decision Points:**
- No authentication required for submission (open recruitment)
- Email uniqueness enforced (one application per person)
- Status starts as APPLIED

---

### Applicant Pipeline Management (Admin/Member)

```
Member/Admin logs in to dashboard
	↓
Accesses "Applicant Tracking" section
	↓
Views list of all applications (filtered by status)
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
- Only ADMIN/MEMBER can update status
- Accepted applicants automatically become MEMBER users
- Email notifications sent at each status transition

---

## 3. Event Management Workflow

### Create Event (Admin/Member)

```
Member/Admin logs in
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
- Only ADMIN/MEMBER can create events
- PUBLIC events visible to all, MEMBERS_ONLY restricted
- Capacity limits enforce registration cutoff

---

### Event Registration Workflow

### For Public Events (Non-Member Registration)

```
Student visits event listing
	↓
Clicks on PUBLIC event
	↓
Views event details (title, description, date, capacity)
	↓
Clicks "Register"
	↓
Fills registration form:
  - Name, email
  - No authentication needed
	↓
System validates input (Zod schema: registerEventSchema)
	↓
Check: Event capacity reached?
	↓ Yes: Error: "Event is at full capacity"
	↓ No: Continue
	↓
Check: Already registered with this email?
	↓ Yes: Error: "Already registered for this event"
	↓ No: Continue
	↓
Generate unique QR payload (UUID)
	↓
Create Registration record:
  - eventId, name, email
  - userId = null (non-member)
  - qrPayload = unique UUID
  - hasAttended = false
	↓
Send confirmation email with QR code
	↓
Student receives email with event details and QR
	↓
Registration complete ✓
```

### For Members-Only Events (Authenticated)

```
Authenticated member logs in
	↓
Clicks on MEMBERS_ONLY event
	↓
User role check:
  ├─→ ADMIN or MEMBER: Can register ✓
  ├─→ STUDENT: Error: "Members only event"
  └─→ Not authenticated: Error: "Please login"
	↓
Clicks "Register"
	↓
System auto-fills name, email from user profile
	↓
Check: Event capacity reached?
	↓ Yes: Error: "Event is at full capacity"
	↓ No: Continue
	↓
Check: Already registered (userId + eventId)?
	↓ Yes: Error: "You're already registered for this event"
	↓ No: Continue
	↓
Generate unique QR payload (UUID)
	↓
Create Registration record:
  - eventId, userId (from session)
  - name, email (from User record)
  - qrPayload = unique UUID
  - hasAttended = false
	↓
Send confirmation email with QR code
	↓
Registration complete ✓
```

---

### Event Check-In Workflow

```
Event day arrives
	↓
Member/Admin opens check-in dashboard
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

---

## 4. Authorization & Role-Based Access Control (RBAC)

### Role Hierarchy

```
ADMIN (highest privilege)
  ├─ All MEMBER permissions
  ├─ All STUDENT permissions
  ├─ Create/Edit/Delete users
  ├─ Create/Edit/Delete events
  ├─ Manage applicants (all statuses)
  └─ Delete events and force-cancel registrations

MEMBER (medium privilege)
  ├─ All STUDENT permissions
  ├─ Create/Edit events
  ├─ View applicant tracking
  ├─ Update applicant statuses
  ├─ View event registrations
  └─ Check-in users to events

STUDENT (lowest privilege)
  ├─ View public events
  ├─ Register for events (public & members-only if member)
  ├─ Submit applications
  └─ View own profile and registrations
```

### Access Control Checks

**Endpoint Protection:**
```
GET /api/users/me
  ├─ No auth: Error 401
  └─ Any role: Allowed ✓

GET /api/applicants/:id
  ├─ No auth: Error 401
  ├─ ADMIN/MEMBER: Allowed ✓
  └─ STUDENT: Error 403 (Forbidden)

POST /api/events
  ├─ No auth: Error 401
  ├─ ADMIN/MEMBER: Allowed ✓
  └─ STUDENT: Error 403

POST /api/events/:eventId/register
  └─ No auth: Allowed ✓ (non-member registration)

POST /api/events/:eventId/attendance/:qrCode
  ├─ No auth: Error 401
  ├─ ADMIN/MEMBER: Allowed ✓
  └─ STUDENT: Error 403
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

### 2. The QCU Student (Non-Member Attendee)

**Goal:** Register for a public technical workshop or seminar.

**Entry:** Lands on the Unified Public Landing Page and views the "Active Initiatives Feed" fetching the top 3 upcoming events.

**Initiation:** Clicks "Register Now" on a specific event, which routes them to the `/events` registration gateway.

**Verification (Zonal OCR):** The system prompts the student to capture an image of their QCU Student ID using a guided camera overlay.

**Fallback Route:** If the OCR fails three consecutive times, the hidden manual entry and photo upload form is revealed.

**Form Completion:** Upon successful extraction (or manual fallback), the user submits their Name and Email address.

**Completion:** The system verifies the student number against the current attendee roster to prevent duplicate registration, generates a unique QR payload, and dispatches the digital ticket via website and email.

### 3. The Applicant (Prospective Member)

**Goal:** Apply for official membership in the QCU Microsoft Student Community.

**Entry:** Clicks the prominent "Apply" CTA on the Unified Public Landing Page.

**Verification (Zonal OCR):** Must capture an image of their QCU Student ID for pre-validation, where the backend extracts and validates the student number via strict Regex.

**Application Form:** Completes the multi-step form detailing basic information, department preference, and mandatory portfolio/resume links.

**Account Creation:** Immediately upon submission, creates a secure account by setting a password paired with their verified QCU email.

**Completion:** Is routed to `/portal/tracking` (the Applicant Dashboard) to view their application status tracker, update timeline, and check the notification inbox for messages from the M&D team.

### 4. The Member (Active QCU MSC Student)

**Goal:** Access priority event registration and the authenticated hub.

**Entry:** Navigates to the portal and logs in.

**Authentication & Routing:** The backend checks the user's role and automatically routes them to `/portal/dashboard`.

**Dashboard View:** Lands on the ultra-lean Member Dashboard featuring the static "Coming Soon" UI (e.g., "Status 200: OK. Workspace Initialized.") to confirm authentication.

**Frictionless Registration:** If the member navigates back to the landing page and clicks "Register" on an upcoming event, the system automatically pulls their credentials and dispatches the QR ticket, entirely bypassing the Zonal OCR requirement.

### 5. The Admin (Management & Development / HR)

**Goal:** Process new member applications and trigger communications.

**Entry:** Logs securely into the HR & Recruitment Pipeline (`/admin/hr`).

**Data Review:** Views the sortable list of all applicants and accesses submitted portfolio links.

**Quarantine Resolution:** Identifies applicants flagged with a "Pending ID Verification" status (from the manual ID fallback queue). Clicks the profile to view the uploaded photo alongside the typed student number and clicks "Approve ID".

**Status Mutation:** Utilizes the Status Mutator to accept or reject the applicant.

**Completion:** Confirms the status change via a modal, which automatically triggers the email engine to dispatch a branded communication to the candidate.

### 6. The Admin (Logistics Office)

**Goal:** Deploy new events to the frontend and manage physical check-ins at the venue doors.

**Entry (Pre-Event):** Logs into the Event Logistics & Check-In dashboard (`/admin/events`).

**Event Creation:** Fills out the Event Creation Form (Title, Date, Type, Max Capacity), which immediately pushes the event to the landing page's Active Initiatives feed.

**Execution (Event Day):** Accesses the mobile-friendly route (`/admin/events/scan`) on their device.

**Ticket Validation:** Uses the device camera to scan student QR tickets at the door. The system validates the UUID against the database and flips the `hasAttended` boolean flag.

**Manual Override:** If a student's phone screen is cracked or the scanner fails, uses the search bar to manually perform a check-in override.
