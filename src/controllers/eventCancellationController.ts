import { Request, Response } from "express";
import { prisma } from "../config/database";
import { cancelEventSchema } from "../schemas/event.schema";
import { sendEventCancelledEmail } from "../services/email.service";

// Registration statuses whose owners still expect to attend, and therefore
// must be notified when the whole event is called off. REJECTED and CANCELLED
// registrants were never (or are no longer) attending, so they are skipped.
const NOTIFIABLE_STATUSES = ["APPROVED", "PENDING_REVIEW"] as const;

/**
 * PATCH /api/v1/events/:eventId/cancel
 *
 * Cancels an entire event (V2 Flow 8) — as opposed to cancelling a single
 * attendee's registration, which is tracked separately.
 *
 * This is a SOFT DELETE by design: no Event or Registration row is ever
 * destroyed. The event is flagged `isCancelled` with the admin's reason and a
 * timestamp, so the full attendee roster stays intact for audit and reporting.
 * The public feed / detail endpoints filter cancelled events out, and check-in
 * refuses tickets belonging to them.
 *
 * A reason is mandatory: it is embedded verbatim in the notification email sent
 * to every PENDING_REVIEW and APPROVED registrant.
 *
 * TODO(auth): V2 Flow 8 restricts cancellation to ADMIN_LOGISTICS_HEAD /
 * SUPERADMIN, but neither role exists in the UserRole enum yet and
 * authMiddleware has no matching guard. Shipped behind requireAdminLogistics —
 * tighten the guard once those roles land (tracked in a separate auth/RBAC issue).
 */
export async function cancelEvent(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;

    // ── 1. Validate body — the reason drives the notification email ────────
    const parsed = cancelEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { reason } = parsed.data;

    // ── 2. Fetch event ─────────────────────────────────────────────────────
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    if (event.isCancelled) {
      res.status(409).json({
        success: false,
        message: "This event has already been cancelled.",
      });
      return;
    }

    // ── 3. Soft delete — flag only, never destroy rows ─────────────────────
    const cancelled = await prisma.event.update({
      where: { id: eventId },
      data: {
        isCancelled: true,
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });

    // ── 4. Notify everyone who was still expecting to attend ───────────────
    const recipients = await prisma.registration.findMany({
      where: { eventId, status: { in: [...NOTIFIABLE_STATUSES] } },
      select: { email: true },
    });

    // allSettled: one bad address must not stop the rest of the roster from
    // being notified. sendEventCancelledEmail already logs its own failures.
    await Promise.allSettled(
      recipients.map((registration) =>
        sendEventCancelledEmail(registration.email, cancelled.title, reason)
      )
    );

    res.status(200).json({
      success: true,
      data: {
        eventId: cancelled.id,
        title: cancelled.title,
        isCancelled: cancelled.isCancelled,
        cancellationReason: cancelled.cancellationReason,
        cancelledAt: cancelled.cancelledAt,
        notifiedRegistrants: recipients.length,
      },
      message: `Event cancelled successfully. ${recipients.length} registrant(s) notified.`,
    });
  } catch (error) {
    console.error("Failed to cancel event:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while cancelling event",
    });
  }
}
