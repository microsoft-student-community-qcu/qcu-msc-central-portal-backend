# Organization Membership Application Flow

## Application

1. User clicks "Apply".
2. User captures an image of their Student ID using the guided camera overlay.
3. Frontend sends the captured image to `POST /api/v1/ocr/verify`.
4. Backend runs **Zonal OCR** on predefined QCU ID card zones.
5. **If OCR succeeds:**
   - Backend returns `{ studentId, lastName, firstName, manualRequired: false, ocrSessionId }`.
   - Application form is automatically pre-filled using extracted data.
   - User reviews and completes remaining fields.
6. **If OCR fails 3 consecutive times:**
   - Backend returns `{ manualRequired: true, ocrSessionId }`.
   - Frontend reveals the manual entry form (hidden by default).
   - User uploads a Student ID image and manually completes the form.
   - Application is flagged as:
     ```json
     {
       "manual_application": true
     }
     ```
7. User submits the application via `POST /api/v1/applicants` with the `ocrSessionId`.
8. Backend validates the OCR session and creates the applicant record.
   - If `manualRequired: true`, `manual_application` is set to `true`.
   - If OCR succeeded, `manual_application` remains `false`.
9. System sends an email containing:
   - Password setup link (this link will also act as email verification link).

---

## Account Activation

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
