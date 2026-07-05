# Setup Token Validation API

## Overview

Checks if the password-setup link from the email is still valid and has not been used yet. The frontend calls this endpoint when the user opens `/auth/setup-password?token=...` to make sure the link works before showing the password form.

The token expires 48 hours after it is created.

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
    "name": "Juan Dela Cruz",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "studentId": "23-1234"
  }
}
```

**Response (invalid or expired):**
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
| 400 | Token check failed (invalid, expired, already used, or applicant not found) |
| 500 | Internal server error |
