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
// Does not allow status or userId to be set by applicants — both are
// controlled server-side (status defaults to APPLIED, userId is only
// set once HR accepts the applicant and links them to a Member account).
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