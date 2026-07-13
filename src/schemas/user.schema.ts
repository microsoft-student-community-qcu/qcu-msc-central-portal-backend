import { z } from "zod";

export const userRoleEnum = z.enum(
  ["APPLICANT", "MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS"],
  { error: "Role must be APPLICANT, MEMBER, ADMIN_HR, or ADMIN_LOGISTICS" }
);

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

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type LoginUserSchema = z.infer<typeof loginUserSchema>;
export type UpdateUserRoleSchema = z.infer<typeof updateUserRoleSchema>;
export type UserRoleEnum = z.infer<typeof userRoleEnum>;