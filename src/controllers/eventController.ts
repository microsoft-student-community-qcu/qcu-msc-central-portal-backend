import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { registerEventSchema } from "../schemas/registerEvent.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import { createEventSchema, reviewRegistrationSchema } from "../schemas/event.schema";
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

    // ── 2. Members-Only block ────────────────────────────────────────────
    if (event.type === "MEMBERS_ONLY" && !isMemberPath) {
      res.status(403).json({
        success: false,
        message:
          "This event is for members only. Please apply to the organization.",
      });
      return;
    }

    // ── 3. Registration window checks (Guests only — Members bypass) ────
    const now = new Date();
    const inPriorityWindow =
      now >= event.priorityStartDate && now < event.generalStartDate;
    if (!isMemberPath) {
      if (now < event.priorityStartDate) {
        res
          .status(403)
          .json({ success: false, message: "Registration has not opened yet." });
        return;
      }
      if (inPriorityWindow) {
        res.status(403).json({
          success: false,
          message: "General Admission has not started.",
        });
        return;
      }
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
    let manualRegistration = false;
    let resolvedUserId: string | null = null;
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
      // ── Guest path — validate body, resolve OCR session ───────────────
      const parsed = registerEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: "One or more fields are invalid. Check the errors field for details.",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { lastName: bodyLastName, firstName: bodyFirstName, middleInitial: bodyMiddleInitial, email: bodyEmail, ocrSessionId } = parsed.data;

      if (!ocrSessionId) {
        res
          .status(400)
          .json({ success: false, message: "ocrSessionId is required" });
        return;
      }

      const session = ocrStore.getSession(ocrSessionId);
      if (!session) {
        res.status(400).json({
          success: false,
          message:
            "OCR session expired or invalid. Please re-verify your Student ID via POST /api/v1/ocr/verify.",
        });
        return;
      }

      lastName = bodyLastName;
      firstName = bodyFirstName;
      middleInitial = bodyMiddleInitial ?? null;
      email = bodyEmail;
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
        qrPayload,
        manual_registration: manualRegistration,
        status: manualRegistration ? "PENDING_REVIEW" : "APPROVED",
      },
    });

    // ── 7. TODO: consume OCR session ─────────────────────────────────────
    // ocrStore currently has no consumeSession()/delete method — flagged
    // with the team (same gap exists in applicantController.ts).

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

    const event = await prisma.event.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        date: parsed.data.date,
        priorityStartDate: parsed.data.priorityStartDate,
        generalStartDate: parsed.data.generalStartDate,
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