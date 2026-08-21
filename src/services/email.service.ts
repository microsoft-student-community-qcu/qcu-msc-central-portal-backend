import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { renderBrandedEmail, esc, type BrandedEmailOptions } from "../utils/emailTemplate";

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

/**
 * Send the forgot-password reset-link email.
 *
 * The link targets the portal that made the request: the Student Portal for
 * student accounts, the Admin Portal for admin accounts. Swallows errors like
 * most other emails — the forgot-password endpoint must keep returning the
 * generic anti-enumeration message regardless.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  portal: "student" | "admin"
): Promise<void> {
  const baseUrl = portal === "admin" ? env.ADMIN_FRONTEND_URL : env.FRONTEND_URL;
  const link = `${baseUrl}/auth/reset-password?token=${resetToken}`;
  try {
    await provider.sendEmail(
      to,
      "Reset Your QCU MSC Password",
      renderBrandedEmail({
        headline: "Password reset requested",
        paragraphs: [
          "We received a request to reset the password for your QCU MSC account.",
          "If this was you, click the button below to set a new password.",
          "If you did not request this, you can safely ignore this email.",
        ],
        button: { href: link, label: "Reset Password" },
        expiryNote: `This link expires in ${env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes.`,
      }),
    );
    logSent("Password reset link", to);
  } catch (err) {
    logFailed("password reset link", to, err);
  }
}

// ── Merch pre-orders (Module 04 — Finance) ──────────────────────────────────
// Every dynamic value is esc()-wrapped because `paragraphs` render as raw HTML.
// Sends are best-effort: failures are logged, never thrown, so a mail outage
// never blocks an order mutation.

const peso = (amount: number): string => `₱${amount.toFixed(2)}`;

export interface MerchOrderCreatedEmailData {
  studentName: string;
  orderRef: string;
  itemName: string;
  variantLabel: string;
  quantity: number;
  amount: number;
  gcashNumber: string;
  gcashQrImageUrl: string;
  trackingUrl: string;
}

/**
 * Flow 2 — pre-order created; payment QR + instructions.
 * All merch senders return `true` on a successful send and `false` on failure
 * (they still never throw). Callers use this to record notification tracking
 * (Module 04 §7b) so Finance can tell "emailed" from "silently failed".
 */
export async function sendMerchOrderCreatedEmail(to: string, data: MerchOrderCreatedEmailData): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Merch Pre-Order ${data.orderRef} — Complete Your Payment`,
      renderBrandedEmail({
        headline: "Pre-order received — payment needed",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `Your pre-order <strong>${esc(data.orderRef)}</strong> for <strong>${esc(data.itemName)}</strong> (${esc(data.variantLabel)}) ×${data.quantity} has been created.`,
          `Amount due: <strong>${esc(peso(data.amount))}</strong>.`,
          `Scan the GCash QR below with your GCash app and pay the exact amount to <strong>${esc(data.gcashNumber)}</strong>. After paying, return to your order page and submit the 13-digit GCash reference number.`,
        ],
        image: { src: data.gcashQrImageUrl, alt: "GCash payment QR code", caption: `Pay exactly ${peso(data.amount)}` },
        button: { href: data.trackingUrl, label: "Submit Payment Proof" },
        expiryNote: "Your pre-order is not secured until payment is verified by our Finance team.",
      }),
    );
    logSent("Merch order created", to);
    return true;
  } catch (err) {
    logFailed("merch order created", to, err);
    return false;
  }
}

/** Flow 3 — payment proof received; verification in progress. */
export async function sendMerchProofReceivedEmail(
  to: string,
  data: { studentName: string; orderRef: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Payment Proof Received — ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Payment proof received",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `We've received your payment proof for order <strong>${esc(data.orderRef)}</strong>.`,
          "Our Finance team will verify your payment shortly. You'll get another email once it's confirmed.",
        ],
      }),
    );
    logSent("Merch proof received", to);
    return true;
  } catch (err) {
    logFailed("merch proof received", to, err);
    return false;
  }
}

/** Flow 3 — duplicate GCash reference; auto-rejected. */
export async function sendMerchDuplicateReferenceEmail(
  to: string,
  data: { studentName: string; orderRef: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Action Needed — Order ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Duplicate GCash reference number",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `The GCash reference number you submitted for order <strong>${esc(data.orderRef)}</strong> has already been used on another order.`,
          "If this was a typo, you can resubmit your correct 13-digit reference number from your order page. If you believe this is an error, please contact the Finance team directly.",
        ],
        supportLine: true,
      }),
    );
    logSent("Merch duplicate reference", to);
    return true;
  } catch (err) {
    logFailed("merch duplicate reference", to, err);
    return false;
  }
}

