import { z } from "zod";

// Zod enum for ApplicantStatus values.
// Mirrors Prisma ApplicantStatus exactly.
export const applicantStatusEnum = z.enum(
  ["APPLIED", "INTERVIEWING", "ACCEPTED", "REJECTED"],
  {
    error: "Status must be APPLIED, INTERVIEWING, ACCEPTED, or REJECTED",
  }
);

/**
 * Schema for public applicant submissions.
 *
 * All fields are validated with explicit user-facing error messages suitable
 * for rendering directly in the frontend (no raw Zod internals).
 *
 * Does not allow status, userId, manual_application to be set by applicants —
 * all are controlled server-side (status defaults to APPLIED; manual_application
 * is derived from the ocrSessionId; userId is only set once HR accepts the
 * applicant and links them to a Member account).
 *
 * ocrSessionId is required — every submission must be preceded by a call to
 * POST /api/v1/ocr/verify.
 *
 * studentId is optional — only needed in the manual entry fallback when the
 * OCR session returned studentId: null with manualRequired: true.
 */
export const createApplicantSchema = z.object({
  name: z
    .string({ message: "Full name is required" })
    .min(1, "Full name cannot be empty")
    .max(100, "Full name must be under 100 characters"),

  email: z
    .string({ message: "Email address is required" })
    .email("Email address format is invalid (e.g., user@example.com)"),

  departmentChoice: z
    .string({ message: "Department choice is required" })
    .min(1, "Department choice cannot be empty")
    .max(100, "Department choice must be under 100 characters"),

  resumeLink: z
    .string({ message: "Resume link is required" })
    .url("Resume link must be a valid URL (e.g., https://drive.google.com/...)"),

  githubLink: z
    .string({ message: "GitHub link is required" })
    .url("GitHub link must be a valid URL (e.g., https://github.com/...)"),

  // QCU Student ID in YY-NNNN format — only needed when the OCR session
  // returned studentId: null with manualRequired: true (manual entry fallback).
  studentId: z
    .string({ message: "Student ID must be a text value" })
    .regex(
      /^\d{2}-\d{4}$/,
      "Student ID format must be YY-NNNN (e.g., 23-1234)"
    )
    .optional(),

  // OCR session token from POST /api/v1/ocr/verify.
  // Required — enforces the two-step verification flow.
  ocrSessionId: z
    .string({ message: "OCR session ID is required. Call POST /api/v1/ocr/verify first." })
    .uuid(
      "OCR session ID format is invalid. Provide a valid session ID from POST /api/v1/ocr/verify."
    ),
});

// Schema for HR-only applicant status updates.
// Restricted to ADMIN_HR routes per PRD-V1: only Admin (Management & Dev)
// can mutate application statuses.
export const updateApplicantStatusSchema = z.object({
  status: applicantStatusEnum,
});

export type CreateApplicantSchema = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantStatusSchema = z.infer<typeof updateApplicantStatusSchema>;
export type ApplicantStatusEnum = z.infer<typeof applicantStatusEnum>;