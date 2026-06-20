import { z } from "zod";

// Zod enum for UserRole values.
// Mirrors Prisma UserRole exactly (matches docs/data-models.md: ADMIN | MEMBER | STUDENT).
export const userRoleEnum = z.enum(["ADMIN", "MEMBER", "STUDENT"], {
  error: "Role must be ADMIN, MEMBER, or STUDENT",
});

// Schema for creating a new user.
// Only public signup fields are accepted — role is never client-settable.
export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address format"),
});

// Schema for logging in a user.
export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address format"),
  password: z.string().min(1, "Password is required"),
});

// Schema for updating a user's role.
// Restricted to ADMIN-only routes at the controller/middleware level.
export const updateUserRoleSchema = z.object({
  role: userRoleEnum,
});

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type LoginUserSchema = z.infer<typeof loginUserSchema>;
export type UpdateUserRoleSchema = z.infer<typeof updateUserRoleSchema>;
export type UserRoleEnum = z.infer<typeof userRoleEnum>;