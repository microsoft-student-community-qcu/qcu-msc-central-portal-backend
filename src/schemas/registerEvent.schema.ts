import { z } from "zod";

export const registerEventSchema = z.object({
  lastName: z
    .string({ message: "Last name is required" })
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters"),
  firstName: z
    .string({ message: "First name is required" })
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters"),
  middleInitial: z
    .string({ message: "Middle initial must be a single letter" })
    .regex(
      /^[A-Za-z]\.?$/,
      "Middle initial must be a single letter, optionally followed by a dot (e.g., B or B.)"
    )
    .optional(),
  email: z
    .string({ message: "Email is required" })
    .email("Invalid email address format"),
  ocrSessionId: z
    .string({ message: "OCR session ID must be a valid string" })
    .uuid("Invalid OCR session ID")
    .optional(),
});

export type RegisterEventSchema = z.infer<typeof registerEventSchema>;
