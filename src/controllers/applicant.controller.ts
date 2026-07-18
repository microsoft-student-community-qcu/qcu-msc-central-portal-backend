import { Request, Response } from "express";
import { z } from "zod";
import {
  applicantStatusEnum,
  genderEnum,
  campusEnum,
  createApplicantSchema,
  updateApplicantSchema,
  updateApplicantStatusSchema,
  approveManualIdSchema,
} from "../schemas/applicant.schema";
import { prisma } from "../config/database";
import type { Applicant } from "@prisma/client";
import { ocrStore } from "../config/ocrStore";
import { saveDocument, getDocumentStream, getImageStream } from "../utils/imageStorage";
import { signSetupToken } from "../utils/token";
import {
  sendSetupLinkEmail,
  sendManualIdApprovedEmail,
  sendManualIdRejectedEmail,
} from "../services/email.service";

/**
 * POST /api/v1/applicants
 *
 * Creates a new applicant record. Every submission must be preceded by a
 * call to POST /api/v1/ocr/verify. The backend resolves manual_application
 * exclusively from the OCR session's manualRequired flag.
 *
 * Accepts multipart/form-data with:
 *   - All text fields in the body
 *   - certificateOfRegistration (file) — required
 *   - curriculumVitae (file) — required
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
    // ── 1. Inject file presence flags for Zod validation ─────────────────
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    req.body._certificateOfRegistration =
      files?.certificateOfRegistration?.length ? "true" : undefined;
    req.body._curriculumVitae =
      files?.curriculumVitae?.length ? "true" : undefined;

    // ── 2. Validate request body ──────────────────────────────────────────
    const parsed = createApplicantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      lastName,
      firstName,
      middleInitial,
      email,
      college,
      program,
      section,
      campus,
      dateOfBirth,
      placeOfBirth,
      gender,
      membershipRole,
      houseAddress,
      cellphoneNumber,
      qcuMscEmail,
      facebookLink,
      interestsSkillsHobbies,
      organizationHistory,
      portfolio,
      githubOrProjectLinks,
      previousWorksAchievements,
    } = parsed.data;
    let { studentId, ocrSessionId } = parsed.data;

    // ── 3. Handle file uploads ────────────────────────────────────────────
    const uploadedFiles = files as NonNullable<typeof files>;
    const certificateOfRegistrationPath = await saveDocument(
      uploadedFiles.certificateOfRegistration[0].buffer,
      `cor_${Date.now()}_${uploadedFiles.certificateOfRegistration[0].originalname}`,
      uploadedFiles.certificateOfRegistration[0].mimetype
    );

    const curriculumVitaePath = await saveDocument(
      uploadedFiles.curriculumVitae[0].buffer,
      `cv_${Date.now()}_${uploadedFiles.curriculumVitae[0].originalname}`,
      uploadedFiles.curriculumVitae[0].mimetype
    );

    // ── 3. Resolve OCR session ────────────────────────────────────────────
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

    const manualApplication = session.manualRequired;

    if (session.studentId) {
      studentId = session.studentId;
    }
    idImagePath = session.imagePath;

    if (!studentId) {
      res.status(400).json({
        success: false,
        message:
          "Student ID is required. If OCR could not extract it, provide studentId in the request body.",
      });
      return;
    }

    // ── 4. Create applicant record ────────────────────────────────────────
    const applicant = await prisma.applicant.create({
      data: {
        lastName,
        firstName,
        middleInitial,
        email,
        college,
        program,
        section,
        campus,
        studentId,
        dateOfBirth: new Date(dateOfBirth),
        placeOfBirth,
        gender,
        membershipRole,
        certificateOfRegistration: certificateOfRegistrationPath,
        curriculumVitae: curriculumVitaePath,
        houseAddress,
        cellphoneNumber,
        qcuMscEmail,
        facebookLink,
        interestsSkillsHobbies,
        organizationHistory,
        portfolio: portfolio ?? null,
        githubOrProjectLinks: githubOrProjectLinks ?? null,
        previousWorksAchievements: previousWorksAchievements ?? null,
        idImagePath,
        manual_application: manualApplication,
      },
    });

    // ── 5. Clean up OCR session ───────────────────────────────────────────
    ocrStore.deleteSession(ocrSessionId);

    // ── 6. Send setup link email ──────────────────────────────────────────
    const setupToken = await signSetupToken(applicant.id, applicant.email);
    await sendSetupLinkEmail(applicant.email, setupToken);

    // ── 7. Return created applicant ───────────────────────────────────────
    res.status(201).json({
      success: true,
      data: {
        id: applicant.id,
        lastName: applicant.lastName,
        firstName: applicant.firstName,
        middleInitial: applicant.middleInitial,
        email: applicant.email,
        college: applicant.college,
        program: applicant.program,
        section: applicant.section,
        campus: applicant.campus,
        studentId: applicant.studentId,
        dateOfBirth: applicant.dateOfBirth,
        placeOfBirth: applicant.placeOfBirth,
        gender: applicant.gender,
        membershipRole: applicant.membershipRole,
        houseAddress: applicant.houseAddress,
        cellphoneNumber: applicant.cellphoneNumber,
        qcuMscEmail: applicant.qcuMscEmail,
        facebookLink: applicant.facebookLink,
        interestsSkillsHobbies: applicant.interestsSkillsHobbies,
        organizationHistory: applicant.organizationHistory,
        portfolio: applicant.portfolio,
        githubOrProjectLinks: applicant.githubOrProjectLinks,
        previousWorksAchievements: applicant.previousWorksAchievements,
        status: applicant.status,
        manual_application: applicant.manual_application,
        idImagePath: applicant.idImagePath,
        certificateOfRegistration: applicant.certificateOfRegistration,
        curriculumVitae: applicant.curriculumVitae,
        createdAt: applicant.createdAt,
        updatedAt: applicant.updatedAt,
      },
      message: "Application submitted successfully",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2002"
    ) {
      const target = (error as any).meta?.target as string[] | undefined;
      if (target?.includes("qcuMscEmail")) {
        res.status(409).json({
          success: false,
          message:
            "An application with this QCU MSC email already exists. Please use a different email or contact support.",
        });
        return;
      }
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

// ── Helpers ──────────────────────────────────────────────────────────────

function formatApplicantResponse(applicant: Applicant) {
  return {
    id: applicant.id,
    lastName: applicant.lastName,
    firstName: applicant.firstName,
    middleInitial: applicant.middleInitial,
    email: applicant.email,
    college: applicant.college,
    program: applicant.program,
    section: applicant.section,
    campus: applicant.campus,
    studentId: applicant.studentId,
    dateOfBirth: applicant.dateOfBirth,
    placeOfBirth: applicant.placeOfBirth,
    gender: applicant.gender,
    membershipRole: applicant.membershipRole,
    houseAddress: applicant.houseAddress,
    cellphoneNumber: applicant.cellphoneNumber,
    qcuMscEmail: applicant.qcuMscEmail,
    facebookLink: applicant.facebookLink,
    interestsSkillsHobbies: applicant.interestsSkillsHobbies,
    organizationHistory: applicant.organizationHistory,
    portfolio: applicant.portfolio,
    githubOrProjectLinks: applicant.githubOrProjectLinks,
    previousWorksAchievements: applicant.previousWorksAchievements,
    status: applicant.status,
    manual_application: applicant.manual_application,
    adminMessage: applicant.adminMessage,
    resubmitFields: applicant.resubmitFields ? applicant.resubmitFields.split(",") : [],
    idImagePath: applicant.idImagePath,
    certificateOfRegistration: applicant.certificateOfRegistration,
    curriculumVitae: applicant.curriculumVitae,
    createdAt: applicant.createdAt,
    updatedAt: applicant.updatedAt,
  };
}

// ── Admin: Get Applicant by ID ────────────────────────────────────────────

/**
 * GET /api/v1/applicants/:applicantId
 *
 * Retrieves a single applicant by ID. ADMIN_HR only.
 */
