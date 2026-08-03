import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env";

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

function htmlBody(content: string): string {
  return `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; padding: 24px;">${content}</body></html>`;
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
      htmlBody(`
        <h2>Welcome to the Microsoft Student Community!</h2>
        <p>Your applicant account has been created. Set your password to get started:</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0078D4;color:#fff;text-decoration:none;border-radius:4px;">Set Up Password</a></p>
        <p style="color:#666;font-size:12px;">This link expires in 24 hours.</p>
      `),
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
      htmlBody(`
        <h2>Application received</h2>
        ${applicantName ? `<p>Hello ${applicantName},</p>` : "<p>Hello,</p>"}
        <p>Your application has been <strong>submitted successfully</strong> and is now under review.</p>
        <p>If your application advances to the next stage, you will be notified about the interview.</p>
        <p>A follow-up email containing your password setup link is on its way to activate your applicant account.</p>
      `),
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
      htmlBody(`
        <h2>You're registered!</h2>
        <p>Your registration for <strong>${eventTitle}</strong> is confirmed.</p>
        <p>Show this QR code at the event entrance:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#f0f0f0;padding:12px;text-align:center;">${qrPayload}</p>
      `),
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
      htmlBody(`
        <h2>Registration submitted for review</h2>
        <p>Your registration for <strong>${eventTitle}</strong> has been submitted for manual review.</p>
        <p>You will receive a follow-up email once an Admin approves your registration.</p>
      `),
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
      htmlBody(`
        <h2>Your registration has been approved!</h2>
        <p>Your registration for <strong>${eventTitle}</strong> is now approved.</p>
        <p>Show this QR code at the event entrance:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#f0f0f0;padding:12px;text-align:center;">${qrPayload}</p>
      `),
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
      htmlBody(`
        <h2>Registration rejected</h2>
        <p>Unfortunately, your registration for <strong>${eventTitle}</strong> has been rejected.</p>
        <p>If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>
      `),
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
      htmlBody(`
        <h2>Your Student ID has been verified</h2>
        <p>Your manually uploaded Student ID has been approved. Your application is now in the review pipeline.</p>
        <p>You will be notified once a decision has been made.</p>
      `),
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
      htmlBody(`
        <h2>Student ID verification failed</h2>
        <p>Your manually uploaded Student ID could not be verified and your application has been rejected.</p>
        <p>If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>
      `),
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
 * Build the subject + body for an applicant status-change email. Returns null
 * for unknown statuses so the caller can silently skip.
 */
function buildApplicantStatusMail(
  applicantName: string,
  status: string,
  adminMessage?: string | null,
  resubmitFields?: string[] | null
): { subject: string; html: string } | null {
  const heading = `Dear ${applicantName},`;
  const reasonBlock = adminMessage
    ? `<p style="background:#f0f0f0;padding:12px;border-left:4px solid #0078D4;"><strong>Note from the admin:</strong> ${adminMessage}</p>`
    : "";
  const supportLine = `<p style="color:#666;font-size:12px;">If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>`;

  switch (status) {
    case "APPROVED":
      return {
        subject: "Your QCU MSC Application is Approved — Welcome!",
        html: `
          <h2>Congratulations!</h2>
          ${heading}
          <p>Your application has been <strong>approved</strong> and you are now an official member of the Microsoft Student Community at QCU.</p>
          <p>Check your member dashboard to unlock member-only events and activities.</p>
        `,
      };
    case "PENDING_REVIEW":
      return {
        subject: "Your QCU MSC Application is Under Review",
        html: `
          <h2>Application in progress</h2>
          ${heading}
          <p>Your application is now <strong>in review</strong>. Our admin team is going through it and you will hear from us once a decision is made.</p>
          ${reasonBlock}
        `,
      };
    case "FOR_INTERVIEW":
      return {
        subject: "You're Invited for an Interview",
        html: `
          <h2>Interview invitation</h2>
          ${heading}
          <p>Your application has moved to the <strong>interview</strong> stage. Please wait for a separate invitation with the schedule and details.</p>
          ${reasonBlock}
        `,
      };
    case "REJECTED":
      return {
        subject: "Update on Your QCU MSC Application",
        html: `
          <h2>Application status update</h2>
          ${heading}
          <p>Unfortunately, your application has been <strong>rejected</strong>.</p>
          ${reasonBlock}
          ${supportLine}
        `,
      };
    case "CANCELLED":
      return {
        subject: "Your QCU MSC Application Has Been Cancelled",
        html: `
          <h2>Application cancelled</h2>
          ${heading}
          <p>Your application has been <strong>cancelled</strong>. You can submit a new application at any time if you still wish to join.</p>
          ${reasonBlock}
          ${supportLine}
        `,
      };
    case "RESUBMIT": {
      const fieldsBlock =
        resubmitFields && resubmitFields.length > 0
          ? `<p>Please review and update the following section(s):</p><ul>${resubmitFields
              .map((field) => `<li>${field}</li>`)
              .join("")}</ul>`
          : "";
      return {
        subject: "Action Required — Updates Needed on Your Application",
        html: `
          <h2>Updates needed</h2>
          ${heading}
          ${reasonBlock}
          ${fieldsBlock}
          <p style="color:#666;font-size:12px;">Please log in to the portal to make the changes, then resubmit.</p>
        `,
      };
    }
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
    await provider.sendEmail(applicant.email, mail.subject, htmlBody(mail.html));
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
    htmlBody(`
      <h2>Complete your application</h2>
      <p>We found an application in progress for your Student ID.</p>
      <p>Resume where you left off:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0078D4;color:#fff;text-decoration:none;border-radius:4px;">Resume Application</a></p>
      <p style="color:#666;font-size:12px;">This link expires in ${env.RESUME_TOKEN_EXPIRY_MINUTES} minutes.</p>
    `),
  );
  logSent("Draft resume link", to);
}
