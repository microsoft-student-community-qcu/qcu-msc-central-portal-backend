import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createUserSchema, loginUserSchema, updateUserRoleSchema } from "../schemas/user.schema";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

const prisma = new PrismaClient();

/**
 * Create a new user account.
 * Only email and name are stored; authentication is handled by Better Auth.
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = createUserSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        error: "Email already registered",
        details: { email: validatedData.email },
      });
      return;
    }

    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        role: validatedData.role,
        emailVerified: false,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      message: "User created successfully",
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
        error: "Failed to create user",
      });
    }
  }
}

/**
 * Login user and return JWT token.
 */
export async function loginUser(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = loginUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
      return;
    }

    // Note: Password validation should be handled by Better Auth in production
    // For now, we'll generate a token for authenticated users
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
    );

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      message: "Login successful",
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
        error: "Login failed",
      });
    }
  }
}

/**
 * Get authenticated user's profile.
 */
export async function getUserProfile(req: Request, res: Response): Promise<void> {
  try {
    // Extract user ID from JWT token (set by auth middleware)
    const userId = (req as any).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
      message: "User profile retrieved",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve user profile",
    });
  }
}

/**
 * Update user role (Admin only).
 */
export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const validatedData = updateUserRoleSchema.parse(req.body);

    // Check authorization (must be admin)
    const currentUserRole = (req as any).userRole;
    if (currentUserRole !== "ADMIN") {
      res.status(403).json({
        success: false,
        error: "Forbidden - only admins can update user roles",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: validatedData.role },
    });

    res.status(200).json({
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        updatedAt: updatedUser.updatedAt,
      },
      message: "User role updated successfully",
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
        error: "User not found",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update user role",
      });
    }
  }
}
