# Event Registration Flow

## Registration

1. User clicks "Register Now".
2. User captures an image of their Student ID.
3. System performs Zonal OCR to extract student information.
4. **If OCR succeeds:**
   - Extracted data is used to automatically pre-fill the registration form.
   - User reviews and completes any remaining required fields.
5. **If OCR fails 3 times:**
   - User uploads a photo of their Student ID manually.
   - User manually fills out the registration form.
   - Registration is flagged as:
     ```json
     {
       "manual_registration": true
     }
     ```
   - Registration will require manual verification by organizers.
6. User submits the registration form.
7. System validates the Student ID against existing attendees to prevent duplicate registrations.
8. **If validation succeeds:**
   - User is shown a message instructing them to verify their email.
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
