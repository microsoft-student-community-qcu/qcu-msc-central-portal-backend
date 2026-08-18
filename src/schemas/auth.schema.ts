import { z } from "zod";

// ── Sign up ─────────────────────────────────────────────────────────────────
// Public POST body for /api/auth/sign-up/email (Better Auth forwarding).
// setupToken authorizes account creation via the approved applicant flow
// (prevents account pre-hijacking — see VUL-004).
export const signUpSchema = z.object({
  email: z.string({ message: "Email is required" }).email({ message: "Invalid email format" }),
  password: z
    .string({ message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
  firstName: z.string({ message: "First name is required" }).min(1, "First name cannot be empty"),
  lastName: z.string({ message: "Last name is required" }).min(1, "Last name cannot be empty"),
  middleInitial: z
    .string({ message: "Middle initial must be a single letter" })
    .regex(/^[A-Za-z]\.?$/, "Middle initial must be a single letter, optionally followed by a dot")
    .optional(),
  studentId: z.string({ message: "Student ID is required" }),
  setupToken: z.string({ message: "Setup token is required" }).min(1, "Setup token is required"),
});

// ── Sign in ─────────────────────────────────────────────────────────────────
// Public POST body for the portal-specific sign-in endpoints and the disabled
// generic /api/auth/sign-in/email route.
export const signInSchema = z.object({
  email: z.string({ message: "Email is required" }).email({ message: "Invalid email format" }),
  password: z.string({ message: "Password is required" }),
});

export type SignUpSchema = z.infer<typeof signUpSchema>;
export type SignInSchema = z.infer<typeof signInSchema>;