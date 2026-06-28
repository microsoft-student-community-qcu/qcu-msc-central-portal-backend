import { Request, Response } from "express";
import { createApplicantSchema } from "../schemas/applicant.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";

/**
 * POST /api/v1/applicants
 *
 * Creates a new applicant record. Every submission must be preceded by a
 * call to POST /api/v1/ocr/verify. The backend resolves manual_application
 * exclusively from the OCR session's manualRequired flag.
 *
 * Two paths within the OCR flow:
 *
 * 1. OCR success path:
 *    The OCR session has studentId and manualRequired: false.
 *    The backend uses the session's extracted studentId.
 *
 * 2. Manual entry path (OCR failed after max attempts):
 *    The OCR session has studentId: null and manualRequired: true.
 *    The backend falls back to the body's studentId for manual entry.
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

    const { lastName, firstName, middleInitial, email, departmentChoice, resumeLink, githubLink } =
      parsed.data;
    let { studentId, ocrSessionId } = parsed.data;

    // ── 2. Resolve OCR session ────────────────────────────────────────────
    let idImagePath: string | null = null;
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
    const manualApplication = session.manualRequired;

    // If OCR successfully extracted a studentId, prefer it over the body.
    // Otherwise fall back to the body's studentId (manual entry case).
    if (session.studentId) {
      studentId = session.studentId;
    }
    idImagePath = session.imagePath;

    // studentId must be resolved from either the OCR session or the body.
    if (!studentId) {
      res.status(400).json({
        success: false,
        message:
          "Student ID is required. If OCR could not extract it, provide studentId in the request body.",
      });
      return;
    }

    // ── 3. Create applicant record ────────────────────────────────────────
    const applicant = await prisma.applicant.create({
      data: {
        lastName,
        firstName,
        middleInitial,
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
        lastName: applicant.lastName,
        firstName: applicant.firstName,
        middleInitial: applicant.middleInitial,
        email: applicant.email,
        departmentChoice: applicant.departmentChoice,
        resumeLink: applicant.resumeLink,
        githubLink: applicant.githubLink,
        studentId: applicant.studentId,
        status: applicant.status,
        manual_application: applicant.manual_application,
        createdAt: applicant.createdAt,
        updatedAt: applicant.updatedAt,
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
