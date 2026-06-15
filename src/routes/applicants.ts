import { Router } from "express";
import {
  createApplicant,
  getApplicantById,
  listApplicants,
  updateApplicantStatus,
  updateApplicant,
} from "../controllers/applicantController";
import { requireAuth } from "./authMiddleware";

const router = Router();

/**
 * POST /api/applicants
 * Submit new application (public, no auth required)
 */
router.post("/", createApplicant);

/**
 * GET /api/applicants
 * List all applicants (auth required: ADMIN/MEMBER)
 */
router.get("/", requireAuth, listApplicants);

/**
 * GET /api/applicants/:applicantId
 * Get applicant by ID (auth required: ADMIN/MEMBER)
 */
router.get("/:applicantId", requireAuth, getApplicantById);

/**
 * PATCH /api/applicants/:applicantId/status
 * Update applicant status (auth required: ADMIN/MEMBER)
 */
router.patch("/:applicantId/status", requireAuth, updateApplicantStatus);

/**
 * PATCH /api/applicants/:applicantId
 * Update applicant details (auth required: ADMIN/MEMBER)
 */
router.patch("/:applicantId", requireAuth, updateApplicant);

export default router;
