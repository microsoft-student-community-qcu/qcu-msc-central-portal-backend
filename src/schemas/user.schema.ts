import { z } from "zod";

export const userRoleEnum = z.enum(
  ["APPLICANT", "MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS"],
  { error: "Role must be APPLICANT, MEMBER, ADMIN_HR, or ADMIN_LOGISTICS" }
);

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address format"),
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