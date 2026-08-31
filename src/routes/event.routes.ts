import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import { registerForEvent } from "../controllers/eventController";
import { getEvents, getEventById } from "../controllers/eventsFeedController";
import {
  createEvent,
  getEventRegistrations,
  reviewRegistration,
  checkInByQr,
  manualCheckIn,
  toggleEventRegistration,
} from "../controllers/eventController";
import { requireAdminLogistics } from "../routes/authMiddleware";

// Event banners are held in memory and streamed straight to Azure Blob.
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleMulterError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        message: "The banner image must not exceed 5MB",
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: "Banner image upload error",
    });
    return;
  }
  next(err);
}

const router = Router();

// ── Public Routes ────────────────────────────────────────────────────────

// GET /api/v1/events
router.get("/", getEvents);

// GET /api/v1/events/:eventId
router.get("/:eventId", getEventById);

// POST /api/v1/events/:eventId/register
router.post("/:eventId/register", registerForEvent);

// ── Admin Routes (ADMIN_LOGISTICS only) ──────────────────────────────────

// POST /api/v1/events — multipart/form-data with an optional bannerImage file
router.post(
  "/",
  requireAdminLogistics,
  upload.fields([{ name: "bannerImage", maxCount: 1 }]),
  handleMulterError,
  createEvent
);

// PATCH /api/v1/events/:eventId/registration-toggle (manual open/close)
// Declared before the /registrations/* routes for clarity; paths do not collide.
router.patch(
  "/:eventId/registration-toggle",
  requireAdminLogistics,
  toggleEventRegistration
);

// GET /api/v1/events/:eventId/registrations
router.get("/:eventId/registrations", requireAdminLogistics, getEventRegistrations);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/approve
router.patch(
  "/:eventId/registrations/:registrationId/approve",
  requireAdminLogistics,
  reviewRegistration
);

// PATCH /api/v1/events/:eventId/registrations/:registrationId/checkin (manual override)
router.patch("/:eventId/registrations/:registrationId/checkin", requireAdminLogistics, manualCheckIn);

// PATCH /api/v1/events/:eventId/registrations/checkin (QR scanner)
router.patch("/:eventId/registrations/checkin", requireAdminLogistics, checkInByQr);

export default router;
