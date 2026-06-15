import { Router } from "express";
import {
  createEvent,
  getEventById,
  listEvents,
  updateEvent,
  deleteEvent,
  registerEvent,
  getEventRegistrations,
  markAttendance,
} from "../controllers/eventController";
import { requireAuth } from "./authMiddleware";

const router = Router();

/**
 * POST /api/events
 * Create a new event (auth required: ADMIN/MEMBER)
 */
router.post("/", requireAuth, createEvent);

/**
 * GET /api/events
 * List all events (public)
 */
router.get("/", listEvents);

/**
 * GET /api/events/:eventId
 * Get event by ID (public)
 */
router.get("/:eventId", getEventById);

/**
 * PATCH /api/events/:eventId
 * Update event (auth required: ADMIN/MEMBER)
 */
router.patch("/:eventId", requireAuth, updateEvent);

/**
 * DELETE /api/events/:eventId
 * Delete event (auth required: ADMIN only)
 */
router.delete("/:eventId", requireAuth, deleteEvent);

/**
 * POST /api/events/:eventId/register
 * Register for event (public and auth)
 */
router.post("/:eventId/register", registerEvent);

/**
 * GET /api/events/:eventId/registrations
 * Get event registrations (auth required: ADMIN/MEMBER)
 */
router.get("/:eventId/registrations", requireAuth, getEventRegistrations);

/**
 * POST /api/events/:eventId/attendance/:qrCode
 * Mark attendance (auth required: ADMIN/MEMBER)
 */
router.post("/:eventId/attendance/:qrCode", requireAuth, markAttendance);

export default router;
