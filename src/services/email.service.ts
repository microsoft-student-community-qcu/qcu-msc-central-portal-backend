import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);
const from = env.RESEND_FROM_EMAIL;

function logSent(type: string, to: string): void {
  console.log(`[EMAIL] ${type} sent to ${to}`);
}

function logFailed(type: string, to: string, err: unknown): void {
  console.error(`[EMAIL] Failed to send ${type} to ${to}:`, err);
}

function html(text: string): string {
  return `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; padding: 24px;">${text}</body></html>`;
}

export async function sendSetupLinkEmail(to: string, setupToken: string): Promise<void> {
  const link = `${env.FRONTEND_URL}/auth/setup-password?token=${setupToken}`;
  try {
    await resend.emails.send({
      from,
      to,
      subject: "Welcome to QCU MSC — Set Up Your Password",
      html: html(`
        <h2>Welcome to the Microsoft Student Community!</h2>
        <p>Your applicant account has been created. Set your password to get started:</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0078D4;color:#fff;text-decoration:none;border-radius:4px;">Set Up Password</a></p>
        <p style="color:#666;font-size:12px;">This link expires in 24 hours.</p>
      `),
    });
    logSent("Setup link", to);
  } catch (err) {
    logFailed("setup link", to, err);
  }
}

export async function sendRegistrationConfirmedEmail(to: string, eventTitle: string, qrPayload: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: `Registration Confirmed — ${eventTitle}`,
      html: html(`
        <h2>You're registered!</h2>
        <p>Your registration for <strong>${eventTitle}</strong> is confirmed.</p>
        <p>Show this QR code at the event entrance:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#f0f0f0;padding:12px;text-align:center;">${qrPayload}</p>
      `),
    });
    logSent("Registration confirmed", to);
  } catch (err) {
    logFailed("registration confirmed", to, err);
  }
}

export async function sendRegistrationPendingReviewEmail(to: string, eventTitle: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: `Registration Pending Review — ${eventTitle}`,
      html: html(`
        <h2>Registration submitted for review</h2>
        <p>Your registration for <strong>${eventTitle}</strong> has been submitted for manual review.</p>
        <p>You will receive a follow-up email once an Admin approves your registration.</p>
      `),
    });
    logSent("Registration pending review", to);
  } catch (err) {
    logFailed("registration pending review", to, err);
  }
}

export async function sendRegistrationApprovedEmail(to: string, eventTitle: string, qrPayload: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: `Registration Approved — ${eventTitle}`,
      html: html(`
        <h2>Your registration has been approved!</h2>
        <p>Your registration for <strong>${eventTitle}</strong> is now approved.</p>
        <p>Show this QR code at the event entrance:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#f0f0f0;padding:12px;text-align:center;">${qrPayload}</p>
      `),
    });
    logSent("Registration approved", to);
  } catch (err) {
    logFailed("registration approved", to, err);
  }
}

export async function sendRegistrationRejectedEmail(to: string, eventTitle: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: `Registration Rejected — ${eventTitle}`,
      html: html(`
        <h2>Registration rejected</h2>
        <p>Unfortunately, your registration for <strong>${eventTitle}</strong> has been rejected.</p>
        <p>If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>
      `),
    });
    logSent("Registration rejected", to);
  } catch (err) {
    logFailed("registration rejected", to, err);
  }
}

export async function sendManualIdApprovedEmail(to: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: "Student ID Approved — Application In Review",
      html: html(`
        <h2>Your Student ID has been verified</h2>
        <p>Your manually uploaded Student ID has been approved. Your application is now in the review pipeline.</p>
        <p>You will be notified once a decision has been made.</p>
      `),
    });
    logSent("Manual ID approved", to);
  } catch (err) {
    logFailed("manual ID approved", to, err);
  }
}

export async function sendManualIdRejectedEmail(to: string): Promise<void> {
  try {
    await resend.emails.send({
      from,
      to,
      subject: "Student ID Rejected",
      html: html(`
        <h2>Student ID verification failed</h2>
        <p>Your manually uploaded Student ID could not be verified and your application has been rejected.</p>
        <p>If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>
      `),
    });
    logSent("Manual ID rejected", to);
  } catch (err) {
    logFailed("manual ID rejected", to, err);
  }
}
