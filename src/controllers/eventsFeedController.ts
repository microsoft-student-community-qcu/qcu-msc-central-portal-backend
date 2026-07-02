import { Request, Response } from "express";
import { prisma } from "../config/database";

/**
 * GET /api/v1/events
 *
 * Returns the public events feed - only events whose date has not yet
 * passed, sorted soonest first. Used by the landing page's Active
 * Initiatives feed and the dedicated /events listing page.
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