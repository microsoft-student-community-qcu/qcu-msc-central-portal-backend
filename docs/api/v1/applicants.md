# Applicant Tracking API

## Overview
The Applicant Tracking API manages the recruitment and application pipeline for prospective MSC members. It tracks applications from submission through final hiring decision (APPLIED → INTERVIEWING → ACCEPTED/REJECTED).

---

## Endpoints

### 1. Create Applicant (Submit Application)

**Description:**  
Submits a new applicant to the MSC recruitment system. **Must** be preceded by a `POST /api/v1/ocr/verify` call to obtain an `ocrSessionId` — this enforces the two-step verification flow (see [membership-application-flow.md](../../guides/flows/membership-application-flow.md)). The backend validates the OCR session and sets `manual_application` accordingly.

**Method:** `POST`  
**Path:** `/api/v1/applicants`

**Request Parameters:**
- `name` (string, required): Applicant's full name (1-100 characters)
- `email` (string, required): Valid email address (must be unique)
- `departmentChoice` (string, required): Preferred department (1-100 characters)
- `resumeLink` (string, required): Valid URL to resume (e.g., Google Drive, GitHub, portfolio)
- `githubLink` (string, required): Valid GitHub profile or repository URL
- `ocrSessionId` (string, required): OCR session token returned from `POST /api/v1/ocr/verify`
- `studentId` (string, optional): QCU Student ID (YY-NNNN format). Only needed in the manual entry fallback — when the OCR session has `studentId: null` (OCR failed after max attempts)

**Security note:** `manual_application` is never client-settable. If the OCR session indicates `manualRequired: true`, the backend sets `manual_application: true` regardless of the submitted `studentId` value.

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string (UUID),
    "name": string,
    "email": string,
    "departmentChoice": string,
    "resumeLink": string,
    "githubLink": string,
    "studentId": string | null,
    "status": "APPLIED",
    "manual_application": boolean,
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Status Codes:**
- `201`: Applicant created successfully
- `400`: Validation error (invalid fields, missing studentId, expired OCR session)
- `409`: Conflict (email already exists)
- `500`: Internal server error

**Example Request (OCR success):**
```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440004"
  }'
```

**Example Request (manual entry — after OCR failed 3×):**
```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440004",
    "studentId": "23-5678"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "studentId": "23-5678",
    "status": "APPLIED",
    "manual_application": false,
    "createdAt": "2026-06-15T10:30:00Z",
    "updatedAt": "2026-06-15T10:30:00Z"
  },
  "message": "Application submitted successfully"
}
```

---

### 2. Get Applicant by ID

**Description:**  
Retrieves a specific applicant's details by their ID.

**Method:** `GET`  
**Path:** `/api/v1/applicants/:applicantId`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "name": string,
    "email": string,
    "departmentChoice": string,
    "resumeLink": string,
    "githubLink": string,
    "studentId": string | null,
    "status": "APPLIED" | "INTERVIEWING" | "ACCEPTED" | "REJECTED",
    "manual_application": boolean,
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/v1/applicants/660e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "studentId": "23-5678",
    "status": "APPLIED",
    "manual_application": false,
    "createdAt": "2026-06-15T10:30:00Z",
    "updatedAt": "2026-06-15T10:30:00Z"
  },
  "message": "Applicant retrieved successfully"
}
```

---

### 3. List All Applicants (with filtering)

**Description:**  
Retrieves all applicants with optional filtering by status or department.

**Method:** `GET`  
**Path:** `/api/v1/applicants`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Query Parameters:**
- `status` (optional): Filter by status - `APPLIED`, `INTERVIEWING`, `ACCEPTED`, `REJECTED`
- `departmentChoice` (optional): Filter by department choice
- `manual_application` (optional): Filter by manual application flag — `true` or `false`
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "total": number,
    "applicants": [
      {
        "id": string,
        "name": string,
        "email": string,
        "departmentChoice": string,
        "studentId": string | null,
        "status": string,
        "manual_application": boolean,
        "createdAt": string
      }
    ]
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:5000/api/v1/applicants?status=APPLIED&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4. Update Applicant Status

**Description:**  
Updates an applicant's pipeline status. Only ADMIN_HR users can update status.

**Method:** `PATCH`  
**Path:** `/api/v1/applicants/:applicantId/status`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Request Parameters:**
- `status` (enum, required): New status - `APPLIED`, `INTERVIEWING`, `ACCEPTED`, or `REJECTED`

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "name": string,
    "email": string,
    "studentId": string | null,
    "status": "APPLIED" | "INTERVIEWING" | "ACCEPTED" | "REJECTED",
    "manual_application": boolean,
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v1/applicants/660e8400-e29b-41d4-a716-446655440001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "status": "INTERVIEWING"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "studentId": "23-5678",
    "status": "INTERVIEWING",
    "manual_application": false,
    "updatedAt": "2026-06-15T11:00:00Z"
  },
  "message": "Applicant status updated successfully"
}
```

