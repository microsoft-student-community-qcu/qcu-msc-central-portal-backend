# Password Reset API

## Overview

Account-recovery and password management endpoints. There are three groups:

1. **Forgot password** — request a reset link by email (per-portal, role-boundary enforced).
2. **Reset link flow** — validate the token from the emailed link, then set a new password. The link is **single-use** and expires after `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` (default 30).
3. **Change password** — authenticated users update their own password (current password required).

All endpoints follow the standard response contract (`{ success, data?, message, errors? }`), use Zod validation with human-readable error messages, and public endpoints are rate-limited.

---

## 1. Forgot Password

Two endpoints mirror the per-portal sign-in design. Each only processes accounts belonging to its portal's roles:

| Portal | Endpoint | Allowed roles |
|--------|----------|---------------|
| Student Portal | `POST /api/v1/auth/student/forgot-password` | `APPLICANT`, `MEMBER` |
| Admin Portal | `POST /api/v1/auth/admin/forgot-password` | `ADMIN_HR`, `ADMIN_LOGISTICS` |

**Description:** If a user exists with the given email **and** their role matches the portal, the backend:
1. Generates a signed JWT reset token (expires in `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES`).
2. Records the token (SHA-256 hashed) in the `Verification` table as `password-reset:<userId>`, replacing any older active token for the same user.
3. Emails a reset link to the account (`<FRONTEND_URL | ADMIN_FRONTEND_URL>/auth/reset-password?token=...`).

**Anti-enumeration:** the response is identical whether the email exists, is unknown, or belongs to the wrong portal. Callers cannot discover which emails are registered.

**Method:** `POST`

**Rate limit:** 5 requests/min per IP

**Request:**
```json
{
  "email": "juan@gmail.com"
}
```

**Response (always identical):**
```json
{
  "success": true,
  "message": "If an account exists, a password reset link has been sent."
}
```

**Validation error (400):**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": { "email": ["Invalid email format"] }
}
```

---

## 2. Validate Reset Token

**Description:** Confirms the emailed link is authentic, unexpired, and not already consumed before the frontend shows the reset form. Returns the account email so the user can double-check identity.

**Method:** `POST`  
**Path:** `/api/v1/auth/validate-reset-token`

**Rate limit:** none (shared with the reset flow)

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (valid):**
```json
{
  "success": true,
  "data": {
    "email": "juan@gmail.com"
  }
}
```

**Response (invalid, expired, or already consumed):**
```json
{
  "success": false,
  "message": "Invalid or expired reset link. Please request a new one."
}
```

---

## 3. Reset Password

**Description:** Consumes the reset token and sets a new password. The password is hashed with Better Auth's scrypt (same format sign-in verifies). On success, the token record is deleted (**single-use**) and **all sessions are invalidated** — the user must sign in again.

> The new password cannot be identical to the account's current password — such a reset is rejected with `400 "New password cannot be the same as your current password."`. OAuth-only accounts (no credential password yet) may still set a first password.

**Method:** `POST`  
**Path:** `/api/v1/auth/reset-password`

**Rate limit:** `10` requests per minute per IP

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "SecurePass123!"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Password has been reset. Please sign in with your new password."
}
```

**Response (invalid / expired / already used token):**
```json
{
  "success": false,
  "message": "Invalid or expired reset link. Please request a new one."
}
```

**Response (new password same as current, 400):**
```json
{
  "success": false,
  "message": "New password cannot be the same as your current password."
}
```

**Validation error (400)** (e.g. password shorter than 8 characters):
```json
{
  "success": false,
  "message": "Validation error",
  "errors": { "newPassword": ["Password must be at least 8 characters"] }
}
```

---

## 4. Change Password (authenticated)

**Description:** Signed-in users update their own password. The current password is verified against the stored hash first. All sessions **except the current one** are deleted.

> OAuth-only accounts (created via Google/GitHub) have no credential password — the endpoint returns `400 "No password is set for this account."`.

**Method:** `POST`  
**Path:** `/api/v1/auth/change-password`  
**Authentication:** Required (`requireAuth`) — `Authorization: Bearer <token>` or session cookie.

**Request:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456!"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

**Response (wrong current password, 400):**
```json
{
  "success": false,
  "message": "Current password is incorrect."
}
```

**Response (new password same as current, 400):**
```json
{
  "success": false,
  "message": "New password cannot be the same as your current password."
}
```

**Response (unauthenticated, 401):**
```json
{
  "success": false,
  "message": "Unauthorized - authentication required"
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | No | `30` | Reset-link TTL in minutes. Applies to the JWT and the `Verification` row expiry |

---

## Error Responses (shared)

Simple errors always use the `message` field:

```json
{
  "success": false,
  "message": "string"
}
```

Validation errors additionally include field-level `errors` under `flatten().fieldErrors`. Rate-limiter responses also use `message`.