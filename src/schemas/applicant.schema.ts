import { z } from "zod";

/**
 * Schema for validating new applicant registration submissions.
 * Validates name, email, department choices, and mandatory URL links.
 */
export const createApplicantSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .email("Invalid email address format"),
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

/**
 * Schema for updating an applicant's pipeline status.
 */
export const updateApplicantStatusSchema = z.object({
  status: z.enum(["APPLIED", "INTERVIEWING", "ACCEPTED", "REJECTED"], {
    errorMap: () => ({
      message: "Status must be APPLIED, INTERVIEWING, ACCEPTED, or REJECTED",
    }),
  }),
});

/**
 * Schema for updating applicant details.
 */
export const updateApplicantSchema = createApplicantSchema.partial();

export type CreateApplicantSchema = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantStatusSchema = z.infer<typeof updateApplicantStatusSchema>;
export type UpdateApplicantSchema = z.infer<typeof updateApplicantSchema>;
