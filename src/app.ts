import express from "express";
import cors from "cors";
import path from "node:path";
import * as Sentry from "@sentry/node";

import { env } from "./config/env";
import { prisma } from "./config/database";
import { initSentry, captureDatabaseError } from "./config/sentry";
import { corsOptions } from "./config/cors";
import {
  signUpLimiter,
  signInLimiter,
  resendSetupLinkLimiter,
} from "./config/rateLimit";
import { betterAuthHandler } from "./controllers/auth.controller";
import { resendSetupLink } from "./controllers/applicant.controller";
import { authMiddleware } from "./routes/authMiddleware";
import ocrRoutes from "./routes/ocr.routes";
import applicantRoutes from "./routes/applicant.routes";
import applicationDraftRoutes from "./routes/application-draft.routes";
import eventRoutes from "./routes/event.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import authRoutes, { protectedAuthRouter } from "./routes/auth.routes";

initSentry();

const app = express();

// Serve local uploaded files when the Azure Blob Storage fallback is used.
// DEVELOPMENT ONLY — the fallback itself is disabled outside development
// (see src/utils/imageStorage.ts), so this route would only ever expose a
// stale/empty directory in a deployed environment. Do not remove the guard.
if (env.NODE_ENV === "development") {
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
}

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting for Better Auth public POST endpoints
app.use("/api/auth/sign-up/email", signUpLimiter);
app.use("/api/auth/sign-in/email", signInLimiter);

// Better Auth handler — manages sign-up, sign-in, OAuth, sessions.
// Handles the Express ↔ Web API translation internally
// (see src/controllers/auth.controller.ts + src/utils/betterAuthProxy.ts).
app.use("/api/auth", betterAuthHandler);

// ── Public routes (no auth required) ──────────────────────────────────────
app.use("/api/v1/ocr", ocrRoutes);
app.post("/api/v1/applicants/resend-setup-link", resendSetupLinkLimiter, resendSetupLink);

// Password reset + portal-specific sign-in (public, rate-limited).
// Registered before authMiddleware like the OCR routes.
app.use("/api/v1/auth", authRoutes);

// ── Authentication middleware ─────────────────────────────────────────────
// Validates the session via Better Auth. Sets req.userId / req.userRole to
// null for unauthenticated requests. Routes registered after this point can
// be either public or protected.
app.use(authMiddleware);

// Protected auth routes — change-password for logged-in users.
app.use("/api/v1/auth", protectedAuthRouter);

// User routes
app.use("/api/v1/users", userRoutes);

// V2 admin routes (Module 01 — Super Admin Settings Hub). SUPERADMIN-only.
app.use("/api/v2/admin", adminRoutes);

// Applicant routes
app.use("/api/v1/applicants", applicantRoutes);
app.use("/api/v1/applicants", applicationDraftRoutes);
app.use("/api/v1/events", eventRoutes);

// ── Base & health routes ──────────────────────────────────────────────────

/**
 * Base route — API summary for discoverability.
 */
app.get("/api", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running.",
    version: "1.2.0",
    endpoints: {
      "auth:sign-in:student": "POST /api/v1/auth/student/sign-in",
      "auth:sign-in:admin": "POST /api/v1/auth/admin/sign-in",
      "auth:forgot-password:student": "POST /api/v1/auth/student/forgot-password",
      "auth:forgot-password:admin": "POST /api/v1/auth/admin/forgot-password",
      "auth:validate-reset-token": "POST /api/v1/auth/validate-reset-token",
      "auth:reset-password": "POST /api/v1/auth/reset-password",
      "auth:change-password": "POST /api/v1/auth/change-password",
      users: "GET /api/v1/users/me",
      ocr: "POST /api/v1/ocr/verify",
      applicants: "POST /api/v1/applicants (multipart/form-data)",
      "resend-setup-link": "POST /api/v1/applicants/resend-setup-link",
    },
    docs: "/docs/api/",
  });
});

/**
 * Health check — verifies the database connection.
 */
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    captureDatabaseError(error, { endpoint: "/health", action: "SELECT 1" });
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: error.message });
  }
});

// ── Error handling ─────────────────────────────────────────────────────────

/**
 * Sentry error handler — captures unhandled errors and sends reports.
 */
Sentry.setupExpressErrorHandler(app);

/**
 * 404 handler for undefined routes.
 */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

export default app;