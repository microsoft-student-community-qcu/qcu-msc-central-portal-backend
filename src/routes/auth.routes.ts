import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  forgotPassword,
  validateResetToken,
  resetPassword,
  changePassword,
} from "../controllers/passwordReset.controller";
import { requireAuth } from "./authMiddleware";

// ── Public routes ──────────────────────────────────────────────────────────
// Mounted BEFORE authMiddleware in src/app.ts (same as the OCR routes).

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many reset requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many reset attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// Portal-specific forgot-password — each portal's email links to its own
// frontend reset page (mirrors the per-portal sign-in endpoints).
router.post("/student/forgot-password", forgotPasswordLimiter, forgotPassword("student"));
router.post("/admin/forgot-password", forgotPasswordLimiter, forgotPassword("admin"));
router.post("/validate-reset-token", validateResetToken);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

// ── Protected routes ───────────────────────────────────────────────────────
// Mounted AFTER authMiddleware — split export so app.ts can order them around
// the middleware layer.
export const protectedAuthRouter = Router();

protectedAuthRouter.post("/change-password", requireAuth, changePassword);

export default router;