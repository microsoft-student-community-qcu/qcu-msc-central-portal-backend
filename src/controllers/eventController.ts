import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRegisterEventSchema } from "../schemas/registerEvent.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import {
  createEventSchema,
  registrationToggleSchema,
  reviewRegistrationSchema,
} from "../schemas/event.schema";
import { validateImageMimeType } from "../utils/fileValidation";
import { saveEventBanner } from "../utils/imageStorage";

import {
  sendRegistrationConfirmedEmail,
  sendRegistrationPendingReviewEmail,
  sendRegistrationApprovedEmail,
  sendRegistrationRejectedEmail,
} from "../services/email.service";

/**
 * POST /api/v1/events/:eventId/register
 *
 * Handles event registration for both authenticated Members (who bypass
 * OCR entirely, per PRD's Frictionless Event Registration) and
 * unauthenticated Guests (who must supply a valid ocrSessionId from a
 * prior POST /api/v1/ocr/verify call).
 *
 * Relies on authMiddleware (mounted globally in app.ts) having already
 * run and set req.userId / req.userRole — both null if no valid session
 * exists. This route intentionally does NOT use requireAuth, since
 * Guests must be able to reach it; the Member/Guest branch happens
 * internally below.
 *
 * Security note: studentId, manual_registration, and registration status
 * are never trusted from the client body. Guest path values are derived
 * exclusively from the OCR session (same pattern as applicantController's
 * manual_application resolution). Member path identity (name/email) is
 * pulled from the authenticated User record, never from the request body.
 */
