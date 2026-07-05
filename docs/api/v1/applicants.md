# Applicant Tracking API

## Overview
The Applicant Tracking API manages the recruitment and application pipeline for prospective MSC members. It tracks applications from submission through final hiring decision (APPLIED → INTERVIEWING → ACCEPTED/REJECTED).

The submission endpoint accepts **multipart/form-data** to support file uploads (Certificate of Registration, Curriculum Vitae).

---

## Endpoints

### 1. Create Applicant (Submit Application)

**Description:**  
Submits a new applicant to the MSC recruitment system. **Must** be preceded by a `POST /api/v1/ocr/verify` call to obtain an `ocrSessionId` — this enforces the two-step verification flow (see [applicant-tracking.md](../../guides/workflows/applicant-tracking.md)). The backend validates the OCR session and sets `manual_application` accordingly.

**Method:** `POST`  
**Path:** `/api/v1/applicants`  
**Content-Type:** `multipart/form-data`

**Rate Limit:** 5 requests per minute per IP

**Request Fields:**

#### Personal Information
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `lastName` | string | Yes | 1-100 characters |
| `firstName` | string | Yes | 1-100 characters |
| `middleInitial` | string | No | Single letter, optionally followed by a dot (e.g., B or B.) |
| `email` | string | Yes | Valid email address (must be unique — account/login email) |
| `college` | string | Yes | 1-200 characters |
| `program` | string | Yes | 1-200 characters |
| `section` | string | Yes | 1-100 characters |
| `campus` | enum | Yes | `SAN_BARTOLOME_MAIN`, `SAN_FRANCISCO`, or `BATASAN` |
| `studentId` | string | No* | YY-NNNN format (e.g., 23-1234) — only needed for manual entry fallback |
| `dateOfBirth` | string | Yes | YYYY-MM-DD format (e.g., 2000-01-15) |
| `placeOfBirth` | string | Yes | 1-300 characters |
| `gender` | enum | Yes | `MALE`, `FEMALE`, `LGBTQIA`, or `PREFER_NOT_TO_SAY` |
| `membershipRole` | string | Yes | 1-200 characters |
| `certificateOfRegistration` | file | Yes | PDF, JPEG, PNG, or DOCX — max 10MB |
| `curriculumVitae` | file | Yes | PDF, JPEG, PNG, or DOCX — max 10MB |

