import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { renderBrandedEmail, type BrandedEmailOptions } from "../utils/emailTemplate";

// ── Provider interface ─────────────────────────────────────────────────────

interface EmailProvider {
  sendEmail(to: string, subject: string, html: string): Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function logSent(type: string, to: string): void {
  console.log(`[EMAIL] ${type} sent to ${to}`);
}

function logFailed(type: string, to: string, err: unknown): void {
  console.error(`[EMAIL] Failed to send ${type} to ${to}:`, err);
}

// ── Resend Provider ────────────────────────────────────────────────────────

class ResendProvider implements EmailProvider {
  private client: Resend;
  private from: string;

  constructor() {
    this.client = new Resend(env.RESEND_API_KEY!);
    this.from = env.RESEND_FROM_EMAIL;
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.client.emails.send({ from: this.from, to, subject, html });
  }
}

// ── SMTP Provider ──────────────────────────────────────────────────────────

class SmtpProvider implements EmailProvider {
  private transport: nodemailer.Transporter;
  private fromName: string;
  private fromEmail: string;

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT!,
      secure: env.SMTP_SECURE ?? true,
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASS!,
      },
    });
    this.fromName = env.SMTP_FROM_NAME ?? "Microsoft Student Community";
    this.fromEmail = env.SMTP_FROM_EMAIL ?? env.SMTP_USER!;
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.transport.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
  }
}

// ── Select provider ────────────────────────────────────────────────────────

let provider: EmailProvider;

if (env.EMAIL_PROVIDER === "SMTP") {
  provider = new SmtpProvider();
} else {
  provider = new ResendProvider();
}

// ── Public send functions ──────────────────────────────────────────────────

export async function sendSetupLinkEmail(to: string, setupToken: string): Promise<void> {
  const link = `${env.FRONTEND_URL}/auth/setup-password?token=${setupToken}`;
  try {
    await provider.sendEmail(
      to,
      "Welcome to QCU MSC — Set Up Your Password",
      renderBrandedEmail({
        headline: "Welcome to the Microsoft Student Community!",
        paragraphs: ["Your applicant account has been created. Set your password to get started:"],
        button: { href: link, label: "Set Up Password" },
        expiryNote: "This link expires in 24 hours.",
      }),
    );
    logSent("Setup link", to);
  } catch (err) {
    logFailed("setup link", to, err);
  }
}

export async function sendApplicationReceivedEmail(to: string, applicantName: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      "Application Received — Under Review",
      renderBrandedEmail({
        headline: "Application received",
        greeting: applicantName ? `Hello ${applicantName},` : "Hello,",
        paragraphs: [
          "Your application has been <strong>submitted successfully</strong> and is now under review.",
          "If your application advances to the next stage, you will be notified about the interview.",
          "A follow-up email containing your password setup link is on its way to activate your applicant account.",
        ],
      }),
    );
    logSent("Application received", to);
  } catch (err) {
    logFailed("application received", to, err);
  }
}

export async function sendRegistrationConfirmedEmail(to: string, eventTitle: string, qrPayload: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      `Registration Confirmed — ${eventTitle}`,
      renderBrandedEmail({
        headline: "You're registered!",
        paragraphs: [
          `Your registration for <strong>${eventTitle}</strong> is confirmed.`,
          "Show this QR code at the event entrance:",
        ],
        qrPayload,
      }),
    );
    logSent("Registration confirmed", to);
  } catch (err) {
    logFailed("registration confirmed", to, err);
  }
}

export async function sendRegistrationPendingReviewEmail(to: string, eventTitle: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      `Registration Pending Review — ${eventTitle}`,
      renderBrandedEmail({
        headline: "Registration submitted for review",
        paragraphs: [
          `Your registration for <strong>${eventTitle}</strong> has been submitted for manual review.`,
          "You will receive a follow-up email once an Admin approves your registration.",
        ],
      }),
    );
    logSent("Registration pending review", to);
  } catch (err) {
    logFailed("registration pending review", to, err);
  }
}

export async function sendRegistrationApprovedEmail(to: string, eventTitle: string, qrPayload: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      `Registration Approved — ${eventTitle}`,
      renderBrandedEmail({
        headline: "Your registration has been approved!",
        paragraphs: [
          `Your registration for <strong>${eventTitle}</strong> is now approved.`,
          "Show this QR code at the event entrance:",
        ],
        qrPayload,
      }),
    );
    logSent("Registration approved", to);
  } catch (err) {
    logFailed("registration approved", to, err);
  }
}

export async function sendRegistrationRejectedEmail(to: string, eventTitle: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      `Registration Rejected — ${eventTitle}`,
      renderBrandedEmail({
        headline: "Registration rejected",
        paragraphs: [
          `Unfortunately, your registration for <strong>${eventTitle}</strong> has been rejected.`,
        ],
        supportLine: true,
      }),
    );
    logSent("Registration rejected", to);
  } catch (err) {
    logFailed("registration rejected", to, err);
  }
}

export async function sendManualIdApprovedEmail(to: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      "Student ID Approved — Application In Review",
      renderBrandedEmail({
        headline: "Your Student ID has been verified",
        paragraphs: [
          "Your manually uploaded Student ID has been approved. Your application is now in the review pipeline.",
          "You will be notified once a decision has been made.",
        ],
      }),
    );
    logSent("Manual ID approved", to);
  } catch (err) {
    logFailed("manual ID approved", to, err);
  }
}

