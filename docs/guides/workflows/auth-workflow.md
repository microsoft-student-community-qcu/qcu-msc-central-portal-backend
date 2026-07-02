# Workflow — User Authentication

## Overview

Authentication is handled by **Better Auth**, a full-stack auth library. It manages:

- Email + Password sign-in for existing users
- Google OAuth (when configured)
- GitHub OAuth (when configured)
- Session management (cookies or Bearer tokens)

> **Note:** There is no public "Register" page. User accounts are created exclusively through the **membership application pipeline** — an applicant submits → receives a password-setup email → creates their account via the link.

---

## Applicant Account Activation Flow

This is the **only** path for creating a user account. Accounts are NOT created via a public registration form.

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

---

## Real-World Scenario: Juan Joins MSC

Juan is a QCU student who wants to join the Microsoft Student Community. Here's his complete journey:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. APPLICATION                                                      │
│                                                                      │
│ Juan opens the MSC portal, clicks "Apply", captures his Student     │
│ ID via camera, fills out the membership form, and submits.          │
│                                                                      │
│ Frontend calls: POST /api/v1/applicants (multipart/form-data)       │
│                                                                      │
│ Database state after submission:                                     │
│   Applicant { id: "app-1", email: "juan@gmail.com",                 │
│               studentId: "23-1234", userId: null }                   │
│   → No User record exists yet (Juan can't log in)                   │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. PASSWORD-SETUP EMAIL                                             │
│                                                                      │
│ Backend sends Juan an email with a password-setup link:              │
│                                                                      │
│   "Click here to create your account and set your password"          │
│                                                                      │
│   Link: /auth/setup-password                                         │
│         ?email=juan%40gmail.com                                      │
│         &applicantId=app-1                                           │
│         &name=Juan+Dela+Cruz                                         │
│         &studentId=23-1234                                           │
│                                                                      │
│   → Only applicants who submitted get this email                     │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. ACCOUNT CREATION (Better Auth sign-up)                           │
│                                                                      │
│ Juan clicks the link → /auth/setup-password page opens.              │
│ The page reads the URL params: email, applicantId, name, studentId. │
│                                                                      │
│ Juan enters a password and clicks "Create Account".                 │
│                                                                      │
│ Frontend calls: POST /api/auth/sign-up/email                        │
│   Body: {                                                            │
│     "email": "juan@gmail.com",                                       │
│     "password": "SecurePass123!",                                    │
│     "name": "Juan Dela Cruz",                                        │
│     "studentId": "23-1234",                                          │
│     "firstName": "Juan",                                             │
│     "lastName": "Dela Cruz",                                         │
│     "role": "APPLICANT"                                              │
│   }                                                                  │
│                                                                      │
│ Better Auth creates:                                                 │
│   User    { id: "user-1", email: "juan@gmail.com",                  │
│             studentId: "23-1234", role: "APPLICANT" }               │
│   Session { token: "session-token-abc", userId: "user-1" }         │
│                                                                      │
│ Response back to frontend:                                           │
│ { "token": "session-token-abc", "user": { "id": "user-1", ... } }  │
│                                                                      │
│  ⚠ The Applicant record (app-1) still has userId: null              │
│    → No connection between Applicant and User yet                   │
│    → If admin approves NOW, the role won't upgrade to MEMBER        │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. LINK APPLICANT (bridge the gap)                                  │
│                                                                      │
│ The frontend MUST call linkApplicant right after successful sign-up. │
│ This is the step that connects the User account to the Applicant.   │
│                                                                      │
│ Frontend calls: POST /api/v1/users/link-applicant                   │
│   Authorization: Bearer session-token-abc                            │
│   Body: { "applicantId": "app-1" }                                   │
│                                                                      │
│ Backend validates:                                                   │
│   ✓ Applicant "app-1" exists?                                        │
│   ✓ Applicant not already linked to another user?                    │
│   ✓ Logged-in user (user-1) email matches applicant email?          │
│                                                                      │
│ Backend updates: Applicant.userId = "user-1"                        │
│                                                                      │
│ Response:                                                            │
│ { "success": true, "message": "Applicant linked successfully" }     │
│                                                                      │
│ Database state now:                                                  │
│   Applicant { id: "app-1", userId: "user-1" }  ← CONNECTED ✓       │
│   User      { id: "user-1", role: "APPLICANT" }                     │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. ADMIN APPROVAL → AUTO MEMBER UPGRADE                             │
│                                                                      │
│ Days later, an MSC admin reviews Juan's application and approves.   │
│                                                                      │
│ Admin calls: PATCH /api/v1/applicants/app-1/status                  │
│   Authorization: Bearer admin-token                                  │
│   Body: { "status": "APPROVED" }                                     │
│                                                                      │
│ Backend checks:                                                      │
│   ✓ Applicant exists?                                                │
│   ✓ Applicant has userId = "user-1"?  → YES (set in step 4)        │
│                                                                      │
│ Because userId is set, the backend ALSO does:                        │
│   UPDATE User SET role = 'MEMBER' WHERE id = 'user-1'               │
│                                                                      │
│ Response:                                                            │
│ { "success": true, "data": { "status": "APPROVED" },                │
│   "message": "Applicant status updated to APPROVED.                 │
│               User role upgraded to MEMBER." }                       │
│                                                                      │
│ Final state:                                                         │
│   Applicant { id: "app-1", status: "APPROVED", userId: "user-1" }  │
│   User      { id: "user-1", role: "MEMBER" }  ← PROMOTED ✓        │
│   → Juan can now access member events and the member dashboard      │
└──────────────────────────────────────────────────────────────────────┘
```

### Why `linkApplicant` Exists

Without step 4, the User and Applicant records are disconnected. If an admin approved Juan's application, the backend code checks:

```typescript
if (status === "APPROVED" && applicant.userId) {
  // Only runs if userId is set → promotes User to MEMBER
}
```

If `applicant.userId` is null (because link-applicant was never called), the promotion **silently skips**. Juan stays `APPLICANT` forever — even though his application is approved.

`linkApplicant` is the bridge that connects the two records so the auto-promotion works.

---

### What the Frontend Must Do

After the `/auth/setup-password` page successfully calls `POST /api/auth/sign-up/email` and receives a session token, the frontend **must immediately** call `POST /api/v1/users/link-applicant` before redirecting the user.

#### Exact Sequence on `/auth/setup-password`

```
1. Page loads → read URL params:
     email, applicantId, name, studentId

2. User enters password and submits

3. Call #1 — Create Account:
   POST /api/auth/sign-up/email
   Body: {
     "email":       email,          // from URL
     "password":    password,       // user input
     "name":        name,           // from URL
     "studentId":   studentId       // from URL
   }

   → Response: { "token": "abc...", "user": { "id": "user-1", ... } }

4. Save the token (sessionStorage or cookie for redirect)

5. Call #2 — Link Applicant (REQUIRED — do NOT skip):
   POST /api/v1/users/link-applicant
   Authorization: Bearer abc...         // token from step 3
   Body: { "applicantId": "app-1" }     // applicantId from URL

   → Response: { "success": true, "message": "Applicant linked..." }

6. Redirect user to: /portal/tracking
   → They can now view their application status
   → When admin approves, their role will auto-upgrade to MEMBER

⚠ If step 5 fails or is skipped:
  • Applicant and User stay disconnected
  • Admin approval won't promote User to MEMBER
  • User is stuck as APPLICANT indefinitely
```

#### Error Handling

| Step | Error | What to show |
|------|-------|-------------|
| 3 | `{ "errors": ["Student ID already taken"] }` | "An account with this Student ID already exists. Please contact support." |
| 3 | `{ "errors": ["Email is required", ...] }` | Show each error message as a list |
| 5 | `404 Applicant not found` | "Your application was not found. Please submit a new application." |
| 5 | `400 email mismatch` | "The email used to sign up does not match your application email." |
| 5 | `409 Already linked` | "Your account is already linked. Redirecting to tracking..." → redirect anyway |

---

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
- OAuth can be used to sign in to an existing account or create a new one during applicant activation (via the password-setup flow)

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
| POST | `/api/auth/sign-up/email` | Public | Create account via applicant activation link (not public registration) |
| POST | `/api/auth/sign-in/email` | Public | Sign in with email + password |
| POST | `/api/auth/sign-in/google` | Public | Sign in with Google (OAuth) |
| POST | `/api/auth/sign-in/github` | Public | Sign in with GitHub (OAuth) |
| GET | `/api/auth/get-session` | Required | Get current session |
| GET | `/api/v1/users/me` | Required | Get user profile |
| POST | `/api/v1/users/link-applicant` | Required | Link applicant record to user account |
| PATCH | `/api/v1/users/:userId/role` | ADMIN_HR | Update user role |