#### Contact Information
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `houseAddress` | string | Yes | 1-500 characters |
| `cellphoneNumber` | string | Yes | 11 digits starting with 09 (e.g., 09123456789) |
| `qcuMscEmail` | string | Yes | Must end with @qcu.edu.ph (must be unique) |
| `facebookLink` | string | Yes | Valid URL (e.g., https://facebook.com/...) |

#### Additional Information
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `interestsSkillsHobbies` | string | Yes | Text area |
| `organizationHistory` | string | Yes | Text area — specify organization details or "N/A" |

#### Supporting Requirements (Optional)
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `portfolio` | string | No | Valid URL |
| `githubOrProjectLinks` | string | No | Valid URL |
| `previousWorksAchievements` | string | No | Text area |
| `ocrSessionId` | string | Yes | UUID — received from `POST /api/v1/ocr/verify` |

**Security note:** `manual_application` is never client-settable. If the OCR session indicates `manualRequired: true`, the backend sets `manual_application: true` regardless of the submitted `studentId` value.

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string (UUID),
    "lastName": string,
    "firstName": string,
    "middleInitial": string | null,
    "email": string,
    "college": string,
    "program": string,
    "section": string,
    "campus": "SAN_BARTOLOME_MAIN" | "SAN_FRANCISCO" | "BATASAN",
    "studentId": string,
    "dateOfBirth": string (ISO 8601),
    "placeOfBirth": string,
    "gender": "MALE" | "FEMALE" | "LGBTQIA" | "PREFER_NOT_TO_SAY",
    "membershipRole": string,
    "houseAddress": string,
    "cellphoneNumber": string,
    "qcuMscEmail": string,
    "facebookLink": string,
    "interestsSkillsHobbies": string,
    "organizationHistory": string,
    "portfolio": string | null,
    "githubOrProjectLinks": string | null,
    "previousWorksAchievements": string | null,
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
- `400`: Validation error (invalid fields, missing studentId, missing files, expired OCR session)
- `409`: Conflict (email or qcuMscEmail already exists)
- `429`: Rate limit exceeded
- `500`: Internal server error

**Example Request (OCR success):**
```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -F "lastName=Smith" \
  -F "firstName=Jane" \
  -F "middleInitial=B" \
  -F "email=jane@example.com" \
  -F "college=College of Engineering" \
  -F "program=BS Computer Engineering" \
  -F "section=CPE-3A" \
  -F "campus=SAN_BARTOLOME_MAIN" \
  -F "dateOfBirth=2002-05-15" \
  -F "placeOfBirth=Quezon City" \
  -F "gender=FEMALE" \
  -F "membershipRole=Active Member" \
  -F "houseAddress=123 Mabini St., Brgy. San Jose, Quezon City" \
  -F "cellphoneNumber=09123456789" \
  -F "qcuMscEmail=jane.smith@qcu.edu.ph" \
  -F "facebookLink=https://facebook.com/janesmith" \
  -F "interestsSkillsHobbies=Programming, photography, badminton" \
  -F "organizationHistory=Former VP of CCS Student Government" \
  -F "ocrSessionId=990e8400-e29b-41d4-a716-446655440004" \
  -F "certificateOfRegistration=@cor.pdf" \
  -F "curriculumVitae=@cv.pdf"
```

**Example Request (manual entry — after OCR failed 3×):**
```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -F "lastName=Smith" \
  -F "firstName=Jane" \
  -F "email=jane@example.com" \
  -F "college=College of Engineering" \
  -F "program=BS Computer Engineering" \
  -F "section=CPE-3A" \
  -F "campus=SAN_BARTOLOME_MAIN" \
  -F "dateOfBirth=2002-05-15" \
  -F "placeOfBirth=Quezon City" \
  -F "gender=FEMALE" \
  -F "membershipRole=Active Member" \
  -F "houseAddress=123 Mabini St., Brgy. San Jose, Quezon City" \
  -F "cellphoneNumber=09123456789" \
  -F "qcuMscEmail=jane.smith@qcu.edu.ph" \
  -F "facebookLink=https://facebook.com/janesmith" \
  -F "interestsSkillsHobbies=Programming, photography, badminton" \
  -F "organizationHistory=Former VP of CCS Student Government" \
  -F "studentId=23-5678" \
  -F "ocrSessionId=990e8400-e29b-41d4-a716-446655440004" \
  -F "certificateOfRegistration=@cor.pdf" \
  -F "curriculumVitae=@cv.pdf"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "lastName": "Smith",
    "firstName": "Jane",
    "middleInitial": "B",
    "email": "jane@example.com",
    "college": "College of Engineering",
    "program": "BS Computer Engineering",
    "section": "CPE-3A",
    "campus": "SAN_BARTOLOME_MAIN",
    "studentId": "23-5678",
    "dateOfBirth": "2002-05-15T00:00:00.000Z",
    "placeOfBirth": "Quezon City",
    "gender": "FEMALE",
    "membershipRole": "Active Member",
    "houseAddress": "123 Mabini St., Brgy. San Jose, Quezon City",
    "cellphoneNumber": "09123456789",
    "qcuMscEmail": "jane.smith@qcu.edu.ph",
    "facebookLink": "https://facebook.com/janesmith",
    "interestsSkillsHobbies": "Programming, photography, badminton",
    "organizationHistory": "Former VP of CCS Student Government",
    "portfolio": null,
    "githubOrProjectLinks": null,
    "previousWorksAchievements": null,
    "status": "APPLIED",
    "manual_application": false,
    "createdAt": "2026-06-15T10:30:00Z",
    "updatedAt": "2026-06-15T10:30:00Z"
  },
  "message": "Application submitted successfully"
}
```

---

### 2. Resend Setup Link

**Description:**  
Resends the password-setup email for applicants who haven't created an account yet. The endpoint looks up the applicant by email where `userId IS NULL` (not yet linked to a user account). If found, a new signed JWT (48h expiry) is generated and a fresh email is sent.

Always returns the same success message even if the email was not found — this keeps the user's email private and prevents attackers from guessing which emails are registered.

**Rate Limit:** 3 requests per minute per IP

**Method:** `POST`  
**Path:** `/api/v1/applicants/resend-setup-link`

**Authentication:** None (public)

**Request:**
```json
{
  "email": "juan@gmail.com"
}
```

**Response (always, regardless of match):**
```json
{
  "success": true,
  "message": "If an account exists, a new setup link has been sent."
}
```

**Status Codes:**
- `200`: Success (always the same message — even if email not found or already linked)
- `400`: Validation error (invalid email format)
- `429`: Rate limit exceeded
- `500`: Internal server error

---

### 3. Get Applicant by ID

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
    "lastName": string,
    "firstName": string,
    "middleInitial": string | null,
    "email": string,
    "college": string,
    "program": string,
    "section": string,
    "campus": "SAN_BARTOLOME_MAIN" | "SAN_FRANCISCO" | "BATASAN",
    "studentId": string | null,
    "dateOfBirth": string (ISO 8601),
    "placeOfBirth": string,
    "gender": "MALE" | "FEMALE" | "LGBTQIA" | "PREFER_NOT_TO_SAY",
    "membershipRole": string,
    "houseAddress": string,
    "cellphoneNumber": string,
    "qcuMscEmail": string,
    "facebookLink": string,
    "interestsSkillsHobbies": string,
    "organizationHistory": string,
    "portfolio": string | null,
    "githubOrProjectLinks": string | null,
    "previousWorksAchievements": string | null,
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
    "lastName": "Smith",
    "firstName": "Jane",
    "middleInitial": "B",
    "email": "jane@example.com",
    "college": "College of Engineering",
    "program": "BS Computer Engineering",
    "section": "CPE-3A",
    "campus": "SAN_BARTOLOME_MAIN",
    "studentId": "23-5678",
    "dateOfBirth": "2002-05-15T00:00:00.000Z",
    "placeOfBirth": "Quezon City",
    "gender": "FEMALE",
    "membershipRole": "Active Member",
    "houseAddress": "123 Mabini St., Brgy. San Jose, Quezon City",
    "cellphoneNumber": "09123456789",
    "qcuMscEmail": "jane.smith@qcu.edu.ph",
    "facebookLink": "https://facebook.com/janesmith",
    "interestsSkillsHobbies": "Programming, photography, badminton",
    "organizationHistory": "Former VP of CCS Student Government",
    "portfolio": null,
    "githubOrProjectLinks": null,
    "previousWorksAchievements": null,
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
Retrieves all applicants with optional filtering by status, campus, or gender.

**Method:** `GET`  
**Path:** `/api/v1/applicants`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Query Parameters:**
- `status` (optional): Filter by status — `APPLIED`, `INTERVIEWING`, `ACCEPTED`, `REJECTED`
- `campus` (optional): Filter by campus — `SAN_BARTOLOME_MAIN`, `SAN_FRANCISCO`, `BATASAN`
- `gender` (optional): Filter by gender — `MALE`, `FEMALE`, `LGBTQIA`, `PREFER_NOT_TO_SAY`
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
        "lastName": string,
        "firstName": string,
        "middleInitial": string | null,
        "email": string,
        "college": string,
        "program": string,
        "section": string,
        "campus": string,
        "studentId": string | null,
        "gender": string,
        "membershipRole": string,
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
curl -X GET "http://localhost:5000/api/v1/applicants?status=APPLIED&campus=SAN_BARTOLOME_MAIN&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 5. Update Applicant Status

**Description:**  
Updates an applicant's pipeline status. Only ADMIN_HR users can update status.

**Method:** `PATCH`  
**Path:** `/api/v1/applicants/:applicantId/status`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Request Parameters:**
- `status` (enum, required): New status — `APPLIED`, `INTERVIEWING`, `ACCEPTED`, or `REJECTED`

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "lastName": string,
    "firstName": string,
    "middleInitial": string | null,
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
    "lastName": "Smith",
    "firstName": "Jane",
    "middleInitial": "B",
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

### 6. Update Applicant Details

**Description:**  
Updates an applicant's profile details. Only ADMIN_HR users can update applicants.

**Method:** `PATCH`  
**Path:** `/api/v1/applicants/:applicantId`

**Authentication:** Required (Bearer token, ADMIN_HR only)

**Request Parameters:**
All fields from the create schema are available as optional parameters. See [Create Applicant](#1-create-applicant-submit-application) for the full field list. File re-upload for `certificateOfRegistration` and `curriculumVitae` also supported.

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "lastName": string,
    "firstName": string,
    "middleInitial": string | null,
    "email": string,
    "college": string,
    "program": string,
    "section": string,
    "campus": string,
    "studentId": string | null,
    "dateOfBirth": string (ISO 8601),
    "placeOfBirth": string,
    "gender": string,
    "membershipRole": string,
    "houseAddress": string,
    "cellphoneNumber": string,
    "qcuMscEmail": string,
    "facebookLink": string,
    "interestsSkillsHobbies": string,
    "organizationHistory": string,
    "portfolio": string | null,
    "githubOrProjectLinks": string | null,
    "previousWorksAchievements": string | null,
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
    "program": "BS Data Science",
    "membershipRole": "Senior Member"
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

**Example — invalid `cellphoneNumber`:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "cellphoneNumber": [
      "Cellphone number must be 11 digits starting with 09 (e.g., 09123456789)"
    ]
  }
}
```

**Example — invalid `qcuMscEmail`:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "qcuMscEmail": [
      "QCU MSC email must end with @qcu.edu.ph"
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

# Step 2: Submit application with all fields + files
curl -X POST http://localhost:5000/api/v1/applicants \
  -F "lastName=Smith" \
  -F "firstName=Jane" \
  -F "email=jane@example.com" \
  -F "college=College of Engineering" \
  -F "program=BS Computer Engineering" \
  -F "section=CPE-3A" \
  -F "campus=SAN_BARTOLOME_MAIN" \
  -F "dateOfBirth=2002-05-15" \
  -F "placeOfBirth=Quezon City" \
  -F "gender=FEMALE" \
  -F "membershipRole=Active Member" \
  -F "houseAddress=123 Mabini St." \
  -F "cellphoneNumber=09123456789" \
  -F "qcuMscEmail=jane.smith@qcu.edu.ph" \
  -F "facebookLink=https://facebook.com/janesmith" \
  -F "interestsSkillsHobbies=Programming, photography" \
  -F "organizationHistory=N/A" \
  -F "ocrSessionId=abc-123-..." \
  -F "certificateOfRegistration=@cor.pdf" \
  -F "curriculumVitae=@cv.pdf"

# → Response (201): { "success": true, "data": { "manual_application": false, ... } }
```

