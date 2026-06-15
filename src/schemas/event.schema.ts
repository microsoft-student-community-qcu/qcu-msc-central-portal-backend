import { z } from "zod";

/**
 * Schema for creating a new workshop or seminar event.
 */
export const createEventSchema = z.object({
  title: z
    .string()
    .min(1, "Event title is required")
    .max(150, "Event title must be less than 150 characters"),
  description: z
    .string()
    .max(1000, "Description must be less than 1000 characters")
    .optional()
    .nullable(),
  date: z.coerce.date({
    required_error: "Event date is required",
    invalid_type_error: "Invalid date format",
  }),
  type: z
    .enum(["PUBLIC", "MEMBERS_ONLY"])
    .default("PUBLIC"),
  maxCapacity: z
    .number()
    .int("Capacity must be an integer")
    .positive("Capacity must be a positive number"),
});

/**
 * Schema for updating an event's details.
 */
export const updateEventSchema = createEventSchema.partial();

/**
 * Schema for registering a student (either Member or Non-Member) to an event.
 */
export const registerEventSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Invalid email address format"),
  userId: z
    .string()
    .uuid("User ID must be a valid UUID")
    .optional()
    .nullable(),
});

export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type UpdateEventSchema = z.infer<typeof updateEventSchema>;
export type RegisterEventSchema = z.infer<typeof registerEventSchema>;
