# Setup Token Validation API

## Overview

Checks if the password-setup link from the email is still valid and has not been used yet. The frontend calls this endpoint when the user opens `/auth/setup-password?token=...` to make sure the link works before showing the password form.

The token expires 48 hours after it is created.

---

## Where Do Tokens Come From?

The `setupToken` is a signed JWT generated server-side whenever a password-setup email is sent, and — in two cases — also returned directly in an API response so the frontend can forward it to `/api/auth/sign-up/email` (which **requires** it; requests without it fail with `"setupToken": ["Setup token is required"]`).

| Endpoint | Token returned in response? |
|----------|-----------------------------|
| `POST /api/v1/applicants` (single submission, `201`) | Yes — `data.setupToken` |
| `POST /api/v1/ocr/verify` (when `alreadySubmitted: true`, `200`) | Yes — `data.setupToken` |
| `POST /api/v1/applicants/resend-setup-link` | No — email only (response always says "If an account exists, a new setup link has been sent.") |

In all cases the same token is embedded in the password-setup email (`${FRONTEND_URL}/auth/setup-password?token=...`). The frontend flow: open the link → validate the token via this endpoint → show the password form → submit `{ email, password, firstName, lastName, studentId, setupToken }` to `/api/auth/sign-up/email`.

---

## Validate Setup Token

**Description:**  
Checks if the link is authentic (not fake), not expired, and makes sure it can only be used once.

**Method:** `POST`  
**Path:** `/api/v1/users/validate-setup-token`

**Authentication:** None (the token in the link is the password)

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
    "applicantId": "660e8400-e29b-41d4-a716-446655440001",
    "email": "juan@gmail.com",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "middleInitial": null,
    "studentId": "23-1234"
  }
}
```

**Response (invalid or expired):**
```json
{
  "success": false,
  "message": "Invalid or expired setup link. Please request a new one."
}
```

**Response (already used):**
```json
{
  "success": false,
  "message": "This setup link has already been used. Please sign in instead."
}
```

**Response (applicant not found):**
```json
{
  "success": false,
  "message": "Application not found. Please submit a new application."
}
```

---

## Error Responses

```json
{
  "success": false,
  "message": "string"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Token check failed (invalid, expired, already used, or applicant not found) |
| 500 | Internal server error |
