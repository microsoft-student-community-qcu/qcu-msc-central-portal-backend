# Registration Cancellation Flow

1. User clicks the cancellation link from their email.
2. User is routed to a secure, unique URL generated specifically for their registration.
3. System displays:
   - Event details.
   - Registered attendee information.
   - Cancellation confirmation page.
4. User chooses:
   - **Cancel Registration**
   - **Keep Registration**

---

## If Cancelled

- Registration status becomes:
  ```json
  {
    "status": "cancelled"
  }
  ```
- QR ticket is invalidated.
- User receives a cancellation confirmation email.
