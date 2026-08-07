import { Request, Response } from "express";
import { z } from "zod";
import {
  applicantStatusEnum,
  genderEnum,
  campusEnum,
  officeEnum,
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
  sendApplicantStatusEmail,
  sendApplicationReceivedEmail,
} from "../services/email.service";
import { validateFileMimeType } from "../utils/fileValidation";

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
      office,
      houseAddress,
      cellphoneNumber,
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

    // Validate magic bytes — prevents disguised HTML/script uploads (VUL-010)
    const corValidation = await validateFileMimeType(
      uploadedFiles.certificateOfRegistration[0].buffer,
      "Certificate of Registration"
    );
    if (!corValidation.valid) {
      res.status(400).json({ success: false, message: corValidation.message });
      return;
    }

    const cvValidation = await validateFileMimeType(
      uploadedFiles.curriculumVitae[0].buffer,
      "Curriculum Vitae"
    );
    if (!cvValidation.valid) {
      res.status(400).json({ success: false, message: cvValidation.message });
      return;
    }

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
        office,
        certificateOfRegistration: certificateOfRegistrationPath,
        curriculumVitae: curriculumVitaePath,
        houseAddress,
        cellphoneNumber,
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

    // ── 6. Send emails ─────────────────────────────────────────────────────
    // First the application-received notice (submitted + under review), then
    // the password setup link. Both swallow send failures internally.
    await sendApplicationReceivedEmail(
      applicant.email,
      `${applicant.firstName} ${applicant.lastName}`.trim()
    );

    const setupToken = await signSetupToken(applicant.id, applicant.email);
    await sendSetupLinkEmail(applicant.email, setupToken);

    // ── 7. Return created applicant ───────────────────────────────────────
    res.status(201).json({
      success: true,
      data: {
        id: applicant.id,
        setupToken,
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
        office: applicant.office,
        houseAddress: applicant.houseAddress,
        cellphoneNumber: applicant.cellphoneNumber,
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
    office: applicant.office,
    houseAddress: applicant.houseAddress,
    cellphoneNumber: applicant.cellphoneNumber,
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
 * Parses a comma-separated enum filter value (e.g. "A" or "A,B"), trims each
 * entry, and validates every entry against the provided Zod schema.
 * Returns the validated values, or null when no usable values are present
 * (empty input or any entry failing validation).
 */
function parseEnumListFilter(raw: string, schema: z.ZodTypeAny): string[] | null {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) return null;
  const parsed = values.map((v) => schema.safeParse(v));
  if (parsed.some((r) => !r.success)) return null;
  return parsed.map((r) => (r as { success: true; data: string }).data);
}

/**
 * Parses a comma-separated free-text filter value (e.g. "A" or "A,B"),
 * trimming each entry. Returns the values, or null when no usable values are
 * present or any entry exceeds the model's 200-character field limit.
 */
function parseTextListFilter(raw: string): string[] | null {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) return null;
  if (values.some((v) => v.length > 200)) return null;
  return values;
}

/**
 * GET /api/v1/applicants
 *
 * Lists applicants with optional filtering and pagination. ADMIN_HR only.
 *
 * Query params:
 *   - status (optional): APPLIED | INTERVIEWING | ACCEPTED | REJECTED
 *   - campus (optional): single campus or comma-separated list of campuses
 *   - gender (optional): MALE | FEMALE | LGBTQIA | PREFER_NOT_TO_SAY
 *   - office (optional): single office or comma-separated list of offices
 *   - college (optional): single college name or comma-separated list (partial LIKE match)
 *   - program (optional): single program name or comma-separated list (partial LIKE match)
 *   - manual_application (optional): true | false
 *   - search (optional): LIKE match against firstName, lastName, email,
 *     studentId, campus, college, program
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
      office,
      college,
      program,
      manual_application,
      search,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const where: any = {};

    // Exact-match filters are nested under AND so they can combine safely
    // with the OR search clause below (Prisma disallows mixing top-level
    // scalar filters with a top-level OR).
    const andFilters: any[] = [];

    if (status) {
      const parsed = applicantStatusEnum.safeParse(status);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: `Invalid status filter: "${status}"` });
        return;
      }
      andFilters.push({ status: parsed.data });
    }
    if (campus) {
      // Support a single campus or a comma-separated list of campuses.
      const campusValues = parseEnumListFilter(campus, campusEnum);
      if (!campusValues) {
        res.status(400).json({ success: false, message: `Invalid campus filter: "${campus}"` });
        return;
      }
      andFilters.push({ campus: { in: campusValues } });
    }
    if (gender) {
      const parsed = genderEnum.safeParse(gender);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: `Invalid gender filter: "${gender}"` });
        return;
      }
      andFilters.push({ gender: parsed.data });
    }
    if (office) {
      // Support a single office or a comma-separated list of offices
      // (e.g. "LOGISTICS_OFFICE" or "SECRETARIAT_OFFICE,RELATIONS_OFFICE").
      const officeValues = parseEnumListFilter(office, officeEnum);
      if (!officeValues) {
        res.status(400).json({ success: false, message: `Invalid office filter: "${office}"` });
        return;
      }
      andFilters.push({ office: { in: officeValues } });
    }
    if (college) {
      // Partial LIKE match against any of the listed college names
      // (e.g. "Computer" or "Computer,Business").
      const collegeValues = parseTextListFilter(college);
      if (!collegeValues) {
        res.status(400).json({ success: false, message: `Invalid college filter: "${college}"` });
        return;
      }
      andFilters.push({ OR: collegeValues.map((c) => ({ college: { contains: c } })) });
    }
    if (program) {
      // Partial LIKE match against any of the listed program names.
      const programValues = parseTextListFilter(program);
      if (!programValues) {
        res.status(400).json({ success: false, message: `Invalid program filter: "${program}"` });
        return;
      }
      andFilters.push({ OR: programValues.map((p) => ({ program: { contains: p } })) });
    }
    if (manual_application !== undefined) {
      andFilters.push({ manual_application: manual_application === "true" });
    }

    // Search matches any of the free-text fields via LIKE (case-insensitive
    // by MySQL's default collation, so no mode: "insensitive" is needed).
    const searchTerm = search?.trim();
    if (searchTerm) {
      // Campus is a MySQL ENUM column, which Prisma can only match via
      // equality/in — so the term is mapped to the enum values it contains
      // (e.g. "bartolome" matches SAN_BARTOLOME_MAIN). No campus filter is
      // added when the term matches none of the enum values.
      const campusMatches = campusEnum.options.filter((c) =>
        c.toLowerCase().includes(searchTerm.toLowerCase())
      );
      where.OR = [
        { firstName: { contains: searchTerm } },
        { lastName: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { studentId: { contains: searchTerm } },
        ...(campusMatches.length > 0 ? [{ campus: { in: campusMatches } }] : []),
        { college: { contains: searchTerm } },
        { program: { contains: searchTerm } },
      ];
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
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

// ── Admin: Dashboard Aggregations ────────────────────────────────────────

/**
 * GET /api/v1/applicants/counts
 *
 * Retrieves applicant pipeline counts aggregated by status. ADMIN_HR only.
 *
 * Uses a single groupBy query instead of 7 parallel list queries (the old
 * frontend behavior), so the dashboard loads counts with one DB call.
 */
export async function getApplicantCounts(_req: Request, res: Response): Promise<void> {
  try {
    const statusGroups = await prisma.applicant.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    // Zero-initialize every pipeline status so the response always exposes
    // all keys, even when a status has no applicants yet.
    const counts: Record<string, number> = {
      ALL: 0,
      APPROVED: 0,
      PENDING_REVIEW: 0,
      FOR_INTERVIEW: 0,
      REJECTED: 0,
      CANCELLED: 0,
      RESUBMIT: 0,
    };

    for (const group of statusGroups) {
      if (group.status in counts) {
        counts[group.status] = group._count._all;
        counts.ALL += group._count._all;
      }
    }

    res.status(200).json({
      success: true,
      data: counts,
      message: "Applicant counts retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to retrieve applicant counts:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /api/v1/applicants/dashboard-stats
 *
 * Retrieves pre-aggregated metrics for the admin dashboard charts. ADMIN_HR only.
 *
 * Aggregation happens on the backend (single request) instead of the frontend
 * fetching the full applicant list and computing client-side:
 *   - applicationGrowth:           applicant counts per month for the last 6
 *                                  months (zero-filled, oldest first)
 *   - departmentDistribution:      APPROVED applicants grouped by office
 *   - campusDistribution:          APPROVED applicants grouped by campus
 *   - verificationMethodDistribution: automated OCR vs manual upload split
 */
export async function getApplicantDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    // Start of the month 5 months back — an inclusive 6-month window that
    // includes the current month. Bucketing uses UTC to match how createdAt
    // is stored/read.
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - 5);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const [createdAtRows, departmentStats, campusStats, verificationStats] = await Promise.all([
      // Only the creation dates are needed for the growth chart — no personal
      // details are transferred over the wire.
      prisma.applicant.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      prisma.applicant.groupBy({
        by: ["office"],
        where: { status: "APPROVED" },
        _count: { _all: true },
      }),
      prisma.applicant.groupBy({
        by: ["campus"],
        where: { status: "APPROVED" },
        _count: { _all: true },
      }),
      prisma.applicant.groupBy({
        by: ["manual_application"],
        _count: { _all: true },
      }),
    ]);

    // Build a zero-filled bucket per month (oldest first), then count rows.
    const monthBuckets: { month: string; count: number }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 6; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      monthBuckets.push({ month: key, count: 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const monthIndex = new Map(monthBuckets.map((bucket, i) => [bucket.month, i]));
    for (const row of createdAtRows) {
      const key = `${row.createdAt.getUTCFullYear()}-${String(row.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const index = monthIndex.get(key);
      if (index !== undefined) {
        monthBuckets[index].count += 1;
      }
    }

    // Sort distributions alphabetically for stable output across requests.
    const departmentDistribution = departmentStats
      .map((stat) => ({ department: stat.office, count: stat._count._all }))
      .sort((a, b) => a.department.localeCompare(b.department));

    const campusDistribution = campusStats
      .map((stat) => ({ campus: stat.campus, count: stat._count._all }))
      .sort((a, b) => a.campus.localeCompare(b.campus));

    const verificationMethodDistribution = {
      automatedOcr: 0,
      manualUpload: 0,
    };
    for (const stat of verificationStats) {
      if (stat.manual_application) {
        verificationMethodDistribution.manualUpload = stat._count._all;
      } else {
        verificationMethodDistribution.automatedOcr = stat._count._all;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        applicationGrowth: monthBuckets,
        departmentDistribution,
        campusDistribution,
        verificationMethodDistribution,
      },
      message: "Dashboard stats retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to retrieve dashboard stats:", error);
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

    // Notify the applicant of the status change. Fire-and-forget: the email
    // service swallows send failures so this never breaks the PATCH response.
    // Only email when the status actually changed (no spam on no-op re-saves).
    if (existing.status !== status) {
      await sendApplicantStatusEmail(
        {
          email: applicant.email,
          status: applicant.status,
          adminMessage: applicant.adminMessage,
          resubmitFields: applicant.resubmitFields
            ? applicant.resubmitFields.split(",")
            : [],
        },
        `${applicant.firstName} ${applicant.lastName}`.trim()
      );
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

    // Notify the applicant their application was cancelled. Fire-and-forget:
    // the email service swallows send failures so this never breaks the response.
    await sendApplicantStatusEmail(
      {
        email: updated.email,
        status: updated.status,
        adminMessage: updated.adminMessage,
        resubmitFields: null,
      },
      `${updated.firstName} ${updated.lastName}`.trim()
    );

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
      // Validate magic bytes (VUL-010)
      const corValidation = await validateFileMimeType(
        files.certificateOfRegistration[0].buffer,
        "Certificate of Registration"
      );
      if (!corValidation.valid) {
        res.status(400).json({ success: false, message: corValidation.message });
        return;
      }

      const path = await saveDocument(
        files.certificateOfRegistration[0].buffer,
        `cor_${Date.now()}_${files.certificateOfRegistration[0].originalname}`,
        files.certificateOfRegistration[0].mimetype
      );
      updateData.certificateOfRegistration = path;
    }

    if (files?.curriculumVitae?.length && unlocked.includes("curriculumVitae")) {
      // Validate magic bytes (VUL-010)
      const cvValidation = await validateFileMimeType(
        files.curriculumVitae[0].buffer,
        "Curriculum Vitae"
      );
      if (!cvValidation.valid) {
        res.status(400).json({ success: false, message: cvValidation.message });
        return;
      }

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

