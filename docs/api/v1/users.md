# User Management API

## Overview

Authentication is handled by **Better Auth** — OAuth, login, session management, and account creation go through `/api/auth/*`. Custom user profile and admin role management are at `/api/v1/users/*`.

Users have one of four roles: `APPLICANT`, `MEMBER`, `ADMIN_HR`, or `ADMIN_LOGISTICS`. Unauthenticated visitors are Guests (no User record).

> **Note:** There is **no public registration**. User accounts are created exclusively through the **membership application pipeline** (see [applicant activation flow](../guides/workflows/auth-workflow.md#applicant-account-activation-flow)). The sign-up endpoint below is called by the frontend password-setup page after an applicant receives the email link.

---

## Better Auth Endpoints (`/api/auth/*`)

Better Auth manages account creation (via applicant activation), login, OAuth, and session retrieval. These endpoints are auto-handled and return Better Auth's standard response format.

### 1. Create Account (via Applicant Activation)

**Method:** `POST`  
**Path:** `/api/auth/sign-up/email`

Used by the frontend `/auth/setup-password` page when an applicant clicks the password-setup link from their email. **Not a public registration endpoint.**

```json
{
  "email": "juan@gmail.com",
  "password": "SecurePass123",
  "name": "Juan Dela Cruz",
  "studentId": "23-1234",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "role": "APPLICANT"
}
```

**Required fields:** `email`, `password`, `name`, `studentId`
**Optional fields:** `firstName`, `lastName`, `role` (defaults to `APPLICANT`)

Access the authenticated session from the response headers/cookies for subsequent requests.

---

### 2. Sign In (Email + Password)

**Method:** `POST`  
**Path:** `/api/auth/sign-in/email`

**Request:**
```json
{
  "email": "juan@gmail.com",
  "password": "SecurePass123"
}
```

---

### 3. Sign In with Google

**Method:** `POST`  
**Path:** `/api/auth/sign-in/google`

Redirects the user to Google's OAuth consent screen. Available to existing users who want to link OAuth to their account. OAuth can also be used during the applicant activation flow.

---

### 4. Sign In with GitHub

**Method:** `POST`  
**Path:** `/api/auth/sign-in/github`

Redirects the user to GitHub's OAuth consent screen. Available to existing users who want to link OAuth to their account.

---

### 5. Get Session

**Method:** `GET`  
**Path:** `/api/auth/get-session`

Returns the current session and user data if authenticated.

**Authentication:** Cookie or Bearer token

**Response:**
```json
{
  "session": { "id": "...", "userId": "...", "expiresAt": "..." },
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "juan@gmail.com",
    "emailVerified": false,
    "role": "APPLICANT",
    "createdAt": "2026-06-15T10:30:00Z"
  }
}
```

---

## Custom Endpoints (`/api/v1/users/*`)

### 6. Get User Profile

**Description:**  
Retrieves the authenticated user's profile.

**Method:** `GET`  
**Path:** `/api/v1/users/me`

**Authentication:** Required (Bearer token or session cookie)

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "juan@gmail.com",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "studentId": "23-1234",
    "role": "APPLICANT",
    "image": null,
    "emailVerified": false,
    "createdAt": "2026-06-15T10:30:00Z"
  }
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/v1/users/me \
  -H "Authorization: Bearer <session-token>"
```

---

### 7. Link Applicant to User

**Description:**  
Links the authenticated user's account to their existing applicant record. Called by the frontend after successful Better Auth sign-up during the membership application flow.

**Method:** `POST`  
**Path:** `/api/v1/users/link-applicant`

**Authentication:** Required (must be logged in)

**Request:**
```json
{
  "applicantId": "660e8400-e29b-41d4-a716-446655440001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Applicant linked to user account successfully"
}
```

**Validation:**
- Applicant must exist
- Applicant must not already be linked to another user
- Authenticated user's email must match the applicant's email

---

### 9. Validate Setup Token

**See:** [Setup Token Validation API](./setup-token.md)

---

### 10. Update User Role (Admin Only)

**Description:**  
Updates a user's role. Only accessible to `ADMIN_HR`.

**Method:** `PATCH`  
**Path:** `/api/v1/users/:userId/role`

**Authentication:** Required (ADMIN_HR)

**Request:**
```json
{
  "role": "MEMBER"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "juan@gmail.com",
    "role": "MEMBER"
  },
  "message": "User role updated successfully"
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v1/users/550e8400-e29b-41d4-a716-446655440000/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{ "role": "MEMBER" }'
```

---

## Error Responses

```json
{
  "success": false,
  "error": "string"
}
```

**Common Status Codes:**
| Status | Meaning |
|--------|---------|
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing or invalid session) |
| 403 | Forbidden (insufficient permissions) |
| 404 | User not found |
| 500 | Internal server error |
