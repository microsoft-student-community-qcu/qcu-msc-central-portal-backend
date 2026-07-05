# Setup Token Validation API

## Overview

Validates the one-time signed token from the password-setup email link. The frontend calls this endpoint when the user lands on `/auth/setup-password?token=...` to verify the link is valid before showing the password form.

The token is a signed JWT (HS256) containing `applicantId`, `email`, and `purpose: "password-setup"`, expiring 48 hours after issuance.

---

## Validate Setup Token

**Description:**  
Verifies the token signature, checks expiry, and ensures the applicant hasn't already been linked to a user (single-use enforcement).

**Method:** `POST`  
**Path:** `/api/v1/users/validate-setup-token`

**Authentication:** None (the token itself is the credential)

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
    "name": "Juan Dela Cruz",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "studentId": "23-1234"
  }
}
```

**Response (invalid/expired):**
```json
{
  "success": false,
  "errors": ["Invalid or expired setup link. Please request a new one."]
}
```

**Response (already used):**
```json
{
  "success": false,
  "errors": ["This setup link has already been used. Please sign in instead."]
}
```

**Response (applicant not found):**
```json
{
  "success": false,
  "errors": ["Application not found. Please submit a new application."]
}
```

---

## Error Responses

```json
{
  "success": false,
  "errors": ["string"]
}
```

| Status | Meaning |
|--------|---------|
| 400 | Token validation failed (invalid, expired, already used, or applicant missing) |
| 500 | Internal server error |
