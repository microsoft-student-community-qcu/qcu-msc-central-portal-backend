import { Request, Response } from "express";
import { prisma } from "../config/database";
import { z } from "zod";

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        studentId: true,
        role: true,
        image: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Failed to get user profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const validRoles = ["APPLICANT", "MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS"];
    if (!validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: `Role must be one of: ${validRoles.join(", ")}`,
      });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        studentId: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: user,
      message: "User role updated successfully",
    });
  } catch (error) {
    console.error("Failed to update user role:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

const linkApplicantSchema = z.object({
  applicantId: z.string(),
});

export async function linkApplicant(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const parsed = linkApplicantSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { applicantId } = parsed.data;

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
    });

    if (!applicant) {
      res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
      return;
    }

    if (applicant.userId) {
      res.status(409).json({
        success: false,
        message: "Applicant is already linked to a user account",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (user.email !== applicant.email) {
      res.status(400).json({
        success: false,
        message: "The authenticated user's email does not match the applicant's email",
      });
      return;
    }

    await prisma.applicant.update({
      where: { id: applicantId },
      data: { userId },
    });

    res.status(200).json({
      success: true,
      message: "Applicant linked to user account successfully",
    });
  } catch (error) {
    console.error("Failed to link applicant:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
