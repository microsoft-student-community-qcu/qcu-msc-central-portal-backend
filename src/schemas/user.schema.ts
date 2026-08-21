import { z } from "zod";
import { V1_ROLES, ALL_ROLES } from "../config/roles";

// V1 role enum — locked to the V1 role set so legacy ADMIN_HR role updates can
// never grant V2 roles (SUPERADMIN / finance / logistics head / startup dev).
export const userRoleEnum = z.enum(V1_ROLES, {
  error: "Role must be APPLICANT, MEMBER, ADMIN_HR, or ADMIN_LOGISTICS",
});

// Full V2 role enum — used by the SUPERADMIN-only admin role management API.
export const adminUserRoleEnum = z.enum(ALL_ROLES, {
  error: "Role must be a valid system role",
});

export const createUserSchema = z.object({
  student_id: z
    .string()
    .min(1, "Student ID is required")
    .regex(/^\d{2}-\d{4}$/, "Student ID must be in format YY-NNNN (e.g., 23-1234)"),
  firstName: z.string().min(1, "First name is required").max(100, "First name must be less than 100 characters"),
  lastName: z.string().min(1, "Last name is required").max(100, "Last name must be less than 100 characters"),
  middleInitial: z
    .string()
    .regex(/^[A-Za-z]\.?$/, "Middle initial must be a single letter, optionally followed by a dot")
    .optional(),
  email: z.string().email("Invalid email address format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address format"),
  password: z.string().min(1, "Password is required"),
});

export const updateUserRoleSchema = z.object({
  role: userRoleEnum,
});

export const adminUpdateUserRoleSchema = z.object({
  role: adminUserRoleEnum,
});

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type LoginUserSchema = z.infer<typeof loginUserSchema>;
export type UpdateUserRoleSchema = z.infer<typeof updateUserRoleSchema>;
export type UserRoleEnum = z.infer<typeof userRoleEnum>;