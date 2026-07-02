import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import rateLimit from "express-rate-limit";
import { requireAdminHR } from "./authMiddleware";
import {
  createApplicant,
  getApplicant,
  listApplicants,
  updateApplicantStatus,
  updateApplicant,
} from "../controllers/applicant.controller";

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
});

const applicantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        message: "Each file must not exceed 10MB",
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: "File upload error",
    });
    return;
  }
  next(err);
}

const router = Router();

// ── Public Routes ───────────────────────────────────────────────────────

/**
 * POST /api/v1/applicants
 *
 * Public endpoint — no authentication required.
 * Accepts multipart/form-data with text fields and two file uploads:
 *   - certificateOfRegistration (file, required)
 *   - curriculumVitae (file, required)
 *
 * Must be preceded by a call to POST /api/v1/ocr/verify.
 *
 * @see docs/api/v1/applicants.md
 */
router.post(
  "/",
  applicantLimiter,
  upload.fields([
    { name: "certificateOfRegistration", maxCount: 1 },
    { name: "curriculumVitae", maxCount: 1 },
  ]),
  handleMulterError,
  createApplicant
);

// ── Admin Routes (ADMIN_HR only) ─────────────────────────────────────────

/**
 * GET /api/v1/applicants
 *
 * Lists all applicants with optional filtering. ADMIN_HR only.
 */
router.get("/", requireAdminHR, listApplicants);

/**
 * GET /api/v1/applicants/:applicantId
 *
 * Retrieves a specific applicant by ID. ADMIN_HR only.
 */
router.get("/:applicantId", requireAdminHR, getApplicant);

/**
 * PATCH /api/v1/applicants/:applicantId/status
 *
 * Updates an applicant's pipeline status. ADMIN_HR only.
 */
router.patch("/:applicantId/status", requireAdminHR, updateApplicantStatus);

/**
 * PATCH /api/v1/applicants/:applicantId
 *
 * Updates an applicant's profile details. ADMIN_HR only.
 */
router.patch("/:applicantId", requireAdminHR, updateApplicant);

export default router;
