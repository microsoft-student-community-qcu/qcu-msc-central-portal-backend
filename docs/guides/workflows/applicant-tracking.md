# Workflow — Applicant Pipeline Management (ADMIN_HR)

## Overview

The applicant pipeline is managed exclusively by ADMIN_HR users. Applications are submitted via the public `POST /api/v1/applicants` endpoint and enter a `PENDING_REVIEW` queue.

---

## Application

1. User clicks "Apply".
2. User captures an image of their Student ID using the guided camera overlay.
3. Frontend sends the captured image to `POST /api/v1/ocr/verify`.
4. Backend runs **Zonal OCR** on predefined QCU ID card zones.
5. **If OCR succeeds:**
   - Backend returns `{ studentId, lastName, firstName, middleInitial, manualRequired: false, ocrSessionId }`.
   - Application form is automatically pre-filled using extracted data.
   - User reviews and completes the multi-section form:
     - **Personal Information** — firstName, lastName, middleName, gender, campus, dateOfBirth, nationality
     - **Contact Information** — phoneNumber, qcuMscEmail, emergencyContactName, emergencyContactNumber
     - **Academic Information** — college, program, yearLevel, studentType
     - **Supporting Requirements (Optional)** — portfolio, githubOrProjectLinks, previousWorksAchievements
     - **Why Join** — reasonForJoining, expectations
     - **File Uploads** — Certificate of Registration (required), Curriculum Vitae (required)
6. **If OCR fails 3 consecutive times:**
   - Backend returns `{ manualRequired: true, ocrSessionId }`.
   - Frontend reveals the manual entry form (hidden by default).
   - User uploads a Student ID image and manually completes the entire form.
   - Application is flagged as `{ "manual_application": true }`.
7. User submits the application via `POST /api/v1/applicants` (multipart/form-data) with the `ocrSessionId`, all text fields, and the two required file uploads.
8. Backend validates the OCR session, saves uploaded files, and creates the applicant record.
   - If `manualRequired: true`, `manual_application` is set to `true`.
   - If OCR succeeded, `manual_application` remains `false`.
9. System sends an email containing:
   - Password setup link (this link will also act as email verification link).

### Account Activation

1. User clicks the link from the email.
2. User sets their password.
   - This step also serves as email verification.
3. Upon successful password creation:
   - User account is activated.
   - User is automatically authenticated.
   - User is redirected to: `/portal/tracking`

The tracking page displays:
- Application status.
- Application progress.

**Key Decision Points:**
- No authentication required for submission (open recruitment)
- Student ID is verified via backend Zonal OCR + Regex (frontend never runs OCR)
- Manual fallback applications flagged as `{"manual_application": true}` for admin review
- File uploads (CoR, CV) validated server-side; errors batched with text field errors

---

## Admin Pipeline Management

```
ADMIN_HR logs in to dashboard
	↓
Accesses "Applicant Tracking" section
	↓
Views list of all applications (GET /api/v1/applicants)
	↓
Quarantine Queue — Applicants with manual_application = true
  flagged with a warning icon
	↓
  Click → Specialized view with uploaded ID photo
           side-by-side with typed student number
  "Approve ID" → unlocks status mutator
	↓
Admin views applicant details (GET /api/v1/applicants/:id):
  - Personal Info: Name, gender, campus, DOB, nationality
  - Contact Info: Phone, QCU MSC email, emergency contact
  - Academic Info: College, program, year level, student type
  - Supporting Requirements: Portfolio URL, GitHub/project links, achievements
  - Documents: Certificate of Registration, Curriculum Vitae
  - Why Join: Reason for joining, expectations
  - Current status and admin remarks
	↓
Admin reviews qualifications
	↓
Admin updates status (PATCH /api/v1/applicants/:id/status):
  
  Route 1: PENDING_REVIEW → APPROVED
	↓ Send acceptance offer email
	↓ Update User role to MEMBER
	↓
  Route 2: PENDING_REVIEW → REJECTED
	↓ Send rejection email
	↓
  Route 3: Any → CANCELLED
	↓
Admin may also update any field (PATCH /api/v1/applicants/:id)
	↓
Status updated in database
	↓
Dashboard refreshed with new status
```

## Status Flow

```
PENDING_REVIEW (initial submission)
  ├─→ APPROVED (admin accepts → User becomes MEMBER)
  └─→ REJECTED (admin denies)
CANCELLED (can be set from any status)
```

## API Endpoints

| Method | Endpoint | Action | Auth |
|--------|----------|--------|------|
| GET | `/api/v1/applicants` | List all applicants | ADMIN_HR |
| GET | `/api/v1/applicants/:id` | View applicant details | ADMIN_HR |
| PATCH | `/api/v1/applicants/:id` | Update applicant fields | ADMIN_HR |
| PATCH | `/api/v1/applicants/:id/status` | Update applicant status | ADMIN_HR |

**Key Decision Points:**
- Only ADMIN_HR can update status
- Accepted applicants automatically become MEMBER users (User role updated)
- Email notifications sent at each status transition
