import { Request, Response } from "express";
import { createApplicantSchema } from "../schemas/applicant.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";

/**
 * POST /api/v1/applicants
 *
 * Creates a new applicant record. Supports two paths:
 *
 * 1. OCR path (recommended):
 *    Caller first calls POST /api/v1/ocr/verify, then forwards the
 *    ocrSessionId here. The backend looks up the OCR session to determine
 *    manual_application and retrieve the extracted studentId + image path.
 *
 * 2. Direct path:
 *    Caller submits studentId manually (no OCR). manual_application defaults
 *    to false. Used when the applicant bypasses OCR (e.g., admin submits on
 *    behalf of the applicant).
 *
 * Security note: manual_application is NEVER client-settable. It is derived
 * exclusively from the OCR session's manualRequired flag. If the session
 * says manualRequired: true, the backend sets manual_application: true
 * regardless of what the body contains.
 */
export async function createApplicant(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // ── 1. Validate request body ──────────────────────────────────────────
    const parsed = createApplicantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { name, email, departmentChoice, resumeLink, githubLink } =
      parsed.data;
    let { studentId, ocrSessionId } = parsed.data;

    // ── 2. Resolve OCR session (if provided) ──────────────────────────────
    let manualApplication = false;
    let idImagePath: string | null = null;

    if (ocrSessionId) {
      const session = ocrStore.getSession(ocrSessionId);

      if (!session) {
        res.status(400).json({
          success: false,
          message:
            "OCR session expired or invalid. Please re-verify your Student ID via POST /api/v1/ocr/verify.",
        });
        return;
      }

      // The OCR session is the single source of truth for manual_application.
      // Even if the body says manual_application: true, we ignore it.
      manualApplication = session.manualRequired;

      // Use the studentId extracted by the OCR service (if available).
      // Falls back to the body's studentId if the session has none
      // (e.g., manual entry case where the user typed it in).
      if (session.studentId) {
        studentId = session.studentId;
      }
      idImagePath = session.imagePath;
    }

    // studentId is required at this point — either from OCR or from body.
    if (!studentId) {
      res.status(400).json({
        success: false,
        message:
          "Student ID is required. Either forward an ocrSessionId or provide studentId directly.",
      });
      return;
    }

    // ── 3. Create applicant record ────────────────────────────────────────
    const applicant = await prisma.applicant.create({
      data: {
        name,
        email,
        departmentChoice,
        resumeLink,
        githubLink,
        studentId,
        idImagePath,
        manual_application: manualApplication,
      },
    });

    // ── 4. Email stub (placeholder for Week 4.1) ──────────────────────────
    // TODO: Replace with actual email engine.
    // The email should contain a password setup link that also serves as
    // email verification. This link will route the user to account creation.
    console.log(
      `[EMAIL STUB] Applicant created: ${applicant.email}`
    );
    console.log(
      `[EMAIL STUB] Password setup link: http://localhost:${process.env.PORT ?? 5000}/api/v1/auth/setup?email=${encodeURIComponent(applicant.email)}&applicantId=${applicant.id}`
    );

    // ── 5. Return created applicant ───────────────────────────────────────
    res.status(201).json({
      success: true,
      data: {
        id: applicant.id,
        name: applicant.name,
        email: applicant.email,
        departmentChoice: applicant.departmentChoice,
        resumeLink: applicant.resumeLink,
        githubLink: applicant.githubLink,
        studentId: applicant.studentId,
        status: applicant.status,
        manual_application: applicant.manual_application,
        createdAt: applicant.createdAt,
      },
      message: "Application submitted successfully",
    });
  } catch (error) {
    // Handle unique email constraint violation
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message:
          "An application with this email already exists. Please use a different email or contact support.",
      });
      return;
    }

    console.error("Failed to create applicant:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
