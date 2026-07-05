# Workflow — User Authentication

## Overview

Authentication is handled by **Better Auth**, a library for handling user accounts and logins. It manages:

- Email + Password sign-in for existing users
- Google login (when configured)
- GitHub login (when configured)
- Session management (cookies or access tokens)

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
  Contains: a secure link that expires in 48 hours and can only be used once
	↓
User clicks link → frontend /auth/setup-password?token=<jwt>
	↓
Frontend validates token: POST /api/v1/users/validate-setup-token
  (returns email, name, studentId — or errors if expired/invalid/used)
	↓
Frontend shows password form with pre-filled name and email
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
Backend also changes User.role to "MEMBER"
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
│         ?token=<48h-expiring-signed-JWT>                             │
│                                                                      │
│   → Only applicants who submitted get this email                     │
│   → Link expires after 48 hours                                      │
│   → Can only be used once: after creating an account, the link stops │
│     working                                                          │
│   → If expired, applicant can ask for a new link (see step 3a)      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. TOKEN VALIDATION                                                  │
│                                                                      │
│ Juan clicks the link → /auth/setup-password?token=<jwt> opens.      │
│                                                                      │
│ Before showing the password form, the frontend validates the token: │
│ POST /api/v1/users/validate-setup-token                              │
│   Body: { "token": "<jwt-from-url>" }                                │
│                                                                      │
│ Backend checks:                                                      │
│   ✓ Is the link authentic (not fake)?                                │
│   ✓ Is the link still valid? (not expired, not already used)         │
│   ✓ Does the applicant still exist?                                  │
│   ✓ Has the applicant not already created an account?               │
│                                                                      │
│ Response: { "success": true, "data": { "applicantId": "app-1",     │
│            "email": "juan@gmail.com", "name": "Juan Dela Cruz",     │
│            "studentId": "23-1234" } }                                │
│                                                                      │
│ Frontend stores applicantId + email + name + studentId in memory.  │
│ Pre-fills the form fields.                                          │
│                                                                      │
│ If invalid/expired → show error page with "Link expired" message    │
│ If already used → show "Account already exists. Please sign in."    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3a. RESEND SETUP LINK (if expired/lost)                             │
│                                                                      │
│ If Juan's link expired or he lost the email, he visits the          │
│ /auth/resend-setup-link page (or clicks "Resend" on the login page). │
│                                                                      │
│ Frontend calls: POST /api/v1/applicants/resend-setup-link           │
│   Body: { "email": "juan@gmail.com" }                                │
│                                                                      │
│ Backend looks up:                                                    │
│   Applicant where email = "juan@gmail.com" AND userId IS NULL       │
│                                                                      │
│ If found: generates new JWT, sends fresh email with new link        │
│ If not found or already linked: silently does nothing               │
│                                                                      │
│ Always returns the same message:                                     │
│   { "success": true, "message": "If an account exists, a new        │
│     setup link has been sent." }                                     │
│   This keeps the user's email private — an attacker cannot tell     │
│   if an email is registered or not.                                  │
│                                                                      │
│ Rate limited: 3 req/min per IP                                      │
│                                                                      │
│ Juan checks his email → clicks new link → continues to step 3       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. ACCOUNT CREATION (Better Auth sign-up)                           │
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
│ 5. LINK APPLICANT (bridge the gap)                                  │
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
│ 6. ADMIN APPROVAL → AUTO MEMBER UPGRADE                             │
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

If `applicant.userId` is null (because link-applicant was never called), the role upgrade **does not happen**. Juan stays `APPLICANT` forever — even though his application was approved.

`linkApplicant` is the bridge that connects the two records so the auto-promotion works.

---

### What the Frontend Must Do

After the `/auth/setup-password` page successfully calls `POST /api/auth/sign-up/email` and receives a session token, the frontend **must immediately** call `POST /api/v1/users/link-applicant` before redirecting the user.

#### Exact Sequence on `/auth/setup-password`

```
1. Page loads → read token from URL:
      token = queryParam("token")

2. Call #1 — Validate Setup Token:
   POST /api/v1/users/validate-setup-token
   Body: { "token": token }

   → Success Response: { "success": true, "data": { "applicantId", "email", "name", "studentId", ... } }
   → Error Response:   { "success": false, "errors": ["..."] }

3. On success → store `applicantId` + `email` + `name` + `studentId` in memory, pre-fill form fields.
   On error   → show relevant error page (expired/used/not found).

4. User enters password and submits

5. Call #2 — Create Account:
   POST /api/auth/sign-up/email
   Body: {
     "email":       email,          // from validation response
     "password":    password,       // user input
     "name":        name,           // from validation response
     "studentId":   studentId       // from validation response
   }

   → Response: { "token": "abc...", "user": { "id": "user-1", ... } }

6. Save the token (sessionStorage or cookie for redirect)

7. Call #3 — Link Applicant (REQUIRED — do NOT skip):
   POST /api/v1/users/link-applicant
   Authorization: Bearer abc...         // token from step 5
   Body: { "applicantId": "app-1" }     // from validation response (step 2)

   → Response: { "success": true, "message": "Applicant linked..." }

8. Redirect user to: /portal/tracking
   → They can now view their application status
   → When admin approves, their role will auto-upgrade to MEMBER

⚠ If step 7 fails or is skipped:
  • Applicant and User stay disconnected
  • Admin approval won't promote User to MEMBER
  • User is stuck as APPLICANT indefinitely
```

#### Error Handling

| Step | Error | What to show |
|------|-------|-------------|
| 2 | Invalid or expired token | "Your setup link has expired or is invalid." → Show "Resend setup link" button that navigates to /auth/resend-setup-link |
| 2 | Already used | "Your account has already been created. Please sign in instead." → redirect to /auth/sign-in |
| 2 | Application not found | "Your application was not found. Please submit a new application." |
| 5 | `{ "errors": ["Student ID already taken"] }` | "An account with this Student ID already exists. Please contact support." |
| 5 | `{ "errors": ["Email is required", ...] }` | Show each error message as a list |
| 7 | `404 Applicant not found` | "Your application was not found. Please submit a new application." |
| 7 | `400 email mismatch` | "The email used to sign up does not match your application email." |
| 7 | `409 Already linked` | "Your account is already linked. Redirecting to tracking..." → redirect anyway |

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
| POST | `/api/v1/users/validate-setup-token` | None | Validate password-setup JWT from email link |
| POST | `/api/v1/applicants/resend-setup-link` | None | Resend setup email (3 req/min) |
| GET | `/api/v1/users/me` | Required | Get user profile |
| POST | `/api/v1/users/link-applicant` | Required | Link applicant record to user account |
| PATCH | `/api/v1/users/:userId/role` | ADMIN_HR | Update user role |
