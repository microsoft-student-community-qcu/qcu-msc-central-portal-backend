import { Request, Response } from "express";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "../config/database";
import { auth } from "../config/auth";
import { env } from "../config/env";
import {
  forgotPasswordSchema,
  validateResetTokenSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../schemas/passwordReset.schema";
import {
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "../utils/token";
import { sendPasswordResetEmail } from "../services/email.service";

// ── Shared helpers ─────────────────────────────────────────────────────────

// Identifier used to record one active reset token per user in the
// Verification table (Better Auth ships this model for one-time tokens).
const RESET_IDENTIFIER_PREFIX = "password-reset:";

function resetIdentifier(userId: string): string {
  return `${RESET_IDENTIFIER_PREFIX}${userId}`;
}

/**
 * Hash the reset JWT before storing it in the database so a leaked row (or a
 * dump) can never be replayed as a valid reset link.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Role boundary per portal — mirrors the per-portal sign-in endpoints. */
function roleAllowedForPortal(portal: "student" | "admin", role: string): boolean {
  return portal === "admin"
    ? role === "ADMIN_HR" || role === "ADMIN_LOGISTICS"
    : role === "APPLICANT" || role === "MEMBER";
}

/** Look up the credential (email/password) Account row for a user. */
function findCredentialAccount(userId: string) {
  return prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
}

const GENERIC_LINK_ERROR = "Invalid or expired reset link. Please request a new one.";
const SAME_PASSWORD_ERROR = "New password cannot be the same as your current password.";

// ── Forgot password ────────────────────────────────────────────────────────
// Always answers with the same generic message so a caller cannot tell whether
// an email address is registered (anti-enumeration).
export function forgotPassword(portal: "student" | "admin") {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const genericMessage = "If an account exists, a password reset link has been sent.";

    try {
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true, email: true, role: true },
      });

      // Unknown email or role mismatch for the portal → still reply generically.
      if (!user || !roleAllowedForPortal(portal, user.role as string)) {
        res.status(200).json({ success: true, message: genericMessage });
        return;
      }

      const token = await signPasswordResetToken(user.id, user.email);
      const expiresAt = new Date(
        Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60_000
      );
      const identifier = resetIdentifier(user.id);

      // Only one active reset link per user — replace any older one.
      await prisma.verification.deleteMany({ where: { identifier } });
      await prisma.verification.create({
        data: { identifier, value: hashToken(token), expiresAt },
      });

      await sendPasswordResetEmail(user.email, token, portal);

      res.status(200).json({ success: true, message: genericMessage });
    } catch (error) {
      console.error("Failed to process forgot-password request:", error);
      res.status(200).json({ success: true, message: genericMessage });
    }
  };
}

// ── Validate reset token ───────────────────────────────────────────────────
// Lets the frontend confirm the emailed link is still valid before rendering
// the reset form, and reveals the account email so the user can verify it.
export async function validateResetToken(req: Request, res: Response): Promise<void> {
  const parsed = validateResetTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const payload = await verifyPasswordResetToken(parsed.data.token);
    const record = await prisma.verification.findFirst({
      where: { identifier: resetIdentifier(payload.userId) },
    });

    // Enforce single-use (record must exist) and DB-level expiry as a backstop
    // beyond the JWT's own expiration.
    if (!record || record.value !== hashToken(parsed.data.token) || record.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: GENERIC_LINK_ERROR });
      return;
    }

    res.status(200).json({
      success: true,
      data: { email: payload.email },
    });
  } catch {
    res.status(400).json({ success: false, message: GENERIC_LINK_ERROR });
  }
}

// ── Reset password ─────────────────────────────────────────────────────────
// Consumes the reset token, updates the credential password, and forces a
// re-login by deleting every session for the account.
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const payload = await verifyPasswordResetToken(parsed.data.token);
    const record = await prisma.verification.findFirst({
      where: { identifier: resetIdentifier(payload.userId) },
    });

    if (!record || record.value !== hashToken(parsed.data.token) || record.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: GENERIC_LINK_ERROR });
      return;
    }

    const account = await findCredentialAccount(payload.userId);
    if (!account) {
      res.status(400).json({
        success: false,
        message: "No password is set for this account. Sign in with Google or GitHub instead.",
      });
      return;
    }

    // Reject a reset that would leave the password unchanged. Only enforced
    // when a credential password already exists — OAuth-only accounts may
    // still set a first password through the reset link.
    if (account.password) {
      const sameAsCurrent = await verifyPassword({
        hash: account.password,
        password: parsed.data.newPassword,
      });
      if (sameAsCurrent) {
        res.status(400).json({ success: false, message: SAME_PASSWORD_ERROR });
        return;
      }
    }

    // Hash with Better Auth's own scrypt so sign-in verification keeps working.
    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.account.update({
      where: { id: account.id },
      data: { password: newHash },
    });

    // Consume the token (single-use) and invalidate all sessions.
    await prisma.verification.deleteMany({
      where: { identifier: resetIdentifier(payload.userId) },
    });
    await prisma.session.deleteMany({ where: { userId: payload.userId } });

    res.status(200).json({
      success: true,
      message: "Password has been reset. Please sign in with your new password.",
    });
  } catch {
    res.status(400).json({ success: false, message: GENERIC_LINK_ERROR });
  }
}

// ── Change password (authenticated) ────────────────────────────────────────
// Requires the current password; keeps the current session but kills all
// others so a leaked token cannot keep signing in after the change.
export async function changePassword(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const account = await findCredentialAccount(userId);
    if (!account?.password) {
      res.status(400).json({
        success: false,
        message: "No password is set for this account. Sign in with Google or GitHub instead.",
      });
      return;
    }

    const currentValid = await verifyPassword({
      hash: account.password,
      password: parsed.data.currentPassword,
    });

    if (!currentValid) {
      res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
      return;
    }

    // Both fields come from the same request, so a plain equality check is
    // enough — the stored hash was already verified against currentPassword.
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      res.status(400).json({ success: false, message: SAME_PASSWORD_ERROR });
      return;
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.account.update({
      where: { id: account.id },
      data: { password: newHash },
    });

    // Keep the current session, invalidate every other one.
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.session?.id) {
      await prisma.session.deleteMany({
        where: { userId, NOT: { id: session.session.id } },
      });
    }

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Failed to change password:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}