export async function registerForEvent(
  req: Request,
  res: Response
): Promise<void> {
  const { eventId } = req.params;
  const userId = (req as any).userId as string | null;
  const userRole = (req as any).userRole as string | null;
  const isMemberPath = userRole === "MEMBER";

  try {
    // ── 1. Fetch event ───────────────────────────────────────────────────
    const event = await prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    // ── 2. Event type gating (V2 Flow 2) ─────────────────────────────────
    //   MEMBERS_ONLY      → authenticated MEMBER only
    //   QCU_STUDENTS_ONLY → members bypass; guests must pass OCR (enforced
    //                       by the schema selected in step 5)
    //   PUBLIC            → no auth, no OCR
    if (event.type === "MEMBERS_ONLY" && !isMemberPath) {
      res.status(403).json({
        success: false,
        message:
          "This event is exclusively for active MSC members. Please apply to the organization to join.",
      });
      return;
    }

    // ── 3. Registration window checks ────────────────────────────────────
    // V2 replaced V1's tiered priority/general window with a single
    // deadline plus a manual open/close toggle (Flow 6). Both apply to
    // members and guests alike.
    const now = new Date();

    if (!event.isRegistrationOpen) {
      res.status(403).json({
        success: false,
        message: "Registration for this event is currently closed.",
      });
      return;
    }

    if (event.registrationDeadline && now > event.registrationDeadline) {
      res.status(403).json({
        success: false,
        message: "The registration deadline for this event has passed.",
      });
      return;
    }


    // ── 4. Capacity check ─────────────────────────────────────────────────
    const currentRegistrationCount = await prisma.registration.count({
      where: { eventId, status: { not: "REJECTED" } },
    });

    if (currentRegistrationCount >= event.maxCapacity) {
      res
        .status(409)
        .json({ success: false, message: "Event is at full capacity." });
      return;
    }

    // ── 5. Resolve identity — Member path vs Guest path ──────────────────
    let lastName: string | null = null;
    let firstName: string | null = null;
    let middleInitial: string | null = null;
    let email: string;
    let studentId: string | null = null;
    let course: string | null = null;
    let yearLevel: string | null = null;
    let manualRegistration = false;
    let resolvedUserId: string | null = null;
    let ocrSessionId: string | undefined;

    if (isMemberPath) {
      const user = await prisma.user.findUnique({ where: { id: userId! } });
      if (!user) {
        res.status(401).json({ success: false, message: "User not found" });
        return;
      }

      lastName = user.lastName;
      firstName = user.firstName;
      middleInitial = user.middleInitial;
      email = user.email;
      resolvedUserId = user.id;

      const existing = await prisma.registration.findUnique({
        where: { eventId_userId: { eventId, userId: resolvedUserId } },
      });
      if (existing) {
        res.status(409).json({
          success: false,
          message: "You're already registered for this event.",
        });
        return;
      }
    } else {
      // ── Guest path — validate body against the event-type schema ──────
      // PUBLIC events accept no ocrSessionId at all; QCU_STUDENTS_ONLY
      // requires one (OCR is the enrollment gate for that tier).
      const parsed = getRegisterEventSchema(event.type).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: "One or more fields are invalid. Check the errors field for details.",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const data = parsed.data as Record<string, string | undefined>;
      lastName = data.lastName ?? null;
      firstName = data.firstName ?? null;
      middleInitial = data.middleInitial ?? null;
      email = data.email as string;
      course = data.course ?? null;
      yearLevel = data.yearLevel ?? null;

      if (event.type === "PUBLIC") {
        // No OCR — the (optional) student ID is self-reported.
        studentId = data.studentId ?? null;
      } else {
        ocrSessionId = data.ocrSessionId;

        const session = ocrSessionId ? ocrStore.getSession(ocrSessionId) : null;
        if (!session) {
          res.status(400).json({
            success: false,
            message:
              "OCR session expired or invalid. Please re-verify your Student ID via POST /api/v1/ocr/verify.",
          });
          return;
        }

        studentId = session.studentId;
        manualRegistration = session.manualRequired;
        if (!studentId && !manualRegistration) {
          // Defensive — shouldn't happen given ocrStore's own logic, but
          // guards against an inconsistent session state.
          res.status(400).json({
            success: false,
            message: "Student ID could not be resolved from OCR session.",
          });
          return;
        }
      }


      // Duplicate prevention by studentId — blocks ticket hoarding via
      // repeated scans of the same physical ID.
      if (studentId) {
        const existing = await prisma.registration.findUnique({
          where: { eventId_studentId: { eventId, studentId } },
        });
        if (existing) {
          res.status(409).json({
            success: false,
            message: "This Student ID is already registered for this event.",
          });
          return;
        }
      }
    }

    // ── 6. Create registration ───────────────────────────────────────────
    const qrPayload = randomUUID();

    const registration = await prisma.registration.create({
      data: {
        eventId,
        userId: resolvedUserId,
        studentId,
        lastName: lastName ?? "",
        firstName: firstName ?? "",
        middleInitial,
        email,
        course,
        yearLevel,
        qrPayload,

        manual_registration: manualRegistration,
        status: manualRegistration ? "PENDING_REVIEW" : "APPROVED",
      },
    });

    // ── 7. Clean up OCR session (guest path only) ────────────────────────
    if (!isMemberPath && ocrSessionId) {
      ocrStore.deleteSession(ocrSessionId);
    }

    // ── 8. Send confirmation email ────────────────────────────────────────
    if (registration.status === "APPROVED") {
      await sendRegistrationConfirmedEmail(registration.email, event.title, qrPayload);
    } else {
      await sendRegistrationPendingReviewEmail(registration.email, event.title);
    }

    // ── 9. Respond ────────────────────────────────────────────────────────
    if (registration.status === "PENDING_REVIEW") {
      res.status(202).json({
        success: true,
        data: { registrationId: registration.id, status: "pending_review" },
        message:
          "Registration submitted for manual review. Your ticket will be emailed once an Admin verifies your ID.",
      });
    } else {
      res.status(201).json({
        success: true,
        data: {
          registrationId: registration.id,
          status: "approved",
          qrPayload,
        },
        message: "Registration successful. Check your email for your QR Pass.",
      });
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message: "Duplicate registration detected for this event.",
      });
      return;
    }

    console.error("Event registration failed:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal server error during registration" });
  }
}

// ── Admin: Create Event ──────────────────────────────────────────────────

