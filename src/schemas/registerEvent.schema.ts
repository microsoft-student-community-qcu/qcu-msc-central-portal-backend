import { z } from "zod";
import type { EventTypeEnum } from "./event.schema";

// ── Shared guest registration fields ─────────────────────────────────────
const baseFields = {
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
  course: z
    .string({ message: "Course must be text" })
    .min(1, "Course is required")
    .max(100, "Course must be less than 100 characters"),
  yearLevel: z
    .string({ message: "Year level must be text" })
    .min(1, "Year level is required")
    .max(50, "Year level must be less than 50 characters"),
};

const studentIdField = z
  .string({ message: "Student ID must be text" })
  .regex(/^\d{2}-\d{4}$/, "Student ID must follow the YY-NNNN format (e.g., 23-5678)");

const ocrSessionIdField = z
  .string({ message: "OCR session ID is required" })
  .uuid("OCR session ID format is invalid");

/**
 * QCU_STUDENTS_ONLY — guest path.
 *
 * A valid ocrSessionId is mandatory: OCR is the enrollment gate for this
 * tier. studentId is resolved server-side from the OCR session and is
 * therefore never accepted from the body.
 */
export const registerQcuStudentSchema = z.object({
  ...baseFields,
  ocrSessionId: ocrSessionIdField,
});

/**
 * PUBLIC — open to anyone (QCU students, alumni, external guests).
 *
 * No OCR and no authentication. studentId, course, and year level are all
 * optional since non-QCU registrants have none of them.
 */
export const registerPublicSchema = z.object({
  ...baseFields,
  course: baseFields.course.optional(),
  yearLevel: baseFields.yearLevel.optional(),
  studentId: studentIdField.optional(),
});

/**
 * Returns the guest-path registration schema matching the event's type.
 *
 * MEMBERS_ONLY has no guest path — non-members are rejected before
 * validation runs — so it falls back to the QCU student schema for safety.
 */
export function getRegisterEventSchema(eventType: EventTypeEnum) {
  return eventType === "PUBLIC" ? registerPublicSchema : registerQcuStudentSchema;
}

// Retained for backward compatibility with existing imports.
export const registerEventSchema = registerQcuStudentSchema;

export type RegisterEventSchema = z.infer<typeof registerQcuStudentSchema>;
export type RegisterPublicSchema = z.infer<typeof registerPublicSchema>;
