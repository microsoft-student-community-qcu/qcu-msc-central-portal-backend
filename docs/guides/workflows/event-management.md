# Workflow — Event Management

## Create Event (ADMIN_LOGISTICS)

```
ADMIN_LOGISTICS logs in
	↓
Clicks "Create Event"
	↓
Fills event details:
  - Title, description
  - Date/time (future date)
  - Type: PUBLIC or MEMBERS_ONLY
  - Max capacity
	↓
System validates input (Zod schema: createEventSchema)
	↓
Date in past? → Error: "Event date must be in future"
	↓
Create Event record in database
	↓
Event published ✓
	↓
Event appears in event listings
```

**Key Decision Points:**
- Only ADMIN_LOGISTICS can create events
- PUBLIC events visible to all, MEMBERS_ONLY restricted
- Capacity limits enforce registration cutoff

---

## Event Registration

### Registration

1. User clicks "Register Now".
2. User captures an image of their Student ID using the guided camera overlay.
3. Frontend sends the captured image to `POST /api/v1/ocr/verify`.
4. Backend runs **Zonal OCR** on predefined QCU ID card zones.
5. **If OCR succeeds:**
   - Backend returns `{ studentId, lastName, firstName, middleInitial, manualRequired: false, ocrSessionId }`.
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

### Path A — Automatic Registration Approval

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

### Path B — Manual Registration Review

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
- Logistics admin can resolve the pending registration via `PATCH /api/v1/events/:eventId/registrations/:registrationId/approve`.
  - Request body:
    ```json
    {
      "action": "approve"
    }
    ```
    or
    ```json
    {
      "action": "reject"
    }
    ```
  - If approved:
    - Registration status becomes:
      ```json
      {
        "status": "APPROVED"
      }
      ```
    - Backend logs a stub email with the QR ticket URL derived from the registration's `qrPayload`.
  - If rejected:
    - Registration status becomes:
      ```json
      {
        "status": "REJECTED"
      }
      ```
    - Backend logs a stub rejection email message.

---

### Members-Only Events (Authenticated)

- Authenticated members bypass the Zonal OCR entirely — credentials are auto-pulled.
- System checks role (MEMBER only) and capacity, then dispatches the QR ticket directly.

---

## Event Check-In

```
Event day arrives
	↓
ADMIN_LOGISTICS opens check-in dashboard
	↓
Views event and list of registrations
	↓
Student arrives at event
	↓
Student shows QR code (from email or phone)
	↓
Admin scans/enters QR code
	↓
System looks up Registration by qrPayload
	↓
Check: Already marked attended?
	↓ Yes: Error: "Already checked in"
	↓ No: Continue
	↓
Update Registration record:
  - hasAttended = true
	↓
Display: "✓ {Name} checked in successfully"
	↓
Attendance recorded ✓
```

---

## Event Cancellation

### Admin-Driven (Whole Event)

```
Event date approaching
	↓
Admin decides to cancel event (e.g., low registrations, unexpected issue)
	↓
Admin clicks "Delete Event"
	↓
System confirms deletion warning
	↓
Delete Event record (cascade delete)
	↓
Cascade: All Registrations for this event deleted
	↓
Send cancellation email to all registered attendees
	↓
Event removed from listings ✓
	↓
Cancellation data retained in audit logs
```

**Key Decision Points:**
- Deletion is permanent (no soft delete for events currently)
- All registrations for the event are removed
- Registrants notified of cancellation

### User-Driven (Individual Registration)

1. User clicks the cancellation link from their email.
2. User is routed to a secure, unique URL generated specifically for their registration.
3. System displays:
   - Event details.
   - Registered attendee information.
   - Cancellation confirmation page.
4. User chooses:
   - **Cancel Registration**
   - **Keep Registration**

#### If Cancelled

- Registration status becomes:
  ```json
  {
    "status": "cancelled"
  }
  ```
- QR ticket is invalidated.
- User receives a cancellation confirmation email.
