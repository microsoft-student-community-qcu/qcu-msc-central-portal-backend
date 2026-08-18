import { Request, Response } from "express";
import { prisma } from "../config/database";
import { resendRegistrationTicketEmail } from "../services/email.service";

/**
 * POST /api/v1/events/:eventId/registrations/:registrationId/resend-ticket
 *
 * Re-sends the existing QR pass to an attendee who lost the original email
 * (V2 Flow 7 edge case). ADMIN_LOGISTICS only.
 *
 * The stored `qrPayload` is re-sent as-is — it is never regenerated, so any
 * copy of the pass the attendee may still have keeps working and check-in
 * behaviour is unchanged.
 *
 * Only APPROVED registrations are eligible: PENDING_REVIEW attendees have no
 * valid ticket yet, and REJECTED/CANCELLED ones must not receive one.
 * Tickets for a cancelled event are also refused, since that pass is void.
 */
export async function resendRegistrationTicket(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId, registrationId } = req.params;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    if (event.isCancelled) {
      res.status(409).json({
        success: false,
        message: "This event has been cancelled. Tickets can no longer be sent.",
      });
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

    if (registration.status !== "APPROVED") {
      res.status(400).json({
        success: false,
        message:
          "Only approved registrations have a QR pass. Approve the registration first.",
      });
      return;
    }

    // Unlike most emails, this one propagates errors — the admin triggered it
    // for one attendee and needs to know whether the re-send actually landed.
    try {
      await resendRegistrationTicketEmail(
        registration.email,
        event.title,
        registration.qrPayload
      );
    } catch (emailError) {
      console.error("Failed to re-send registration ticket:", emailError);
      res.status(502).json({
        success: false,
        message: "Could not send the ticket email. Please try again.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        registrationId: registration.id,
        eventId: registration.eventId,
        email: registration.email,
        resentAt: new Date(),
      },
      message: `QR pass re-sent to ${registration.email}`,
    });
  } catch (error) {
    console.error("Failed to re-send ticket:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while re-sending ticket",
    });
  }
}
