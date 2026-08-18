import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/auth";
import { prisma } from "../config/database";
import { signInSchema, signUpSchema } from "../schemas/auth.schema";
import { verifySetupToken } from "../utils/token";
import {
  forwardBetterAuthResponse,
  toBetterAuthWebRequest,
} from "../utils/betterAuthProxy";

/**
 * Universal Better Auth handler — mounted at /api/auth.
 *
 * Better Auth routes requests by URL path (e.g. /api/auth/sign-up/email →
 * account creation, /api/auth/sign-in/email → sign in,
 * /api/auth/get-session → session lookup). We pre-validate sign-up/sign-in
 * bodies with Zod and reject a direct generic sign-in so each portal must use
 * its dedicated endpoint.
 */
export async function betterAuthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Block direct sign-in — each portal must use its dedicated endpoint
    if (req.method === "POST" && req.path === "/sign-in/email") {
      res.status(400).json({
        success: false,
        message: "Direct sign-in is not available. Use /api/v1/auth/student/sign-in or /api/v1/auth/admin/sign-in instead.",
      });
      return;
    }

    if (req.method === "POST") {
      // Pre-validate sign-up body — collect ALL errors at once
      if (req.path === "/sign-up/email") {
        const result = signUpSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            message: "Validation error",
            errors: result.error.flatten().fieldErrors,
          });
          return;
        }

        // Check studentId uniqueness
        const existing = await prisma.user.findUnique({
          where: { studentId: result.data.studentId },
          select: { id: true },
        });
        if (existing) {
          res.status(400).json({
            success: false,
            message: "Student ID already taken",
          });
          return;
        }

        // Validate setup token — prevents account pre-hijacking (see VUL-004).
        // Every account creation must be authorized by a valid one-time
        // setup token obtained through the approved applicant flow.
        const tokenPayload = await verifySetupToken(result.data.setupToken);
        if (!tokenPayload) {
          res.status(400).json({
            success: false,
            message: "Invalid or expired setup link. Please request a new one.",
          });
          return;
        }

        if (tokenPayload.email !== result.data.email) {
          res.status(400).json({
            success: false,
            message: "Email does not match the setup link.",
          });
          return;
        }

        const applicant = await prisma.applicant.findUnique({
          where: { id: tokenPayload.applicantId },
          select: { userId: true, email: true },
        });

        if (!applicant) {
          res.status(400).json({
            success: false,
            message: "Setup link is invalid. Please contact support.",
          });
          return;
        }

        if (applicant.userId !== null) {
          res.status(400).json({
            success: false,
            message: "This setup link has already been used.",
          });
          return;
        }

        if (applicant.email !== result.data.email) {
          res.status(400).json({
            success: false,
            message: "Email does not match the applicant record.",
          });
          return;
        }

        // Reconstruct clean request body with only safe fields.
        // Never forward raw req.body — it may contain injected fields
        // like `role` that bypass Zod validation (see VUL-016).
        req.body = {
          email: result.data.email,
          password: result.data.password,
          name: `${result.data.firstName} ${result.data.lastName}`.trim(),
          studentId: result.data.studentId,
          middleInitial: result.data.middleInitial,
        };
      }

      // Pre-validate sign-in body
      if (req.path === "/sign-in/email") {
        const result = signInSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            message: "Validation error",
            errors: result.error.flatten().fieldErrors,
          });
          return;
        }
      }
    }

    const webRequest = toBetterAuthWebRequest(req, req.originalUrl);
    const webResponse = await auth.handler(webRequest);
    await forwardBetterAuthResponse(webResponse, res);
  } catch (error) {
    next(error);
  }
}

type Portal = "student" | "admin";

/** Better Auth path both portal endpoints forward to. */
const PORTAL_SIGN_IN_PATH = "/api/auth/sign-in/email";

/**
 * Portal-specific sign-in endpoint factory — enforces role boundaries:
 *   Student Portal → APPLICANT / MEMBER only
 *   Admin Portal   → ADMIN_HR / ADMIN_LOGISTICS only
 *
 * The generic /api/auth/sign-in/email is disabled to prevent ambiguous access.
 */
export function portalSignIn(portal: Portal) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = signInSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          success: false,
          message: "Validation error",
          errors: result.error.flatten().fieldErrors,
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email: result.data.email },
        select: { role: true },
      });

      if (portal === "student") {
        if (user && (user.role === "ADMIN_HR" || user.role === "ADMIN_LOGISTICS")) {
          res.status(403).json({
            success: false,
            message: "Admin accounts cannot sign in through the Student Portal. Please use the Admin Portal.",
          });
          return;
        }
      } else if (!user || (user.role !== "ADMIN_HR" && user.role !== "ADMIN_LOGISTICS")) {
        res.status(403).json({
          success: false,
          message: "Access denied. Only admin accounts can sign in through the Admin Portal.",
        });
        return;
      }

      const webRequest = toBetterAuthWebRequest(req, PORTAL_SIGN_IN_PATH);
      const webResponse = await auth.handler(webRequest);
      const bodyText = await forwardBetterAuthResponse(webResponse, res);

      // Auto-link applicant to user on successful sign-in.
      // If link-applicant was never called after sign-up (network timeout,
      // page refresh, frontend bug), this reconnects the accounts automatically
      // — the user just needs to log in. Idempotent: `userId: null` only matches
      // unlinked applicants, and `email` is unique on Applicant (one match max).
      if (webResponse.status === 200 && bodyText) {
        try {
          const body = JSON.parse(bodyText);
          const email = body?.user?.email;
          const userId = body?.user?.id;
          if (email && userId) {
            await prisma.applicant.updateMany({
              where: { email, userId: null },
              data: { userId },
            });
          }
        } catch {
          // Log but never break sign-in
          console.error("Auto-link on sign-in: failed to parse response body");
        }
      }
    } catch (error) {
      next(error);
    }
  };
}