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
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
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