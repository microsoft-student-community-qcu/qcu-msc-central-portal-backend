import { z } from "zod";

// Zod enum for EventType values.
// Mirrors Prisma EventType exactly.
export const eventTypeEnum = z.enum(
  ["PUBLIC", "QCU_STUDENTS_ONLY", "MEMBERS_ONLY"],
  { message: "Event type must be PUBLIC, QCU_STUDENTS_ONLY, or MEMBERS_ONLY" }
);

// Zod enum for RegistrationStatus values.
// Mirrors Prisma RegistrationStatus exactly.
export const registrationStatusEnum = z.enum(
  ["APPROVED", "PENDING_REVIEW", "REJECTED", "CANCELLED"],
  { message: "Status must be APPROVED, PENDING_REVIEW, REJECTED, or CANCELLED" }
);

// Create/update event payloads may arrive as multipart/form-data (the banner
// image is uploaded alongside the text fields), so every non-string field is
// coerced rather than strictly typed.

// Accepts "true"/"false" strings from multipart bodies as well as real booleans.
const booleanFlag = (message: string) =>
  z
    .union([z.boolean(), z.enum(["true", "false"])], { message })
    .transform((value) => value === true || value === "true");

const venueField = z
  .string({ message: "Venue must be text" })
  .min(1, "Venue is required")
  .max(200, "Venue must be less than 200 characters");

// ── Shared field definitions ─────────────────────────────────────────────
const eventFields = {
  title: z
    .string({ message: "Event title is required" })
    .min(1, "Event title is required")
    .max(150, "Event title must be less than 150 characters"),
  description: z
    .string({ message: "Description must be text" })
    .max(1000, "Description must be less than 1000 characters")
    .optional()
    .nullable(),
  date: z.coerce.date({
    message: "Event date is required and must be a valid date",
  }),
  registrationDeadline: z.coerce.date({
    message: "Registration deadline is required and must be a valid date",
  }),
  type: eventTypeEnum,
  maxCapacity: z.coerce
    .number({ message: "Capacity must be a number" })
    .int("Capacity must be a whole number")
    .positive("Capacity must be greater than zero"),
};

// Schema for creating a new event.
// Restricted to ADMIN_LOGISTICS routes per PRD: only Admin (Logistics)
// can create event entries. `bannerImageUrl` is never accepted from the
// client — it is resolved server-side from the uploaded file.
export const createEventSchema = z
  .object({
    ...eventFields,
    venue: venueField,
    type: eventFields.type.optional().default("PUBLIC"),
    requiresQrTicket: booleanFlag(
      "Requires QR ticket must be true or false"
    ).optional(),
    isRegistrationOpen: booleanFlag(
      "Registration open must be true or false"
    ).optional(),
  })
  .refine((data) => data.registrationDeadline <= data.date, {
    message: "Registration deadline must be on or before the event date",
    path: ["registrationDeadline"],
  });

// Schema for updating an event's details.
// Defined separately (not via .partial() on createEventSchema) because
// Zod v4 does not allow .partial() on schemas containing .refine().
export const updateEventSchema = z.object({
  title: eventFields.title.optional(),
  description: eventFields.description,
  date: eventFields.date.optional(),
  venue: venueField.optional(),
  registrationDeadline: eventFields.registrationDeadline.optional(),
  type: eventTypeEnum.optional(),
  maxCapacity: eventFields.maxCapacity.optional(),
  requiresQrTicket: booleanFlag(
    "Requires QR ticket must be true or false"
  ).optional(),
  isRegistrationOpen: booleanFlag(
    "Registration open must be true or false"
  ).optional(),
});

// Schema for the manual registration open/close toggle — V2 Flow 6.
export const registrationToggleSchema = z.object({
  isRegistrationOpen: booleanFlag(
    "isRegistrationOpen is required and must be true or false"
  ),
});

// Schema for logistics admin review actions on manual-review registrations.
export const reviewRegistrationSchema = z.object({
  action: z.enum(["approve", "reject"], {
    message: "Action must be either approve or reject",
  }),
});

export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type UpdateEventSchema = z.infer<typeof updateEventSchema>;
export type RegistrationToggleSchema = z.infer<typeof registrationToggleSchema>;
export type ReviewRegistrationSchema = z.infer<typeof reviewRegistrationSchema>;
export type EventTypeEnum = z.infer<typeof eventTypeEnum>;
export type RegistrationStatusEnum = z.infer<typeof registrationStatusEnum>;
