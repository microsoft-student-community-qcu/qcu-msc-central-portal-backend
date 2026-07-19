import { z } from "zod";

// Zod enum for EventType values.
// Mirrors Prisma EventType exactly.
export const eventTypeEnum = z.enum(["PUBLIC", "MEMBERS_ONLY"], {
  error: "Event type must be PUBLIC or MEMBERS_ONLY",
});

// Zod enum for RegistrationStatus values.
// Mirrors Prisma RegistrationStatus exactly.
export const registrationStatusEnum = z.enum(
  ["APPROVED", "PENDING_REVIEW", "REJECTED", "CANCELLED"],
  { error: "Status must be APPROVED, PENDING_REVIEW, REJECTED, or CANCELLED" }
);

// Schema for creating a new event.
// Restricted to ADMIN_LOGISTICS routes per PRD-V1: only Admin (Logistics)
// can create event entries.
export const createEventSchema = z
  .object({
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
      error: "Event date is required and must be a valid date",
    }),
    // Tiered registration windows — PRD-V1 Event Registration & Ticketing.
    priorityStartDate: z.coerce.date({
      error: "Priority start date is required and must be a valid date",
    }),
    generalStartDate: z.coerce.date({
      error: "General start date is required and must be a valid date",
    }),
    type: eventTypeEnum.optional().default("PUBLIC"),
    maxCapacity: z
      .number()
      .int("Capacity must be an integer")
      .positive("Capacity must be a positive number"),
  })
  .refine((data) => data.generalStartDate > data.priorityStartDate, {
    message: "General start date must be after priority start date",
    path: ["generalStartDate"],
  });

// Schema for updating an event's details.
// Defined separately (not via .partial() on createEventSchema) because
// Zod v4 does not allow .partial() on schemas containing .refine().
export const updateEventSchema = z.object({
  title: z
    .string()
    .min(1, "Event title is required")
    .max(150, "Event title must be less than 150 characters")
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be less than 1000 characters")
    .optional()
    .nullable(),
  date: z.coerce.date({
    error: "Event date is required and must be a valid date",
  }).optional(),
  priorityStartDate: z.coerce.date({
    error: "Priority start date is required and must be a valid date",
  }).optional(),
  generalStartDate: z.coerce.date({
    error: "General start date is required and must be a valid date",
  }).optional(),
  type: eventTypeEnum.optional(),
  maxCapacity: z
    .number()
    .int("Capacity must be an integer")
    .positive("Capacity must be a positive number")
    .optional(),
});

// Schema for logistics admin review actions on manual-review registrations.
export const reviewRegistrationSchema = z.object({
  action: z.enum(["approve", "reject"], {
    error: "Action must be either approve or reject",
  }),
});

export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type UpdateEventSchema = z.infer<typeof updateEventSchema>;
export type ReviewRegistrationSchema = z.infer<typeof reviewRegistrationSchema>;
export type EventTypeEnum = z.infer<typeof eventTypeEnum>;
export type RegistrationStatusEnum = z.infer<typeof registrationStatusEnum>;