### Scenario B — Manual entry after 3 OCR failures

```bash
# Step 1: Send a non-ID image 3 times (same as before)
# → 3rd failure returns manualRequired: true, ocrSessionId: "def-456-..."

# Step 2: Submit application with studentId manually provided
curl -X POST http://localhost:5000/api/v1/applicants \
  -F "lastName=Smith" \
  -F "firstName=Jane" \
  -F "email=jane@example.com" \
  -F "college=College of Engineering" \
  -F "program=BS Computer Engineering" \
  -F "section=CPE-3A" \
  -F "campus=SAN_BARTOLOME_MAIN" \
  -F "dateOfBirth=2002-05-15" \
  -F "placeOfBirth=Quezon City" \
  -F "gender=FEMALE" \
  -F "membershipRole=Active Member" \
  -F "houseAddress=123 Mabini St." \
  -F "cellphoneNumber=09123456789" \
  -F "qcuMscEmail=jane.smith@qcu.edu.ph" \
  -F "facebookLink=https://facebook.com/janesmith" \
  -F "interestsSkillsHobbies=Programming, photography" \
  -F "organizationHistory=N/A" \
  -F "studentId=23-5678" \
  -F "ocrSessionId=def-456-..." \
  -F "certificateOfRegistration=@cor.pdf" \
  -F "curriculumVitae=@cv.pdf"

# → Response (201): { "success": true, "data": { "manual_application": true, ... } }
```

