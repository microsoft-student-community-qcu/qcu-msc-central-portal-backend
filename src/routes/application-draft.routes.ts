import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import rateLimit from "express-rate-limit";
import {
  createDraft,
  resumeDraft,
  updateDraftBatch1,
  updateDraftBatch2,
  submitDraft,
} from "../controllers/application-draft.controller";

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
});

const draftLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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

/**
 * POST /api/v1/applicants/draft
 *
 * Batch 0 — Public. Creates an application draft after OCR verification.
 * Accepts JSON body with lastName, firstName, middleInitial (optional), email, ocrSessionId.
 */
router.post(
  "/draft",
  draftLimiter,
  createDraft
);

/**
 * POST /api/v1/applicants/draft/resume
 *
 * Public. Resumes an in-progress application from the emailed resume link.
 * Accepts JSON body with a signed resume token; returns the full draft
 * so the frontend can rehydrate the form.
 */
router.post(
  "/draft/resume",
  draftLimiter,
  resumeDraft
);

/**
 * PATCH /api/v1/applicants/draft/:draftId/batch-1
 *
 * Batch 1 — Public. Saves personal information.
 * Accepts JSON body.
 */
router.patch(
  "/draft/:draftId/batch-1",
  draftLimiter,
  updateDraftBatch1
);

/**
 * PATCH /api/v1/applicants/draft/:draftId/batch-2
 *
 * Batch 2 — Public. Saves academic information + file uploads.
 * Accepts multipart/form-data with text fields and two file uploads:
 *   - certificateOfRegistration (file, required)
 *   - curriculumVitae (file, required)
 */
router.patch(
  "/draft/:draftId/batch-2",
  draftLimiter,
  upload.fields([
    { name: "certificateOfRegistration", maxCount: 1 },
    { name: "curriculumVitae", maxCount: 1 },
  ]),
  handleMulterError,
  updateDraftBatch2
);

/**
 * POST /api/v1/applicants/draft/:draftId/submit
 *
 * Batch 3 (final) — Public. Submits additional information, creates the
 * Applicant record, and sends the setup link email.
 * Accepts JSON body.
 */
router.post(
  "/draft/:draftId/submit",
  draftLimiter,
  submitDraft
);

export default router;
