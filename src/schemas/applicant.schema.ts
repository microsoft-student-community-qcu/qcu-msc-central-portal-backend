import { z } from "zod";

// Zod enum for ApplicantStatus values.
// Mirrors Prisma ApplicantStatus exactly.
export const applicantStatusEnum = z.enum(
  ["APPLIED", "INTERVIEWING", "ACCEPTED", "REJECTED"],
  {
    error: "Status must be APPLIED, INTERVIEWING, ACCEPTED, or REJECTED",
  }
);

// Schema for public applicant submissions.
// Does not allow status, userId, manual_application to be set by applicants — all are
// controlled server-side (status defaults to APPLIED; manual_application is derived
// from the ocrSessionId at submission time; userId is only set once HR accepts the
// applicant and links them to a Member account).
//
// ocrSessionId is optional — ties this submission to prior OCR verification.
// If provided, the backend looks up the session in ocrStore to determine
// manual_application and retrieve the extracted studentId + image path.
// If omitted, the backend treats the submission as a direct apply (no OCR).
export const createApplicantSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z.string().email("Invalid email address format"),
  departmentChoice: z
    .string()
    .min(1, "Department choice is required")
    .max(100, "Department choice must be less than 100 characters"),
  resumeLink: z
    .string()
    .url("Resume link must be a valid URL (e.g. https://drive.google.com/...)"),
  githubLink: z
    .string()
    .url("GitHub link must be a valid URL (e.g. https://github.com/...)"),
  // QCU Student ID in YY-NNNN format, extracted from Zonal OCR.
  // Required only when the applicant did NOT go through OCR (no ocrSessionId).
  studentId: z
    .string()
    .regex(/^\d{2}-\d{4}$/, "Student ID must be in format YY-NNNN (e.g., 23-1234)")
    .optional(),
  // OCR session token returned from POST /api/v1/ocr/verify.
  // When present, the backend validates the session and pulls the extracted
  // studentId + manual_application state instead of trusting the body fields.
  ocrSessionId: z.string().uuid("Invalid OCR session format").optional(),
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