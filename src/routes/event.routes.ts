import { Router } from "express";
import { registerForEvent } from "../controllers/eventController";
import { getEvents } from "../controllers/eventsFeedController";
import {
  createEvent,
  getEventRegistrations,
  reviewRegistration,
  checkInByQr,
  manualCheckIn,
} from "../controllers/eventController";
import { requireAdminLogistics } from "../routes/authMiddleware";

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────

// GET /api/v1/events
router.get("/", getEvents);

// POST /api/v1/events/:eventId/register
router.post("/:eventId/register", registerForEvent);

// ── Admin Routes (ADMIN_LOGISTICS only) ──────────────────────────────────

// POST /api/v1/events
router.post("/", requireAdminLogistics, createEvent);

// GET /api/v1/events/:eventId/registrations
router.get("/:eventId/registrations", requireAdminLogistics, getEventRegistrations);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/approve
router.patch(
  "/:eventId/registrations/:registrationId/approve",
  requireAdminLogistics,
  reviewRegistration
);

// PATCH /api/v1/events/:eventId/registrations/checkin (QR scanner)
router.patch("/:eventId/registrations/checkin", requireAdminLogistics, checkInByQr);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/checkin (manual override)
router.patch("/:eventId/registrations/:registrationId/checkin", requireAdminLogistics, manualCheckIn);

export default router;