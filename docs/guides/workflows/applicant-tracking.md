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
   - Backend returns `{ ocrSessionId, studentId, lastName, firstName, middleInitial, manualRequired: false }`.
   - Application form is automatically pre-filled using extracted data.
   - User reviews and completes the multi-section form:
     - **Personal Information** — firstName, lastName, middleName, gender, campus, dateOfBirth, nationality
     - **Contact Information** — phoneNumber, emergencyContactName, emergencyContactNumber
     - **Academic Information** — college, program, yearLevel, studentType
     - **Supporting Requirements (Optional)** — portfolio, githubOrProjectLinks, previousWorksAchievements
     - **Why Join** — reasonForJoining, expectations
     - **File Uploads** — Certificate of Registration (required), Curriculum Vitae (required)
6. **If OCR fails 3 consecutive times:**
   - Backend returns `{ manualRequired: true, ocrSessionId }`.
   - Frontend reveals the manual entry form (hidden by default).
   - User uploads a Student ID image and manually completes the entire form.
   - Application is flagged as `{ "manual_application": true }`.
7. User submits the application via one of two methods:
   - **Single submission** (legacy): `POST /api/v1/applicants` (multipart/form-data) with all fields, files, and `ocrSessionId` at once.
   - **Multi-step draft** (recommended): 4 sequential endpoints that persist and validate each step:
     - `POST /api/v1/applicants/draft` — Batch 0: name, email, ocrSessionId → returns `draftId`
     - `PATCH /api/v1/applicants/draft/:draftId/batch-1` — Batch 1: personal info (DOB, gender, address, etc.)
     - `PATCH /api/v1/applicants/draft/:draftId/batch-2` — Batch 2: academic info + file uploads
     - `POST /api/v1/applicants/draft/:draftId/submit` — Batch 3 (final): additional info → creates Applicant record, sends setup email
   - Each batch is validated immediately; errors are caught at the current step, not at the end.
   - Steps cannot be skipped — each endpoint checks the previous step was completed.
   - The `draftId` is stored in localStorage by the frontend, allowing users to resume after a page refresh.
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
  ├─→ FOR_INTERVIEW (admin marks for interview)
  │     ├─→ APPROVED (admin accepts → User becomes MEMBER)
  │     ├─→ REJECTED (admin denies)
  │     └─→ RESUBMIT (admin requests changes + message)
  │           └─→ PENDING_REVIEW (applicant resubmits → clears message)
  ├─→ APPROVED (admin accepts → User becomes MEMBER)
  ├─→ REJECTED (admin denies)
  └─→ RESUBMIT (admin requests changes + message)
        └─→ PENDING_REVIEW (applicant resubmits → clears message)
CANCELLED (applicant or admin, from any status other than APPROVED)
```

## API Endpoints

| Method | Endpoint | Action | Auth |
|--------|----------|--------|------|
| GET | `/api/v1/applicants` | List all applicants | ADMIN_HR |
| GET | `/api/v1/applicants/:id` | View applicant details | ADMIN_HR |
| PATCH | `/api/v1/applicants/:id` | Update applicant fields | ADMIN_HR |
| PATCH | `/api/v1/applicants/:id/status` | Update applicant status | ADMIN_HR |
| POST | `/api/v1/applicants/draft` | Create application draft | Public |
| PATCH | `/api/v1/applicants/draft/:id/batch-1` | Save personal info (Batch 1) | Public |
| PATCH | `/api/v1/applicants/draft/:id/batch-2` | Save academic info + files (Batch 2) | Public |
| POST | `/api/v1/applicants/draft/:id/submit` | Finalize draft → create Applicant (Batch 3) | Public |

**Key Decision Points:**
- Only ADMIN_HR can update status
- Setting status to `APPROVED` **automatically** updates the linked `User.role` to `MEMBER` (server-side)
- Applicant must first be linked to a User account via `POST /api/v1/users/link-applicant` before approval
- Email notifications sent at each status transition
