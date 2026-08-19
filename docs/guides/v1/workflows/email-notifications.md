# Workflow — Email Notifications

## Shared Template

All emails render through `renderBrandedEmail` in `src/utils/emailTemplate.ts` — a single branded layout (org banner, wrapper, footer) that senders reuse. Senders only pass content options (`headline`, `greeting`, `paragraphs`, `bullets`, `note`, `button`, `qrPayload`, `expiryNote`, `supportLine`); no email duplicates the layout markup.

The layout uses a SaaS-style design: hidden preheader text, full-width org banner (600x150) atop a centered card with a subtle border and shadow, and a footer with the four social links (Facebook, Instagram, LinkedIn, TikTok) rendered as branded monogram chips (solid-color circles — no image files, so they render in clients that block data URIs/SVG), a `mailto:` contact link (`msc-qcu@outlook.com`), and a standard opt-out disclosure. All dynamic values are HTML-escaped via `esc()`/`escapeAttribute()`.

## Provider Architecture

The system supports two email providers, selected via the `EMAIL_PROVIDER` environment variable at startup:

| Provider | Purpose | Transport |
|----------|---------|-----------|
| `RESEND` | Production | Resend SDK (`resend`) |
| `SMTP` | Development | Nodemailer (port 465, TLS) |

Selection happens once at module init in `src/services/email.service.ts`. Both providers implement the same `EmailProvider` interface with a single `sendEmail(to, subject, html)` method. Errors are caught internally inside each send function — email failure never throws or crashes the request.

> **Exception:** `sendDraftResumeLinkEmail` deliberately **propagates errors** to the caller. The resume link is the only way forward for an applicant with an existing draft, so a failed send must surface (the OCR endpoint responds `502` and the cooldown is not recorded, letting the user retry by rescanning).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_PROVIDER` | No | `RESEND` | `RESEND` or `SMTP` |
| `RESEND_API_KEY` | If `EMAIL_PROVIDER=RESEND` | — | Resend API key |
| `RESEND_FROM_EMAIL` | No | `no-reply@msc-qcu.tech` | Verified Resend sender address |
| `SMTP_HOST` | If `EMAIL_PROVIDER=SMTP` | — | SMTP server hostname |
| `SMTP_PORT` | If `EMAIL_PROVIDER=SMTP` | — | SMTP server port (e.g. 465) |
| `SMTP_SECURE` | No | `true` | TLS on connect (always `true` for port 465) |
| `SMTP_USER` | No | — | SMTP authentication username |
| `SMTP_PASS` | No | — | SMTP authentication password / app password |
| `SMTP_FROM_NAME` | No | `Microsoft Student Community` | Display name on sent emails |
| `SMTP_FROM_EMAIL` | No | Falls back to `SMTP_USER` | Sender email address |
| `RESUME_EMAIL_COOLDOWN_MINUTES` | No | `30` | Min minutes between resume-link emails for the same draft (anti-spam) |
| `RESUME_TOKEN_EXPIRY_MINUTES` | No | `30` | Resume-link JWT expiry — the link in the email points to `${FRONTEND_URL}/apply/resume?token=...` |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | No | `30` | Password-reset-link TTL — the link points to `${FRONTEND_URL|ADMIN_FRONTEND_URL}/auth/reset-password?token=...` |

## Triggered Emails

All emails are sent from `src/services/email.service.ts`. Each function is a named export, catches its own errors, and logs success or failure to the console.

| Event | Function | Subject | Recipient |
|-------|----------|---------|-----------|
| Application submitted successfully (under review) | `sendApplicationReceivedEmail` | Application Received — Under Review | Applicant email |
| Applicant account created | `sendSetupLinkEmail` | Welcome to QCU MSC — Set Up Your Password | Applicant email |
| Manual ID approved | `sendManualIdApprovedEmail` | Student ID Approved — Application In Review | Applicant email |
| Manual ID rejected | `sendManualIdRejectedEmail` | Student ID Rejected | Applicant email |
| Applicant status changed (admin) | `sendApplicantStatusEmail` | Status-specific subject (Approved / Under Review / Interview / Rejected / Cancelled / Action Required) | Applicant email |
| Draft resume link (existing in-progress application detected at OCR scan) | `sendDraftResumeLinkEmail` | Resume Your QCU MSC Application | Draft email |
| Forgot-password reset link requested | `sendPasswordResetEmail` | Reset Your QCU MSC Password | Account email |
| Guest event registration (auto-approved) | `sendRegistrationConfirmedEmail` | Registration Confirmed — {event title} | Guest email |
| Guest event registration (manual review) | `sendRegistrationPendingReviewEmail` | Registration Pending Review — {event title} | Guest email |
| Registration approved (by admin) | `sendRegistrationApprovedEmail` | Registration Approved — {event title} | Registrant email |
| Registration rejected (by admin) | `sendRegistrationRejectedEmail` | Registration Rejected — {event title} | Registrant email |

The `sendSetupLinkEmail` function includes a password-setup URL built from `FRONTEND_URL` and a signed JWT token.
All registration-related emails include the event title in the subject line; confirmed/approved emails also embed a QR payload in the email body.

---

## Revision History

| Date | Change |
|------|--------|
| 2026-07-13 | Added dual-provider architecture (Resend + SMTP), environment configuration table, and expanded triggered emails table |
| 2026-08-02 | Added `sendDraftResumeLinkEmail` (resume-link email for existing drafts) with its error-propagation exception; added `RESUME_EMAIL_COOLDOWN_MINUTES` / `RESUME_TOKEN_EXPIRY_MINUTES` env vars |
| 2026-08-03 | Added `sendApplicantStatusEmail` — status-appropriate notification sent to the applicant on every status change (admin PATCH and user-initiated cancel); included admin message / resubmit fields where relevant |
| 2026-08-03 | Added `sendApplicationReceivedEmail` — confirmation sent ahead of the setup-link email on both submission flows (draft submit + legacy single submission); states the application is under review |
| 2026-08-03 | Introduced shared branded layout `renderBrandedEmail` (`src/utils/emailTemplate.ts`) and rewired all senders to use it; added the org banner (600x150) and standard footer to every email |
| 2026-08-03 | Restyled template to a SaaS-like layout: preheader, centered bordered card, and footer with branded monogram chips (solid-color circles, no image files) for FB/IG/LinkedIn/TikTok, `mailto:` contact (`msc-qcu@outlook.com`), and opt-out disclosure |
| 2026-08-07 | Added `sendPasswordResetEmail` (forgot-password reset link, portal-specific target URL) and `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` env var |
