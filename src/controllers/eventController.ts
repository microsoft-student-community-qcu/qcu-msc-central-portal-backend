import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import {
  createEventSchema,
  updateEventSchema,
  registerEventSchema,
} from "../schemas/event.schema";

const prisma = new PrismaClient();

/**
 * Create a new event (Auth required: ADMIN/MEMBER).
 */
export async function createEvent(req: Request, res: Response): Promise<void> {
  try {
    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can create events",
      });
      return;
    }

    const validatedData = createEventSchema.parse(req.body);

    const event = await prisma.event.create({
      data: {
        title: validatedData.title,
        description: validatedData.description || null,
        date: validatedData.date,
        type: validatedData.type || "PUBLIC",
        maxCapacity: validatedData.maxCapacity,
      },
    });

    res.status(201).json({
      success: true,
      data: event,
      message: "Event created successfully",
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to create event",
      });
    }
  }
}

/**
 * Get event by ID.
 */
export async function getEventById(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: "Event not found",
      });
      return;
    }

    // Get registration count
    const registeredCount = await prisma.registration.count({
      where: { eventId },
    });

    res.status(200).json({
      success: true,
      data: {
        ...event,
        registeredCount,
      },
      message: "Event retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve event",
    });
  }
}

/**
 * List all events with optional filtering.
 */
export async function listEvents(req: Request, res: Response): Promise<void> {
  try {
    const { type, startDate, endDate, limit = "50", offset = "0" } = req.query;

    const where: any = {};
    if (type) where.type = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const total = await prisma.event.count({ where });
    const events = await prisma.event.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { date: "asc" },
    });

    // Add registration count to each event
    const eventsWithCount = await Promise.all(
      events.map(async (event) => {
        const registeredCount = await prisma.registration.count({
          where: { eventId: event.id },
        });
        return { ...event, registeredCount };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        total,
        events: eventsWithCount,
      },
      message: "Events retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve events",
    });
  }
}

/**
 * Update event (Auth required: ADMIN/MEMBER).
 */
export async function updateEvent(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can update events",
      });
      return;
    }

    const validatedData = updateEventSchema.parse(req.body);

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: validatedData,
    });

    res.status(200).json({
      success: true,
      data: updatedEvent,
      message: "Event updated successfully",
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    } else if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Event not found",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update event",
      });
    }
  }
}

/**
 * Delete event (Auth required: ADMIN only).
 */
export async function deleteEvent(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;

    // Check authorization - ADMIN only
    const userRole = (req as any).userRole;
    if (userRole !== "ADMIN") {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN can delete events",
      });
      return;
    }

    await prisma.event.delete({
      where: { id: eventId },
    });

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Event not found",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to delete event",
      });
    }
  }
}

/**
 * Register for event (public and members-only).
 */
export async function registerEvent(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;
    const validatedData = registerEventSchema.parse(req.body);

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: "Event not found",
      });
      return;
    }

    // Check capacity
    const registrationCount = await prisma.registration.count({
      where: { eventId },
    });

    if (registrationCount >= event.maxCapacity) {
      res.status(409).json({
        success: false,
        error: "Event is at full capacity",
      });
      return;
    }

    // Check for existing registration
    if (validatedData.userId) {
      const existingReg = await prisma.registration.findFirst({
        where: {
          eventId,
          userId: validatedData.userId,
        },
      });

      if (existingReg) {
        res.status(409).json({
          success: false,
          error: "You're already registered for this event",
        });
        return;
      }
    } else {
      // For non-members, check by email
      const existingReg = await prisma.registration.findFirst({
        where: {
          eventId,
          email: validatedData.email,
        },
      });

      if (existingReg) {
        res.status(409).json({
          success: false,
          error: "Already registered with this email",
        });
        return;
      }
    }

    const registration = await prisma.registration.create({
      data: {
        eventId,
        userId: validatedData.userId || null,
        name: validatedData.name,
        email: validatedData.email,
        qrPayload: uuidv4(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        registrationId: registration.id,
        eventId: registration.eventId,
        name: registration.name,
        email: registration.email,
        qrCode: registration.qrPayload,
        hasAttended: registration.hasAttended,
        createdAt: registration.createdAt,
      },
      message: "Registration successful",
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Registration failed",
      });
    }
  }
}

/**
 * Get event registrations (Auth required: ADMIN/MEMBER).
 */
export async function getEventRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;
    const { hasAttended, limit = "50", offset = "0" } = req.query;

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can view registrations",
      });
      return;
    }

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: "Event not found",
      });
      return;
    }

    const where: any = { eventId };
    if (hasAttended !== undefined) {
      where.hasAttended = hasAttended === "true";
    }

    const total = await prisma.registration.count({ where });
    const registrations = await prisma.registration.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        registrations: registrations.map((reg) => ({
          registrationId: reg.id,
          name: reg.name,
          email: reg.email,
          hasAttended: reg.hasAttended,
          createdAt: reg.createdAt,
        })),
      },
      message: "Registrations retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve registrations",
    });
  }
}

/**
 * Mark attendance for event (Auth required: ADMIN/MEMBER).
 */
export async function markAttendance(req: Request, res: Response): Promise<void> {
  try {
    const { eventId, qrCode } = req.params;

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can mark attendance",
      });
      return;
    }

    // Find registration by QR code
    const registration = await prisma.registration.findFirst({
      where: {
        eventId,
        qrPayload: qrCode,
      },
    });

    if (!registration) {
      res.status(404).json({
        success: false,
        error: "Registration not found",
      });
      return;
    }

    if (registration.hasAttended) {
      res.status(409).json({
        success: false,
        error: "Already checked in",
      });
      return;
    }

    const updatedReg = await prisma.registration.update({
      where: { id: registration.id },
      data: { hasAttended: true },
    });

    res.status(200).json({
      success: true,
      data: {
        registrationId: updatedReg.id,
        hasAttended: true,
        message: `✓ ${updatedReg.name} checked in successfully`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to mark attendance",
    });
  }
}
