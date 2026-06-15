import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  createApplicantSchema,
  updateApplicantStatusSchema,
  updateApplicantSchema,
} from "../schemas/applicant.schema";

const prisma = new PrismaClient();

/**
 * Create a new applicant (submit application).
 * No authentication required - open recruitment.
 */
export async function createApplicant(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = createApplicantSchema.parse(req.body);

    // Check if email already exists
    const existingApplicant = await prisma.applicant.findUnique({
      where: { email: validatedData.email },
    });

    if (existingApplicant) {
      res.status(409).json({
        success: false,
        error: "Email already submitted an application",
        details: { email: validatedData.email },
      });
      return;
    }

    const applicant = await prisma.applicant.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        departmentChoice: validatedData.departmentChoice,
        resumeLink: validatedData.resumeLink,
        githubLink: validatedData.githubLink,
        status: "APPLIED",
      },
    });

    res.status(201).json({
      success: true,
      data: applicant,
      message: "Application submitted successfully",
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
        error: "Failed to submit application",
      });
    }
  }
}

/**
 * Get applicant by ID (Auth required: ADMIN/MEMBER).
 */
export async function getApplicantById(req: Request, res: Response): Promise<void> {
  try {
    const { applicantId } = req.params;

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can view applicants",
      });
      return;
    }

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        error: "Applicant not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: applicant,
      message: "Applicant retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve applicant",
    });
  }
}

/**
 * List all applicants with optional filtering (Auth required: ADMIN/MEMBER).
 */
export async function listApplicants(req: Request, res: Response): Promise<void> {
  try {
    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can list applicants",
      });
      return;
    }

    const { status, departmentChoice, limit = "50", offset = "0" } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (departmentChoice) where.departmentChoice = departmentChoice;

    const total = await prisma.applicant.count({ where });
    const applicants = await prisma.applicant.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        applicants,
      },
      message: "Applicants retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve applicants",
    });
  }
}

/**
 * Update applicant status (Auth required: ADMIN/MEMBER).
 */
export async function updateApplicantStatus(req: Request, res: Response): Promise<void> {
  try {
    const { applicantId } = req.params;
    const validatedData = updateApplicantStatusSchema.parse(req.body);

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can update applicant status",
      });
      return;
    }

    const updatedApplicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: { status: validatedData.status },
    });

    res.status(200).json({
      success: true,
      data: updatedApplicant,
      message: "Applicant status updated successfully",
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
        error: "Applicant not found",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update applicant status",
      });
    }
  }
}

/**
 * Update applicant details (Auth required: ADMIN/MEMBER).
 */
export async function updateApplicant(req: Request, res: Response): Promise<void> {
  try {
    const { applicantId } = req.params;
    const validatedData = updateApplicantSchema.parse(req.body);

    // Check authorization
    const userRole = (req as any).userRole;
    if (!["ADMIN", "MEMBER"].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: "Forbidden - only ADMIN/MEMBER can update applicants",
      });
      return;
    }

    const updatedApplicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: validatedData,
    });

    res.status(200).json({
      success: true,
      data: updatedApplicant,
      message: "Applicant updated successfully",
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
        error: "Applicant not found",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update applicant",
      });
    }
  }
}
