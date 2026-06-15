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
User enters: name, email, password
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
| Event registration (member) | Member | Confirmation + QR code |
| Event cancellation | All registrants | Event cancellation notice |

**Note:** Email implementation pending (managed by external service)

---

## Key Decision Points Summary

| Workflow | Decision | Implementation |
|----------|----------|-----------------|
| Auth | JWT or Session? | JWT + Express middleware |
| Applicants | Email verification? | No (open recruitment) |
| Events | Capacity enforcement? | Yes, check before registration |
| Registration | QR generation | UUID-based unique QR payload |
| Deletion | Soft or hard delete? | Hard delete (cascade for registrations) |
| Roles | How many levels? | 3 (ADMIN, MEMBER, STUDENT) |