export async function sendManualIdRejectedEmail(to: string): Promise<void> {
  try {
    await provider.sendEmail(
      to,
      "Student ID Rejected",
      renderBrandedEmail({
        headline: "Student ID verification failed",
        paragraphs: [
          "Your manually uploaded Student ID could not be verified and your application has been rejected.",
        ],
        supportLine: true,
      }),
    );
    logSent("Manual ID rejected", to);
  } catch (err) {
    logFailed("manual ID rejected", to, err);
  }
}

// ── Applicant status change (admin) ────────────────────────────────────────

const APPLICANT_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING_REVIEW: "In Review",
  FOR_INTERVIEW: "Interview",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  RESUBMIT: "Updates Required",
};

/**
 * Build the subject + content options for an applicant status-change email.
 * Returns null for unknown statuses so the caller can silently skip.
 */
function buildApplicantStatusMail(
  applicantName: string,
  status: string,
  adminMessage?: string | null,
  resubmitFields?: string[] | null
): { subject: string; options: BrandedEmailOptions } | null {
  const greeting = `Dear ${applicantName},`;

  switch (status) {
    case "APPROVED":
      return {
        subject: "Your QCU MSC Application is Approved — Welcome!",
        options: {
          headline: "Congratulations!",
          greeting,
          paragraphs: [
            "Your application has been <strong>approved</strong> and you are now an official member of the Microsoft Student Community at QCU.",
            "Check your member dashboard to unlock member-only events and activities.",
          ],
        },
      };
    case "PENDING_REVIEW":
      return {
        subject: "Your QCU MSC Application is Under Review",
        options: {
          headline: "Application in progress",
          greeting,
          paragraphs: [
            "Your application is now <strong>in review</strong>. Our admin team is going through it and you will hear from us once a decision is made.",
          ],
          note: adminMessage ?? undefined,
        },
      };
    case "FOR_INTERVIEW":
      return {
        subject: "You're Invited for an Interview",
        options: {
          headline: "Interview invitation",
          greeting,
          paragraphs: [
            "Your application has moved to the <strong>interview</strong> stage. Please wait for a separate invitation with the schedule and details.",
          ],
          note: adminMessage ?? undefined,
        },
      };
    case "REJECTED":
      return {
        subject: "Update on Your QCU MSC Application",
        options: {
          headline: "Application status update",
          greeting,
          paragraphs: [
            "Unfortunately, your application has been <strong>rejected</strong>.",
          ],
          note: adminMessage ?? undefined,
          supportLine: true,
        },
      };
    case "CANCELLED":
      return {
        subject: "Your QCU MSC Application Has Been Cancelled",
        options: {
          headline: "Application cancelled",
          greeting,
          paragraphs: [
            "Your application has been <strong>cancelled</strong>. You can submit a new application at any time if you still wish to join.",
          ],
          note: adminMessage ?? undefined,
          supportLine: true,
        },
      };
    case "RESUBMIT":
      return {
        subject: "Action Required — Updates Needed on Your Application",
        options: {
          headline: "Updates needed",
          greeting,
          paragraphs: ["Please log in to the portal to make the changes, then resubmit."],
          bullets:
            resubmitFields && resubmitFields.length > 0
              ? {
                  label: "Please review and update the following section(s):",
                  items: resubmitFields,
                }
              : undefined,
          note: adminMessage ?? undefined,
          supportLine: true,
        },
      };
    default:
      return null;
  }
}

/**
 * Notify an applicant that their status changed.
 *
 * Swallows errors like the other applicant emails — a failed send must never
 * break the admin's PATCH response.
 */
export async function sendApplicantStatusEmail(
  applicant: {
    email: string;
    status: string;
    adminMessage?: string | null;
    resubmitFields?: string[] | null;
  },
  applicantName: string
): Promise<void> {
  const mail = buildApplicantStatusMail(
    applicantName,
    applicant.status,
    applicant.adminMessage,
    applicant.resubmitFields
  );
  if (!mail) return;

  try {
    await provider.sendEmail(applicant.email, mail.subject, renderBrandedEmail(mail.options));
    logSent(`Applicant status (${APPLICANT_STATUS_LABELS[applicant.status] ?? applicant.status})`, applicant.email);
  } catch (err) {
    logFailed(`applicant status (${applicant.status})`, applicant.email, err);
  }
}

/**
 * Send the draft resume-link email.
 *
 * Deliberately does NOT swallow errors (unlike the other email functions):
 * the resume link is the ONLY way forward for an applicant with an existing
 * draft, so a failed send must surface to the caller, which will respond
 * with 502 and keep the cooldown clear so the user can retry by rescanning.
 */
export async function sendDraftResumeLinkEmail(to: string, resumeToken: string): Promise<void> {
  const link = `${env.FRONTEND_URL}/apply/resume?token=${resumeToken}`;
  await provider.sendEmail(
    to,
    "Resume Your QCU MSC Application",
    renderBrandedEmail({
      headline: "Complete your application",
      paragraphs: [
        "We found an application in progress for your Student ID.",
        "Resume where you left off:",
      ],
      button: { href: link, label: "Resume Application" },
      expiryNote: `This link expires in ${env.RESUME_TOKEN_EXPIRY_MINUTES} minutes.`,
    }),
  );
  logSent("Draft resume link", to);
}
