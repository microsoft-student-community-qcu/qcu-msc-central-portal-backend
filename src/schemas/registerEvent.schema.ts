import { z } from "zod";

export const registerEventSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address format"),
  ocrSessionId: z.string().uuid("Invalid OCR session ID").optional(),
});

export type RegisterEventSchema = z.infer<typeof registerEventSchema>;
