# Workflow — User Authentication

## Overview

Authentication is handled by **Better Auth**, a full-stack auth library. It manages:

- Email + Password registration and sign-in
- Google OAuth (when configured)
- GitHub OAuth (when configured)
- Session management (cookies or Bearer tokens)

---

## Registration (Email + Password)

Better Auth handles registration at `POST /api/auth/sign-up/email`:

```
User clicks "Register"
	↓
User enters: name, email, password
	↓
Frontend sends POST /api/auth/sign-up/email
	↓
Better Auth validates input, hashes password
	↓
Email already exists? → Error response
	↓
Create User record in database (role defaults to APPLICANT)
	↓
Create Account record (provider = "email")
	↓
Return session + user data
	↓
User authenticated ✓
```

**Key Decision Points:**
- Role defaults to APPLICANT (admin promotes via `PATCH /api/v1/users/:userId/role`)
- Email verification can be enabled via Better Auth configuration

---

## Applicant Account Activation Flow

This flow connects the membership application pipeline to account creation:

```
User submits membership application
	↓
Backend creates Applicant record (status: PENDING_REVIEW)
	↓
Backend sends email with password setup link
  Contains: email, applicantId, name, studentId (as URL params)
	↓
User clicks link → frontend /auth/setup-password page
	↓
Frontend calls POST /api/auth/sign-up/email with:
	↓
  {
    "email": "juan@gmail.com",
    "password": "SecurePass123",
    "name": "Juan Dela Cruz",
    "studentId": "23-1234",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "role": "APPLICANT"
  }
	↓
Better Auth creates User + Account records
	↓
Frontend calls POST /api/v1/users/link-applicant
  Body: { "applicantId": "abc-123" }
	↓
Backend sets Applicant.userId = User.id
	↓
Admin approves application (PATCH /api/v1/applicants/:id/status)
  Body: { "status": "APPROVED" }
	↓
Backend also updates User.role to "MEMBER"
	↓
Account fully activated ✓
```

## Login (Email + Password)

```
User visits login page
	↓
User enters email and password
	↓
Frontend sends POST /api/auth/sign-in/email
	↓
Better Auth validates credentials
	↓
Invalid? → Error response
	↓
Create Session record
	↓
Return session + user data
	↓
User authenticated ✓
```

---

## OAuth — Google / GitHub

```
User clicks "Sign in with Google" (or GitHub)
	↓
Frontend redirects to POST /api/auth/sign-in/google
	↓
Better Auth redirects to Google's OAuth consent screen
	↓
User approves
	↓
Google redirects to /api/auth/callback/google
	↓
Better Auth processes callback:
	  ↓
  First time? → Create User + Account (provider = "google")
	  ↓
  Returning? → Link to existing User session
	↓
Return session + user data
	↓
User authenticated ✓
```

**Key Decision Points:**
- OAuth providers are optional — leave env vars empty to disable
- An email can have multiple linked accounts (email, Google, GitHub) — all map to the same User
- OAuth auto-creates a User if one doesn't exist for that OAuth account ID

---

## Session Validation (Middleware)

All protected API routes validate the session via Better Auth's `getSession`:

```
Request arrives with Authorization: Bearer <token> (or cookie)
	↓
authMiddleware calls auth.api.getSession({ headers })
	↓
Valid session?
	↓ Yes: Set req.userId, req.userRole from session.user
	↓ No:  Set req.userId = null, req.userRole = null
	↓
Continue to route handler (next())
	↓
Route uses require* guard to block unauthorized requests
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/sign-up/email` | Public | Register with email + password |
| POST | `/api/auth/sign-in/email` | Public | Sign in with email + password |
| POST | `/api/auth/sign-in/google` | Public | Sign in with Google (OAuth) |
| POST | `/api/auth/sign-in/github` | Public | Sign in with GitHub (OAuth) |
| GET | `/api/auth/get-session` | Required | Get current session |
| GET | `/api/v1/users/me` | Required | Get user profile |
| POST | `/api/v1/users/link-applicant` | Required | Link applicant record to user account |
| PATCH | `/api/v1/users/:userId/role` | ADMIN_HR | Update user role |
