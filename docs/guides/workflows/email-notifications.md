# Workflow — Email Notifications

## Triggered Emails

| Event | Recipients | Template |
|-------|-----------|----------|
| User registers | User | Verification email with activation link |
| Applicant submits app | Applicant | Confirmation of application receipt + password setup link |
| Applicant → APPROVED | Applicant | Acceptance notification + MEMBER role activation |
| Applicant → REJECTED | Applicant | Rejection notification |
| Event registration (public) | Attendee | Confirmation + QR code |
| Event cancelled (admin) | All registrants | Cancellation notice |
