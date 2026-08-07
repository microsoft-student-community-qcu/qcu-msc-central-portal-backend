import { z } from "zod";

// ── Forgot password ────────────────────────────────────────────────────────
// Public POST body — only the email address is needed to request a reset link.
export const forgotPasswordSchema = z.object({
  email: z
    .string({ message: "Email is required" })
    .email({ message: "Invalid email format" }),
});

// ── Validate reset token ───────────────────────────────────────────────────
// Public POST body — checks the emailed link still holds before showing the form.
export const validateResetTokenSchema = z.object({
  token: z
    .string({ message: "Token is required" })
    .min(1, { message: "Token is required" }),
});

// ── Reset password ─────────────────────────────────────────────────────────
// Public POST body — consumes the reset token and sets the new password.
// Password policy matches the sign-up schema (minimum 8 characters).
export const resetPasswordSchema = z.object({
  token: z
    .string({ message: "Token is required" })
    .min(1, { message: "Token is required" }),
  newPassword: z
    .string({ message: "New password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
});

// ── Change password (authenticated) ────────────────────────────────────────
// Logged-in users verify their current password before setting a new one.
export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ message: "Current password is required" })
    .min(1, { message: "Current password is required" }),
  newPassword: z
    .string({ message: "New password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
});

export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ValidateResetTokenSchema = z.infer<typeof validateResetTokenSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;