import { Request, Response } from "express";
import {
  createApplicantSchema,
  updateApplicantSchema,
  updateApplicantStatusSchema,
} from "../schemas/applicant.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import { saveDocument } from "../utils/imageStorage";

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
    const certificateOfRegistrationPath = saveDocument(
      uploadedFiles.certificateOfRegistration[0].buffer,
      `cor_${Date.now()}_${uploadedFiles.certificateOfRegistration[0].originalname}`
    );

    const curriculumVitaePath = saveDocument(
      uploadedFiles.curriculumVitae[0].buffer,
      `cv_${Date.now()}_${uploadedFiles.curriculumVitae[0].originalname}`
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

    // ── 5. Email stub (placeholder — integrate with Better Auth email) ────
    const fullName = [applicant.firstName, applicant.middleInitial, applicant.lastName]
      .filter(Boolean)
      .join(" ");
    console.log(
      `[EMAIL STUB] Applicant created: ${applicant.email}`
    );
    console.log(
      `[EMAIL STUB] Password setup link: http://localhost:5173/auth/setup-password?email=${encodeURIComponent(applicant.email)}&applicantId=${applicant.id}&name=${encodeURIComponent(fullName)}&studentId=${encodeURIComponent(applicant.studentId ?? "")}`
    );

    // ── 6. Return created applicant ───────────────────────────────────────
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

function formatApplicantResponse(applicant: any) {
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

    if (status) where.status = status;
    if (campus) where.campus = campus;
    if (gender) where.gender = gender;
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

    const { status } = parsed.data;

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

    const applicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: { status },
    });

    if (status === "APPROVED" && applicant.userId) {
      await prisma.user.update({
        where: { id: applicant.userId },
        data: { role: "MEMBER" },
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
