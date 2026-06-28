import { Router } from "express";
import { createApplicant } from "../controllers/applicant.controller";

const router = Router();

/**
 * POST /api/v1/applicants
 *
 * Public endpoint — no authentication required.
 * Creates a new applicant record after Zonal OCR verification.
 *
 * Request body is validated against createApplicantSchema.
 * If an ocrSessionId is provided, the backend resolves manual_application
 * from the OCR session rather than trusting the client.
 *
 * @see docs/api/v1/applicants.md
 */
router.post("/", createApplicant);

export default router;