/** Flow 4 — payment confirmed; pickup instructions. */
export async function sendMerchOrderConfirmedEmail(
  to: string,
  data: { studentName: string; orderRef: string; itemName: string; variantLabel: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Pre-Order Confirmed — ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Your pre-order is secured!",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `Payment for order <strong>${esc(data.orderRef)}</strong> — <strong>${esc(data.itemName)}</strong> (${esc(data.variantLabel)}) — has been verified.`,
          "We'll announce the pickup schedule soon. Bring your order reference (or student ID) to claim your merch.",
        ],
      }),
    );
    logSent("Merch order confirmed", to);
    return true;
  } catch (err) {
    logFailed("merch order confirmed", to, err);
    return false;
  }
}

/**
 * Flow 4 — payment rejected; reason + resubmit link. Only used for
 * student-fixable rejections (bad reference, amount mismatch, unclear
 * screenshot, other). Out-of-stock uses sendMerchOutOfStockEmail instead —
 * a paid student must never be told to "resubmit" for a sold-out item.
 */
export async function sendMerchOrderRejectedEmail(
  to: string,
  data: { studentName: string; orderRef: string; reasonLabel: string; trackingUrl: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Payment Issue — Order ${data.orderRef}`,
      renderBrandedEmail({
        headline: "We couldn't verify your payment",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `There was an issue verifying the payment for order <strong>${esc(data.orderRef)}</strong>.`,
        ],
        note: data.reasonLabel,
        button: { href: data.trackingUrl, label: "Resubmit Payment Proof" },
      }),
    );
    logSent("Merch order rejected", to);
    return true;
  } catch (err) {
    logFailed("merch order rejected", to, err);
    return false;
  }
}

/**
 * Oversell handling (§7a) — item sold out AFTER the student paid. No resubmit
 * button; reassures the student their money is safe and Finance will arrange a
 * swap or full refund. Sent when a confirm fails the stock decrement.
 */
export async function sendMerchOutOfStockEmail(
  to: string,
  data: { studentName: string; orderRef: string; itemName: string; variantLabel: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Action Needed — Order ${data.orderRef} Sold Out`,
      renderBrandedEmail({
        headline: "Your item sold out — a refund is due",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `We're very sorry — <strong>${esc(data.itemName)}</strong> (${esc(data.variantLabel)}) for order <strong>${esc(data.orderRef)}</strong> sold out before we could confirm your payment.`,
          "<strong>You have not lost your money.</strong> Our Finance team will contact you to arrange either a swap for another available item/size, or a full refund of your payment.",
          "No action is needed from you right now — please do <strong>not</strong> resubmit payment. We'll reach out using this email address.",
        ],
        supportLine: true,
      }),
    );
    logSent("Merch out of stock", to);
    return true;
  } catch (err) {
    logFailed("merch out of stock", to, err);
    return false;
  }
}

/** Refund processed (§7a) — offline refund recorded; transparency receipt. */
export async function sendMerchRefundProcessedEmail(
  to: string,
  data: {
    studentName: string;
    orderRef: string;
    amount: number;
    method: string;
    referenceNumber?: string | null;
    note?: string | null;
  }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Refund Processed — Order ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Your refund has been processed",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `A refund of <strong>${esc(peso(data.amount))}</strong> for order <strong>${esc(data.orderRef)}</strong> has been processed via <strong>${esc(data.method)}</strong>.`,
          data.referenceNumber
            ? `Refund reference: <strong>${esc(data.referenceNumber)}</strong>.`
            : "Please allow some time for the amount to reflect on your account.",
        ],
        note: data.note ?? undefined,
        supportLine: true,
      }),
    );
    logSent("Merch refund processed", to);
    return true;
  } catch (err) {
    logFailed("merch refund processed", to, err);
    return false;
  }
}

/** Flow 5 — order claimed; final receipt. */
export async function sendMerchOrderClaimedEmail(
  to: string,
  data: { studentName: string; orderRef: string; itemName: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Merch Claimed — ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Merch claimed — thank you!",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `This confirms you've collected your order <strong>${esc(data.orderRef)}</strong> — <strong>${esc(data.itemName)}</strong>.`,
          "Thanks for supporting the Microsoft Student Community. See you at the next drop!",
        ],
      }),
    );
    logSent("Merch order claimed", to);
    return true;
  } catch (err) {
    logFailed("merch order claimed", to, err);
    return false;
  }
}

/** Head-cancelled order; cancellation note. */
export async function sendMerchOrderCancelledEmail(
  to: string,
  data: { studentName: string; orderRef: string; note: string }
): Promise<boolean> {
  try {
    await provider.sendEmail(
      to,
      `Order Cancelled — ${data.orderRef}`,
      renderBrandedEmail({
        headline: "Your order has been cancelled",
        greeting: `Hello ${data.studentName},`,
        paragraphs: [
          `Order <strong>${esc(data.orderRef)}</strong> has been cancelled by the Finance team.`,
          "If a payment was already made, any refund will be arranged offline.",
        ],
        note: data.note,
        supportLine: true,
      }),
    );
    logSent("Merch order cancelled", to);
    return true;
  } catch (err) {
    logFailed("merch order cancelled", to, err);
    return false;
  }
}
