# Organization Membership Application Flow

## Application

1. User clicks "Apply".
2. User captures an image of their Student ID.
3. System performs Zonal OCR to extract applicant information.
4. **If OCR succeeds:**
   - Application form is automatically pre-filled using extracted data.
   - User reviews and completes remaining fields.
5. **If OCR fails 3 times:**
   - User uploads a Student ID image manually.
   - User manually completes the application form.
   - Application is flagged as:
     ```json
     {
       "manual_application": true
     }
     ```
   - Application requires manual verification by administrators.
6. User submits the application.
7. System sends an email containing:
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