/**
 * POST /api/v1/events
 *
 * Creates a new event. ADMIN_LOGISTICS only.
 * Once created, the event automatically appears in the public /events feed.
 *
 * Accepts multipart/form-data so the banner image (optional `bannerImage`
 * file field) can be uploaded alongside the text fields. The stored
 * bannerImageUrl is always derived server-side from the uploaded file —
 * never accepted from the request body.
 */
export async function createEvent(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // ── Optional banner upload ────────────────────────────────────────────
    const bannerFile = (req.files as Record<string, Express.Multer.File[]> | undefined)
      ?.bannerImage?.[0];
    let bannerImageUrl: string | null = null;

    if (bannerFile) {
      // Magic-byte validation (VUL-010) — the extension/Content-Type
      // reported by the client is not trusted.
      const validation = await validateImageMimeType(bannerFile.buffer, "bannerImage");
      if (!validation.valid) {
        res.status(400).json({ success: false, message: validation.message });
        return;
      }

      bannerImageUrl = await saveEventBanner(
        bannerFile.buffer,
        `${randomUUID()}-${bannerFile.originalname}`,
        bannerFile.mimetype
      );
    }

    const event = await prisma.event.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        date: parsed.data.date,
        venue: parsed.data.venue,
        registrationDeadline: parsed.data.registrationDeadline,
        bannerImageUrl,
        requiresQrTicket: parsed.data.requiresQrTicket ?? true,
        isRegistrationOpen: parsed.data.isRegistrationOpen ?? true,
        type: parsed.data.type ?? "PUBLIC",
        maxCapacity: parsed.data.maxCapacity,
      },
    });

    res.status(201).json({
      success: true,
      data: event,
      message: "Event created successfully",
    });
  } catch (error) {
    console.error("Failed to create event:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Toggle Registration Open/Closed ───────────────────────────────

/**
 * PATCH /api/v1/events/:eventId/registration-toggle
 *
 * Manually opens or closes registration for an event (V2 Flow 6),
 * independently of the deadline and remaining capacity. Closing only
 * blocks *new* registrations — existing ones are untouched — and the
 * action is fully reversible. ADMIN_LOGISTICS only.
 *
 * Body: { isRegistrationOpen: boolean }
 */
export async function toggleEventRegistration(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId } = req.params;
    const parsed = registrationToggleSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { isRegistrationOpen: parsed.data.isRegistrationOpen },
    });

    res.status(200).json({
      success: true,
      data: {
        eventId: updated.id,
        isRegistrationOpen: updated.isRegistrationOpen,
      },
      message: updated.isRegistrationOpen
        ? "Registration reopened successfully"
        : "Registration closed successfully",
    });
  } catch (error) {
    console.error("Failed to toggle event registration:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


// ── Admin: Get Event Attendee Roster ─────────────────────────────────────

/**
 * GET /api/v1/events/:eventId/registrations
 *
 * Returns all registrations for a specific event including check-in status.
 * ADMIN_LOGISTICS only.
 *
 * Query params:
 *   - status (optional): APPROVED | PENDING_REVIEW | REJECTED | CANCELLED
 *   - hasAttended (optional): true | false
 */
export async function getEventRegistrations(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId } = req.params;
    const { status, hasAttended } = req.query as Record<string, string>;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    const where: any = { eventId };
    if (status) where.status = status;
    if (hasAttended !== undefined) {
      where.hasAttended = hasAttended === "true";
    }

    const [total, registrations] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        event: {
          id: event.id,
          title: event.title,
          date: event.date,
          maxCapacity: event.maxCapacity,
          registeredCount: total,
          spotsRemaining: event.maxCapacity - total,
        },
        total,
        registrations,
      },
      message: "Registrations retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to fetch registrations:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Review Manual Registration ─────────────────────────────────

/**
 * PATCH /api/v1/events/:eventId/registrations/:registrationId/approve
 *
 * Allows ADMIN_LOGISTICS to approve or reject registrations that were
 * flagged for manual review after OCR failure. Approvals emit a stubbed
 * email log with a QR ticket URL derived from the registration's qrPayload.
 */
export async function reviewRegistration(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId, registrationId } = req.params;
    const parsed = reviewRegistrationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
    });

    if (!registration || registration.eventId !== eventId) {
      res.status(404).json({
        success: false,
        message: "Registration not found for this event",
      });
      return;
    }

    if (registration.status !== "PENDING_REVIEW") {
      res.status(400).json({
        success: false,
        message: "Registration is not pending review",
      });
      return;
    }

    const nextStatus = parsed.data.action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: { status: nextStatus },
    });

    if (parsed.data.action === "approve") {
      await sendRegistrationApprovedEmail(updated.email, event.title, updated.qrPayload);
    } else {
      await sendRegistrationRejectedEmail(updated.email, event.title);
    }

    res.status(200).json({
      success: true,
      data: {
        registrationId: updated.id,
        eventId: updated.eventId,
        status: updated.status,
        action: parsed.data.action,
      },
      message:
        parsed.data.action === "approve"
          ? "Registration approved successfully"
          : "Registration rejected successfully",
    });
  } catch (error) {
    console.error("Failed to review registration:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: QR Check-In ───────────────────────────────────────────────────

/**
 * PATCH /api/v1/events/:eventId/registrations/checkin
 *
 * Validates a QR payload against this specific event and marks the
 * registration as attended. Used by the QR scanner route.
 * ADMIN_LOGISTICS only.
 *
 * Body: { qrPayload: string }
 *
 * Returns 400 if the QR payload belongs to a different event,
 * is already scanned, or is not found — matching the PRD's
 * "Invalid Ticket or Already Scanned" error requirement.
 */
export async function checkInByQr(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId } = req.params;
    const { qrPayload } = req.body;

    if (!qrPayload || typeof qrPayload !== "string") {
      res.status(400).json({
        success: false,
        message: "qrPayload is required",
      });
      return;
    }

    const registration = await prisma.registration.findUnique({
      where: { qrPayload },
    });

    if (!registration || registration.eventId !== eventId) {
      res.status(400).json({
        success: false,
        message: "Invalid QR code.",
      });
      return;
    }

    if (registration.hasAttended) {
      res.status(400).json({
        success: false,
        message: "This ticket has already been checked in.",
      });
      return;
    }

    if (registration.status !== "APPROVED") {
      res.status(400).json({
        success: false,
        message: "Registration is not approved for check-in",
      });
      return;
    }

    const updated = await prisma.registration.update({
      where: { qrPayload },
      data: { hasAttended: true },
    });

    res.status(200).json({
      success: true,
      data: {
        registrationId: updated.id,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        hasAttended: updated.hasAttended,
      },
      message: `${updated.firstName} ${updated.lastName} checked in successfully`.trim(),
    });
  } catch (error) {
    console.error("Failed to check in:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// ── Admin: Manual Check-In Override ─────────────────────────────────────

/**
 * PATCH /api/v1/events/:eventId/registrations/:registrationId/checkin
 *
 * Manual check-in override for cases where the QR scanner fails
 * (cracked screen, damaged QR, etc.). Looks up by registrationId
 * instead of QR payload. ADMIN_LOGISTICS only.
 */
export async function manualCheckIn(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId, registrationId } = req.params;

    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
    });

    if (!registration || registration.eventId !== eventId) {
      res.status(404).json({
        success: false,
        message: "Registration not found for this event",
      });
      return;
    }

    if (registration.hasAttended) {
      res.status(400).json({
        success: false,
        message: "This attendee has already been checked in",
      });
      return;
    }

    if (registration.status !== "APPROVED") {
      res.status(400).json({
        success: false,
        message: "Registration is not approved for check-in",
      });
      return;
    }

    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: { hasAttended: true },
    });

    res.status(200).json({
      success: true,
      data: {
        registrationId: updated.id,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        hasAttended: updated.hasAttended,
      },
      message: `${updated.firstName} ${updated.lastName} checked in successfully (manual override)`.trim(),
    });
  } catch (error) {
    console.error("Failed to manually check in:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}