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