### Scenario C — Missing ocrSessionId (error)

```bash
curl -X POST http://localhost:5000/api/v1/applicants \
  -F "lastName=Smith" \
  -F "firstName=Jane" \
  -F "email=jane@example.com" \
  -F "college=College of Engineering" \
  -F "program=BS Computer Engineering" \
  -F "section=CPE-3A" \
  -F "campus=SAN_BARTOLOME_MAIN" \
  -F "dateOfBirth=2002-05-15" \
  -F "placeOfBirth=Quezon City" \
  -F "gender=FEMALE" \
  -F "membershipRole=Active Member" \
  -F "houseAddress=123 Mabini St." \
  -F "cellphoneNumber=09123456789" \
  -F "qcuMscEmail=jane.smith@qcu.edu.ph" \
  -F "facebookLink=https://facebook.com/janesmith" \
  -F "interestsSkillsHobbies=Programming" \
  -F "organizationHistory=N/A" \
  -F "certificateOfRegistration=@cor.pdf" \
  -F "curriculumVitae=@cv.pdf"

# → Response (400): { "success": false, "errors": { "ocrSessionId": [...] } }
```

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400`: Bad request — see [Validation Errors](#validation-errors) above for examples
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found (applicant ID doesn't exist)
- `409`: Conflict (email or qcuMscEmail already exists)
- `429`: Rate limit exceeded (5 req/min/IP)
- `500`: Internal server error