export async function getApplicant(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(applicant),
      message: "Applicant retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to retrieve applicant:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: List Applicants ───────────────────────────────────────────────

/**
 * GET /api/v1/applicants
 *
 * Lists applicants with optional filtering and pagination. ADMIN_HR only.
 *
 * Query params:
 *   - status (optional): APPLIED | INTERVIEWING | ACCEPTED | REJECTED
 *   - campus (optional): SAN_BARTOLOME_MAIN | SAN_FRANCISCO | BATASAN
 *   - gender (optional): MALE | FEMALE | LGBTQIA | PREFER_NOT_TO_SAY
 *   - manual_application (optional): true | false
 *   - limit (optional, default 50)
 *   - offset (optional, default 0)
 */
export async function listApplicants(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      status,
      campus,
      gender,
      manual_application,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const where: any = {};

    if (status) {
      const parsed = applicantStatusEnum.safeParse(status);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: `Invalid status filter: "${status}"` });
        return;
      }
      where.status = parsed.data;
    }
    if (campus) {
      const parsed = campusEnum.safeParse(campus);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: `Invalid campus filter: "${campus}"` });
        return;
      }
      where.campus = parsed.data;
    }
    if (gender) {
      const parsed = genderEnum.safeParse(gender);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: `Invalid gender filter: "${gender}"` });
        return;
      }
      where.gender = parsed.data;
    }
    if (manual_application !== undefined) {
      where.manual_application = manual_application === "true";
    }

    const [total, applicants] = await Promise.all([
      prisma.applicant.count({ where }),
      prisma.applicant.findMany({
        where,
        skip: parseInt(offset, 10),
        take: parseInt(limit, 10),
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        applicants: applicants.map(formatApplicantResponse),
      },
      message: "Applicants retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to list applicants:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Update Applicant Status ───────────────────────────────────────

/**
 * PATCH /api/v1/applicants/:applicantId/status
 *
 * Updates an applicant's pipeline status. ADMIN_HR only.
 */
export async function updateApplicantStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;
    const parsed = updateApplicantStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { status, message, resubmitFields } = parsed.data;

    const existing = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    const updateData: any = { status };
    if (message) {
      updateData.adminMessage = message;
    } else if (status !== "RESUBMIT") {
      updateData.adminMessage = null;
    }

    if (status === "RESUBMIT" && resubmitFields) {
      updateData.resubmitFields = resubmitFields.join(",");
    } else if (status !== "RESUBMIT") {
      updateData.resubmitFields = null;
    }

    const applicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: updateData,
    });

    if (applicant.userId) {
      const newUserRole = status === "APPROVED" ? "MEMBER" : "APPLICANT";
      await prisma.user.update({
        where: { id: applicant.userId },
        data: { role: newUserRole },
      });
    }

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(applicant),
      message: "Applicant status updated successfully",
    });
  } catch (error) {
    console.error("Failed to update applicant status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Update Applicant Details ──────────────────────────────────────

/**
 * PATCH /api/v1/applicants/:applicantId
 *
 * Updates an applicant's profile details. ADMIN_HR only.
 * Accepts partial updates — only provided fields are changed.
 */
export async function updateApplicant(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;
    const parsed = updateApplicantSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    const updateData: any = { ...parsed.data };
    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    const applicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(applicant),
      message: "Applicant updated successfully",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message:
          "An applicant with that email or QCU MSC email already exists.",
      });
      return;
    }

    console.error("Failed to update applicant:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Manual ID Override ─────────────────────────────────────────────

/**
 * PATCH /api/v1/applicants/:applicantId/approve-id
 *
 * Allows ADMIN_HR to review and approve or reject a quarantined applicant
 * (manual_application: true) after manually verifying their uploaded ID
 * image against their typed student number.
 *
 * On approval:
 *   - Sets manual_application to false (clears quarantine)
 *   - Sets studentId from the request body (since OCR could not extract it)
 *   - Sets status to PENDING_REVIEW (enters the normal pipeline)
 *
 * On rejection:
 *   - Sets status to REJECTED
 *   - Leaves manual_application: true for audit trail
 */
export async function approveManualId(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;

    const parsed = approveManualIdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { action, studentId } = parsed.data;

    const existing = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    if (!existing.manual_application) {
      res.status(400).json({
        success: false,
        message:
          "This applicant is not in the manual ID verification queue. Only applicants with manual_application: true can be processed here.",
      });
      return;
    }

    let updateData: any;

    if (action === "approve") {
      updateData = {
        manual_application: false,
        studentId: studentId ?? existing.studentId,
        status: "PENDING_REVIEW",
      };
    } else {
      updateData = {
        status: "REJECTED",
      };
    }

    const applicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: updateData,
    });

    if (action === "approve") {
      await sendManualIdApprovedEmail(applicant.email);
    } else {
      await sendManualIdRejectedEmail(applicant.email);
    }

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(applicant),
      message:
        action === "approve"
          ? "Applicant ID approved. Application moved to review pipeline."
          : "Applicant ID rejected. Application has been rejected.",
    });
  } catch (error) {
    console.error("Failed to process manual ID override:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

const resendSetupLinkSchema = z.object({
  email: z
    .string({ message: "Email is required" })
    .email({ message: "Invalid email format" }),
});

export async function resendSetupLink(req: Request, res: Response): Promise<void> {
  try {
    const parsed = resendSetupLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email } = parsed.data;

    const applicant = await prisma.applicant.findFirst({
      where: { email, userId: null },
      select: { id: true, email: true },
    });

    if (applicant) {
      const setupToken = await signSetupToken(applicant.id, applicant.email);
      await sendSetupLinkEmail(applicant.email, setupToken);
    }

    res.status(200).json({
      success: true,
      message: "If an account exists, a new setup link has been sent.",
    });
  } catch (error) {
    console.error("Failed to resend setup link:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Applicant: Cancel Application ──────────────────────────────────────────

/**
 * POST /api/v1/applicants/:applicantId/cancel
 *
 * Allows an authenticated applicant to cancel their own application.
 * Requires a linked User account (userId must match the authenticated user).
 */
export async function cancelApplication(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;
    const userId = (req as any).userId;

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    if (!applicant.userId || applicant.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "You can only cancel your own application",
      });
      return;
    }

    if (applicant.status === "APPROVED") {
      res.status(400).json({
        success: false,
        message: "Cannot cancel an already approved application",
      });
      return;
    }

    const updated = await prisma.applicant.update({
      where: { id: applicantId },
      data: { status: "CANCELLED" },
    });

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(updated),
      message: "Application cancelled successfully",
    });
  } catch (error) {
    console.error("Failed to cancel application:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Applicant: Resubmit Application ────────────────────────────────────────

/**
 * POST /api/v1/applicants/:applicantId/resubmit
 *
 * Allows an applicant to resubmit their application after being asked to
 * RESUBMIT by an admin. Accepts optional multipart file uploads and fields.
 * Sets status back to PENDING_REVIEW and clears the adminMessage.
 */
export async function resubmitApplication(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { applicantId } = req.params;
    const userId = (req as any).userId;

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    if (!applicant.userId || applicant.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "You can only resubmit your own application",
      });
      return;
    }

    if (applicant.status !== "RESUBMIT") {
      res.status(400).json({
        success: false,
        message: "Only applications with RESUBMIT status can be resubmitted",
      });
      return;
    }

    const unlocked = applicant.resubmitFields ? applicant.resubmitFields.split(",") : [];
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const body = req.body;

    // Check if files are uploaded but locked
    if (files?.certificateOfRegistration?.length && !unlocked.includes("certificateOfRegistration")) {
      res.status(400).json({
        success: false,
        message: "Certificate of Registration is locked for resubmission",
      });
      return;
    }

    if (files?.curriculumVitae?.length && !unlocked.includes("curriculumVitae")) {
      res.status(400).json({
        success: false,
        message: "Curriculum Vitae is locked for resubmission",
      });
      return;
    }

    // Check if text fields are updated but personalInfo is locked
    const hasTextUpdates = Object.keys(body).some(key => key !== "_certificateOfRegistration" && key !== "_curriculumVitae" && key !== "ocrSessionId");
    if (hasTextUpdates && !unlocked.includes("personalInfo")) {
      res.status(400).json({
        success: false,
        message: "Personal information is locked for resubmission",
      });
      return;
    }

    const updateData: any = {
      status: "PENDING_REVIEW",
      adminMessage: null,
      resubmitFields: null,
    };

    if (unlocked.includes("personalInfo") && hasTextUpdates) {
      const parsedBody = updateApplicantSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          success: false,
          message: "Validation error",
          errors: parsedBody.error.flatten().fieldErrors,
        });
        return;
      }
      const bodyData = { ...parsedBody.data };
      if (bodyData.dateOfBirth) {
        bodyData.dateOfBirth = new Date(bodyData.dateOfBirth) as any;
      }
      Object.assign(updateData, bodyData);
    }

    if (files?.certificateOfRegistration?.length && unlocked.includes("certificateOfRegistration")) {
      const path = await saveDocument(
        files.certificateOfRegistration[0].buffer,
        `cor_${Date.now()}_${files.certificateOfRegistration[0].originalname}`,
        files.certificateOfRegistration[0].mimetype
      );
      updateData.certificateOfRegistration = path;
    }

    if (files?.curriculumVitae?.length && unlocked.includes("curriculumVitae")) {
      const path = await saveDocument(
        files.curriculumVitae[0].buffer,
        `cv_${Date.now()}_${files.curriculumVitae[0].originalname}`,
        files.curriculumVitae[0].mimetype
      );
      updateData.curriculumVitae = path;
    }

    const updated = await prisma.applicant.update({
      where: { id: applicantId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(updated),
      message: "Application resubmitted successfully",
    });
  } catch (error) {
    console.error("Failed to resubmit application:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Applicant: Get Own Applicant Record ─────────────────────────────────────
export async function getApplicantMe(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = (req as any).userId;

    const applicant = await prisma.applicant.findUnique({
      where: { userId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        message: "No applicant record found linked to your account",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatApplicantResponse(applicant),
    });
  } catch (error) {
    console.error("Failed to get own applicant record:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

function getContentTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default: return "application/octet-stream";
  }
}

// ── Applicant: Serve Protected Document ─────────────────────────────────────
export async function serveDocument(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { stream, contentType, contentLength } = await getDocumentStream(filename);
    if (!stream) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }
    
    let finalContentType = contentType || "application/octet-stream";
    if (finalContentType === "application/octet-stream") {
      finalContentType = getContentTypeFromFilename(filename);
    }
    
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    
    stream.pipe(res);
  } catch (error: any) {
    console.error("Failed to serve document:", error);
    res.status(404).json({ success: false, message: "Document not found or inaccessible" });
  }
}

// ── Applicant: Serve Protected Image ────────────────────────────────────────
export async function serveImage(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { stream, contentType, contentLength } = await getImageStream(filename);
    if (!stream) {
      res.status(404).json({ success: false, message: "Image not found" });
      return;
    }
    
    let finalContentType = contentType || "application/octet-stream";
    if (finalContentType === "application/octet-stream") {
      finalContentType = getContentTypeFromFilename(filename);
    }
    
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    
    stream.pipe(res);
  } catch (error: any) {
    console.error("Failed to serve image:", error);
    res.status(404).json({ success: false, message: "Image not found or inaccessible" });
  }
}

