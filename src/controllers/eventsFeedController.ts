import { Request, Response } from "express";
import { prisma } from "../config/database";

/**
 * GET /api/v1/events/:eventId
 *
 * Returns details of a single public event.
 *
 * Cancelled events (soft-deleted via PATCH /:eventId/cancel) are treated as
 * absent here — they respond 404 with an explicit "cancelled" message so the
 * frontend can distinguish a called-off event from a bad ID. Admin-facing
 * endpoints still read the row directly, since nothing is ever deleted.
 */
export async function getEventById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: { registrations: { where: { status: { not: "REJECTED" } } } },
        },
      },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found",
      });
      return;
    }

    if (event.isCancelled) {
      res.status(404).json({
        success: false,
        message: "This event has been cancelled.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        priorityStartDate: event.priorityStartDate,
        generalStartDate: event.generalStartDate,
        type: event.type,
        maxCapacity: event.maxCapacity,
        registeredCount: event._count.registrations,
        spotsRemaining: event.maxCapacity - event._count.registrations,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
      message: "Event retrieved successfully",
    });
  } catch (error) {
    console.error("Failed to fetch event:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching event",
    });
  }
}

/**
 * GET /api/v1/events
 *
 * Returns the public events feed - only events whose date has not yet
 * passed, sorted soonest first. Used by the landing page's Active
 * Initiatives feed and the dedicated /events listing page.
 *
 * Cancelled events are excluded (soft delete — the rows still exist and remain
 * visible to admin endpoints).
 *
 * Does not require authentication. Returns the same list regardless of
 * caller's role - visibility filtering (e.g. hiding MEMBERS_ONLY events
 * from non-members) is left to the frontend / register endpoint, since
 * the PRD's landing page spec just shows upcoming events generally
 * ("top 3 upcoming active events") without role-based hiding at the
 * feed level.
 */
export async function getEvents(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();

    const events = await prisma.event.findMany({
      where: {
        date: { gte: now },
        isCancelled: false,
      },
      orderBy: {
        date: "asc",
      },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        priorityStartDate: true,
        generalStartDate: true,
        type: true,
        maxCapacity: true,
        _count: {
          select: { registrations: { where: { status: { not: "REJECTED" } } } },
        },
      },
    });

    const data = events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      priorityStartDate: event.priorityStartDate,
      generalStartDate: event.generalStartDate,
      type: event.type,
      maxCapacity: event.maxCapacity,
      registeredCount: event._count.registrations,
      spotsRemaining: event.maxCapacity - event._count.registrations,
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Failed to fetch events:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching events",
    });
  }
}