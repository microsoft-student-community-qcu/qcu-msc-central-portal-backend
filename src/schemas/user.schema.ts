import { z } from "zod";

/**
 * Schema for creating a new user or administrator.
 */
export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Invalid email address format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password must be less than 100 characters"),
  role: z
    .enum(["ADMIN", "MEMBER", "STUDENT"])
    .default("STUDENT"),
});

/**
 * Schema for logging in a user.
 */
export const loginUserSchema = z.object({
  email: z
    .string()
    .email("Invalid email address format"),
  password: z
    .string()
    .min(1, "Password is required"),
});

/**
 * Schema for updating a user's role.
 */
export const updateUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "STUDENT"], {
    errorMap: () => ({ message: "Role must be ADMIN, MEMBER, or STUDENT" }),
  }),
});

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type LoginUserSchema = z.infer<typeof loginUserSchema>;
export type UpdateUserRoleSchema = z.infer<typeof updateUserRoleSchema>;
