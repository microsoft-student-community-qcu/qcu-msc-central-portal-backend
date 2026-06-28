# Event Registration Flow

## Registration

1. User clicks "Register Now".
2. User captures an image of their Student ID using the guided camera overlay.
3. Frontend sends the captured image to `POST /api/v1/ocr/verify`.
4. Backend runs **Zonal OCR** on predefined QCU ID card zones.
5. **If OCR succeeds:**
   - Backend returns `{ studentId, lastName, firstName, manualRequired: false, ocrSessionId }`.
   - Registration form is automatically pre-filled using extracted data.
   - User reviews and completes any remaining required fields.
6. **If OCR fails 3 consecutive times:**
   - Backend returns `{ manualRequired: true, ocrSessionId }`.
   - Frontend reveals the manual entry and photo upload form (hidden by default).
   - Registration is flagged as:
     ```json
     {
       "manual_registration": true
     }
     ```
7. User submits the registration form via `POST /api/v1/events/:eventId/register` with the `ocrSessionId`.
8. Backend validates the OCR session and registers the attendee.
   - If `manualRequired: true`, `manual_registration` is set to `true`.
   - The system validates the Student ID against existing attendees to prevent duplicate registrations.
9. User is shown a message instructing them to verify their email.
   - UI provides a "Change Email" option, which returns the user to the registration form.
   - User receives a verification email.
   - User clicks the verification link.
   - User is redirected to a confirmation page.

---

## Path A — Automatic Registration Approval

**Condition:** `manual_registration = false`

- Confirmation page displays:
  - Registration successful.
  - Instructions to check their email for their QR Pass.
- System immediately sends:
  - Registration confirmation email.
  - Event details.
  - QR Ticket / QR Pass.
  - Unique cancellation link.
- Registration status becomes:
  ```json
  {
    "status": "approved"
  }
  ```

---

## Path B — Manual Registration Review

**Condition:** `manual_registration = true`

- Confirmation page displays:
  - Email successfully verified.
  - Registration submitted for manual review.
  - Estimated review period (e.g., 1–3 business days).
  - Instructions to wait for an approval email.
- Registration status becomes:
  ```json
  {
    "status": "pending_review",
    "manual_registration": true
  }
  ```
- System sends an email confirming:
  - Application was received.
  - Manual verification is in progress.
  - QR Pass will only be sent after approval.
- Organizer/Admin reviews:
  - Uploaded Student ID.
  - Submitted information.
  - Eligibility and authenticity.
- **If approved:**
  - Registration status becomes:
    ```json
    {
      "status": "approved"
    }
    ```
  - System sends:
    - Approval email.
    - QR Ticket / QR Pass.
    - Event details.
    - Unique cancellation link.
- **If rejected:**
  - Registration status becomes:
    ```json
    {
      "status": "rejected"
    }
    ```
  - System sends a rejection email with the reason (optional).
