# Applicant Tracking API

## Overview
The Applicant Tracking API manages the recruitment and application pipeline for prospective MSC members. It tracks applications from submission through final hiring decision (APPLIED → INTERVIEWING → ACCEPTED/REJECTED).

---

## Endpoints

### 1. Create Applicant (Submit Application)

**Description:**  
Submits a new applicant to the MSC recruitment system. Validates required fields and URL links.

**Method:** `POST`  
**Path:** `/api/applicants`

**Request Parameters:**
- `name` (string, required): Applicant's full name (1-100 characters)
- `email` (string, required): Valid email address (must be unique)
- `departmentChoice` (string, required): Preferred department (1-100 characters)
- `resumeLink` (string, required): Valid URL to resume (e.g., Google Drive, GitHub, portfolio)
- `githubLink` (string, required): Valid GitHub profile or repository URL

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
    "status": "APPLIED",
    "createdAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/applicants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentChoice": "Software Engineering",
    "resumeLink": "https://drive.google.com/file/d/1234567890",
    "githubLink": "https://github.com/janesmith"
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
    "status": "APPLIED",
    "createdAt": "2026-06-15T10:30:00Z"
  },
  "message": "Application submitted successfully"
}
```

---

### 2. Get Applicant by ID

**Description:**  
Retrieves a specific applicant's details by their ID.

**Method:** `GET`  
**Path:** `/api/applicants/:applicantId`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

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
    "status": "APPLIED" | "INTERVIEWING" | "ACCEPTED" | "REJECTED",
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/applicants/660e8400-e29b-41d4-a716-446655440001 \
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
    "status": "APPLIED",
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
**Path:** `/api/applicants`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

**Query Parameters:**
- `status` (optional): Filter by status - `APPLIED`, `INTERVIEWING`, `ACCEPTED`, `REJECTED`
- `departmentChoice` (optional): Filter by department choice
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
        "status": string,
        "createdAt": string
      }
    ]
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:5000/api/applicants?status=APPLIED&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4. Update Applicant Status

**Description:**  
Updates an applicant's pipeline status. Only ADMIN/MEMBER users can update status.

**Method:** `PATCH`  
**Path:** `/api/applicants/:applicantId/status`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

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
    "status": "APPLIED" | "INTERVIEWING" | "ACCEPTED" | "REJECTED",
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/applicants/660e8400-e29b-41d4-a716-446655440001/status \
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
    "status": "INTERVIEWING",
    "updatedAt": "2026-06-15T11:00:00Z"
  },
  "message": "Applicant status updated successfully"
}
```

---

### 5. Update Applicant Details

**Description:**  
Updates an applicant's profile details. Only ADMIN/MEMBER users can update applicants.

**Method:** `PATCH`  
**Path:** `/api/applicants/:applicantId`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

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
    "status": string,
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/applicants/660e8400-e29b-41d4-a716-446655440001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "departmentChoice": "Data Science",
    "resumeLink": "https://drive.google.com/file/d/9876543210"
  }'
```

---

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400`: Bad request (validation error)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found (applicant ID doesn't exist)
- `409`: Conflict (email already exists)
- `500`: Internal server error
