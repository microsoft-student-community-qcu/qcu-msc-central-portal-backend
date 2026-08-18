import { Router } from "express";
import { registerForEvent } from "../controllers/eventController";
import { getEvents, getEventById } from "../controllers/eventsFeedController";
import {
  createEvent,
  getEventRegistrations,
  reviewRegistration,
  checkInByQr,
  manualCheckIn,
} from "../controllers/eventController";
import { cancelEvent } from "../controllers/eventCancellationController";
import { resendRegistrationTicket } from "../controllers/eventTicketController";
import { requireAdminLogistics } from "../routes/authMiddleware";

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────

// GET /api/v1/events
router.get("/", getEvents);

// GET /api/v1/events/:eventId
router.get("/:eventId", getEventById);

// POST /api/v1/events/:eventId/register
router.post("/:eventId/register", registerForEvent);

// ── Admin Routes (ADMIN_LOGISTICS only) ──────────────────────────────────

// POST /api/v1/events
router.post("/", requireAdminLogistics, createEvent);

// PATCH /api/v1/events/:eventId/cancel — soft delete (V2 Flow 8)
//
// TODO(auth): V2 Flow 8 restricts event cancellation to ADMIN_LOGISTICS_HEAD /
// SUPERADMIN. Neither role exists in the UserRole enum yet and authMiddleware
// has no matching guard (auth/RBAC is another module's scope, filed separately).
// Shipped behind requireAdminLogistics — tighten once those roles land.
router.patch("/:eventId/cancel", requireAdminLogistics, cancelEvent);

// GET /api/v1/events/:eventId/registrations
router.get("/:eventId/registrations", requireAdminLogistics, getEventRegistrations);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/approve
router.patch(
  "/:eventId/registrations/:registrationId/approve",
  requireAdminLogistics,
  reviewRegistration
);

// POST /api/v1/events/:eventId/registrations/:registrationId/resend-ticket
// Re-sends the existing QR pass to an attendee who lost the email (V2 Flow 7).
router.post(
  "/:eventId/registrations/:registrationId/resend-ticket",
  requireAdminLogistics,
  resendRegistrationTicket
);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/checkin (manual override)
router.patch("/:eventId/registrations/:registrationId/checkin", requireAdminLogistics, manualCheckIn);

// PATCH /api/v1/events/:eventId/registrations/checkin (QR scanner)
router.patch("/:eventId/registrations/checkin", requireAdminLogistics, checkInByQr);

export default router;