---

### 5. Update Applicant Details

**Description:**  
Updates an applicant's profile details. Only ADMIN_HR users can update applicants.

**Method:** `PATCH`  
**Path:** `/api/v1/applicants/:applicantId`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Request Parameters:**
- `name` (string, optional): Updated name
- `email` (string, optional): Updated email (must be unique)
- `departmentChoice` (string, optional): Updated department choice
- `resumeLink` (string, optional): Updated resume URL
- `githubLink` (string, optional): Updated GitHub URL

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "name": string,
    "email": string,
    "departmentChoice": string,
    "resumeLink": string,
    "githubLink": string,
    "studentId": string | null,
    "status": string,
    "manual_application": boolean,
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v1/applicants/660e8400-e29b-41d4-a716-446655440001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "departmentChoice": "Data Science",
    "resumeLink": "https://drive.google.com/file/d/9876543210"
  }'
```

---

## Validation Errors

All validation errors return `400` with the following shape:

```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "<field>": ["<human-readable message>"]
  }
}
```

**Example — missing `ocrSessionId`:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "ocrSessionId": [
      "OCR session ID is required. Call POST /api/v1/ocr/verify first."
    ]
  }
}
```

**Example — invalid UUID format for `ocrSessionId`:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "ocrSessionId": [
      "OCR session ID format is invalid. Provide a valid session ID from POST /api/v1/ocr/verify."
    ]
  }
}
```

**Example — invalid `studentId` format:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "studentId": [
      "Student ID format must be YY-NNNN (e.g., 23-1234)"
    ]
  }
}
```

---

## Replication / Testing

### Scenario A — OCR success (normal flow)

```bash
# Step 1: Verify a valid Student ID image
curl -X POST http://localhost:5000/api/v1/ocr/verify \
  -F "image=@valid_student_id.jpg"

# → Response (200):
# {
#   "data": {
#     "ocrSessionId": "abc-123-...",
#     "studentId": "23-5678",
#     "lastName": "SMITH",
#     "firstName": "Jane",
#     "manualRequired": false,
#     "attemptsRemaining": 3
#   }
# }

# Step 2: Submit application with the ocrSessionId (no studentId needed)
curl -X POST http://localhost:5000/api/v1/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "ocrSessionId": "abc-123-..."
  }'

# → Response (201):
# {
#   "success": true,
#   "data": { "manual_application": false, ... },
#   "message": "Application submitted successfully"
# }
```

### Scenario B — Manual entry after 3 OCR failures

```bash
# Step 1: Send a non-ID image 3 times
curl -X POST http://localhost:5000/api/v1/ocr/verify \
  -F "image=@random_photo.jpg"
# → 422, manualRequired: false, attemptsRemaining: 2

curl -X POST http://localhost:5000/api/v1/ocr/verify \
  -F "image=@random_photo.jpg"
# → 422, manualRequired: false, attemptsRemaining: 1

curl -X POST http://localhost:5000/api/v1/ocr/verify \
  -F "image=@random_photo.jpg"
# → 422, manualRequired: true, attemptsRemaining: 0
# Response:
# {
#   "data": {
#     "ocrSessionId": "def-456-...",
#     "studentId": null,
#     "lastName": null,
#     "firstName": null,
#     "manualRequired": true,
#     "attemptsRemaining": 0
#   }
# }

# Step 2: Submit application with studentId manually provided
curl -X POST http://localhost:5000/api/v1/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith",
    "ocrSessionId": "def-456-...",
    "studentId": "23-5678"
  }'

# → Response (201):
# {
#   "success": true,
#   "data": { "manual_application": true, ... },
#   "message": "Application submitted successfully"
# }
```

### Scenario C — Missing ocrSessionId (error)

```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith"
  }'

# → Response (400):
# {
#   "success": false,
#   "message": "Validation error",
#   "errors": {
#     "ocrSessionId": [
#       "OCR session ID is required. Call POST /api/v1/ocr/verify first."
#     ]
#   }
# }
```

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400`: Bad request — see [Validation Errors](#validation-errors) above for examples
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found (applicant ID doesn't exist)
- `409`: Conflict (email already exists)
- `500`: Internal server error
