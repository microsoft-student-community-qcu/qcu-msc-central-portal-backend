import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────

export const applicantStatusEnum = z.enum(
  ["APPLIED", "INTERVIEWING", "ACCEPTED", "REJECTED"],
  {
    error: "Status must be APPLIED, INTERVIEWING, ACCEPTED, or REJECTED",
  }
);

export const genderEnum = z.enum(
  ["MALE", "FEMALE", "LGBTQIA", "PREFER_NOT_TO_SAY"],
  {
    error: "Gender must be Male, Female, LGBTQIA+, or Prefer not to say",
  }
);

export const campusEnum = z.enum(
  ["SAN_BARTOLOME_MAIN", "SAN_FRANCISCO", "BATASAN"],
  {
    error: "Campus must be San Bartolome (Main), San Francisco, or Batasan",
  }
);

// ── Create Applicant Schema ──────────────────────────────────────────────

/**
 * Schema for public applicant submissions via multipart/form-data.
 *
 * All text fields are validated with user-facing error messages.
 * File uploads (certificateOfRegistration, curriculumVitae) are handled
 * by multer middleware separately — this schema only validates the body.
 *
 * ocrSessionId is required — every submission must be preceded by a call to
 * POST /api/v1/ocr/verify.
 *
 * studentId is optional — only needed in the manual entry fallback when the
 * OCR session returned studentId: null with manualRequired: true.
 */
export const createApplicantSchema = z.object({
  // ── Personal Information ────────────────────────────────────────────
  lastName: z
    .string({ message: "Last name is required" })
    .min(1, "Last name cannot be empty")
    .max(100, "Last name must be under 100 characters"),

  firstName: z
    .string({ message: "First name is required" })
    .min(1, "First name cannot be empty")
    .max(100, "First name must be under 100 characters"),

  middleInitial: z
    .string({ message: "Middle initial must be a text value" })
    .regex(
      /^[A-Za-z]\.?$/,
      "Middle initial must be a single letter, optionally followed by a dot (e.g., B or B.)"
    )
    .optional(),

  email: z
    .string({ message: "Email address is required" })
    .email("Email address format is invalid (e.g., user@example.com)"),

  college: z
    .string({ message: "College is required" })
    .min(1, "College cannot be empty")
    .max(200, "College must be under 200 characters"),

  program: z
    .string({ message: "Program is required" })
    .min(1, "Program cannot be empty")
    .max(200, "Program must be under 200 characters"),

  section: z
    .string({ message: "Section is required" })
    .min(1, "Section cannot be empty")
    .max(100, "Section must be under 100 characters"),

  campus: campusEnum,

  dateOfBirth: z
    .string({ message: "Date of birth is required" })
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Date of birth must be in YYYY-MM-DD format (e.g., 2000-01-15)"
    ),

  placeOfBirth: z
    .string({ message: "Place of birth is required" })
    .min(1, "Place of birth cannot be empty")
    .max(300, "Place of birth must be under 300 characters"),

  gender: genderEnum,

  membershipRole: z
    .string({ message: "Membership role/participation is required" })
    .min(1, "Membership role cannot be empty")
    .max(200, "Membership role must be under 200 characters"),

  // QCU Student ID in YY-NNNN format — only needed when the OCR session
  // returned studentId: null with manualRequired: true (manual entry fallback).
  studentId: z
    .string({ message: "Student ID must be a text value" })
    .regex(
      /^\d{2}-\d{4}$/,
      "Student ID format must be YY-NNNN (e.g., 23-1234)"
    )
    .optional(),

  // ── Contact Information ─────────────────────────────────────────────
  houseAddress: z
    .string({ message: "House address is required" })
    .min(1, "House address cannot be empty")
    .max(500, "House address must be under 500 characters"),

  cellphoneNumber: z
    .string({ message: "Cellphone number is required" })
    .regex(
      /^09\d{9}$/,
      "Cellphone number must be 11 digits starting with 09 (e.g., 09123456789)"
    ),

  qcuMscEmail: z
    .string({ message: "QCU MSC email address is required" })
    .email("QCU MSC email must be a valid email address")
    .regex(
      /@qcu\.edu\.ph$/i,
      "QCU MSC email must end with @qcu.edu.ph"
    ),

  facebookLink: z
    .string({ message: "Facebook link is required" })
    .url("Facebook link must be a valid URL (e.g., https://facebook.com/...)"),

  // ── Additional Information ──────────────────────────────────────────
  interestsSkillsHobbies: z
    .string({ message: "Interests, skills, and hobbies is required" })
    .min(1, "Interests, skills, and hobbies cannot be empty"),

  organizationHistory: z
    .string({ message: "Organization history is required" })
    .min(1, "Organization history cannot be empty"),

  // ── Supporting Requirements (Optional) ──────────────────────────────
  portfolio: z
    .string({ message: "Portfolio must be a text value" })
    .url("Portfolio must be a valid URL (e.g., https://...)")
    .optional(),

  githubOrProjectLinks: z
    .string({ message: "GitHub or project links must be a text value" })
    .url("GitHub or project links must be a valid URL (e.g., https://github.com/...)")
    .optional(),

  previousWorksAchievements: z
    .string({ message: "Previous works or achievements must be a text value" })
    .optional(),

  // Hidden fields — injected by the controller from req.files before validation.
  // Ensures file upload errors are batched with text field errors in one response.
  _certificateOfRegistration: z.literal("true", {
    message: "Certificate of Registration file is required",
  }),

  _curriculumVitae: z.literal("true", {
    message: "Curriculum Vitae file is required",
  }),

  // OCR session token from POST /api/v1/ocr/verify.
  // Required — enforces the two-step verification flow.
  ocrSessionId: z
    .string({ message: "OCR session ID is required. Call POST /api/v1/ocr/verify first." })
    .uuid(
      "OCR session ID format is invalid. Provide a valid session ID from POST /api/v1/ocr/verify."
    ),
});

// ── Update Applicant Schema (HR) ──────────────────────────────────────────

/**
 * Schema for ADMIN_HR to update applicant details.
 * All fields are optional on update.
 */
export const updateApplicantSchema = z.object({
  lastName: z
    .string({ message: "Last name must be a text value" })
    .min(1, "Last name cannot be empty")
    .max(100, "Last name must be under 100 characters")
    .optional(),

  firstName: z
    .string({ message: "First name must be a text value" })
    .min(1, "First name cannot be empty")
    .max(100, "First name must be under 100 characters")
    .optional(),

  middleInitial: z
    .string({ message: "Middle initial must be a text value" })
    .regex(
      /^[A-Za-z]\.?$/,
      "Middle initial must be a single letter, optionally followed by a dot (e.g., B or B.)"
    )
    .optional(),

  email: z
    .string({ message: "Email must be a text value" })
    .email("Email address format is invalid (e.g., user@example.com)")
    .optional(),

  college: z
    .string({ message: "College must be a text value" })
    .min(1, "College cannot be empty")
    .max(200, "College must be under 200 characters")
    .optional(),

  program: z
    .string({ message: "Program must be a text value" })
    .min(1, "Program cannot be empty")
    .max(200, "Program must be under 200 characters")
    .optional(),

  section: z
    .string({ message: "Section must be a text value" })
    .min(1, "Section cannot be empty")
    .max(100, "Section must be under 100 characters")
    .optional(),

  campus: campusEnum.optional(),

  dateOfBirth: z
    .string({ message: "Date of birth must be a text value" })
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Date of birth must be in YYYY-MM-DD format (e.g., 2000-01-15)"
    )
    .optional(),

  placeOfBirth: z
    .string({ message: "Place of birth must be a text value" })
    .min(1, "Place of birth cannot be empty")
    .max(300, "Place of birth must be under 300 characters")
    .optional(),

  gender: genderEnum.optional(),

  membershipRole: z
    .string({ message: "Membership role must be a text value" })
    .min(1, "Membership role cannot be empty")
    .max(200, "Membership role must be under 200 characters")
    .optional(),

  studentId: z
    .string({ message: "Student ID must be a text value" })
    .regex(
      /^\d{2}-\d{4}$/,
      "Student ID format must be YY-NNNN (e.g., 23-1234)"
    )
    .optional(),

  houseAddress: z
    .string({ message: "House address must be a text value" })
    .min(1, "House address cannot be empty")
    .max(500, "House address must be under 500 characters")
    .optional(),

  cellphoneNumber: z
    .string({ message: "Cellphone number must be a text value" })
    .regex(
      /^09\d{9}$/,
      "Cellphone number must be 11 digits starting with 09 (e.g., 09123456789)"
    )
    .optional(),

  qcuMscEmail: z
    .string({ message: "QCU MSC email must be a text value" })
    .email("QCU MSC email must be a valid email address")
    .regex(/@qcu\.edu\.ph$/i, "QCU MSC email must end with @qcu.edu.ph")
    .optional(),

  facebookLink: z
    .string({ message: "Facebook link must be a text value" })
    .url("Facebook link must be a valid URL (e.g., https://facebook.com/...)")
    .optional(),

  interestsSkillsHobbies: z
    .string({ message: "Interests, skills, and hobbies must be a text value" })
    .min(1, "Interests, skills, and hobbies cannot be empty")
    .optional(),

  organizationHistory: z
    .string({ message: "Organization history must be a text value" })
    .min(1, "Organization history cannot be empty")
    .optional(),

  portfolio: z
    .string({ message: "Portfolio must be a text value" })
    .url("Portfolio must be a valid URL (e.g., https://...)")
    .optional(),

  githubOrProjectLinks: z
    .string({ message: "GitHub or project links must be a text value" })
    .url("GitHub or project links must be a valid URL (e.g., https://github.com/...)")
    .optional(),

  previousWorksAchievements: z
    .string({ message: "Previous works or achievements must be a text value" })
    .optional(),
});

// ── Status Update Schema ─────────────────────────────────────────────────

export const updateApplicantStatusSchema = z.object({
  status: applicantStatusEnum,
});

// ── Exported Types ───────────────────────────────────────────────────────

export type CreateApplicantSchema = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantSchema = z.infer<typeof updateApplicantSchema>;
export type UpdateApplicantStatusSchema = z.infer<typeof updateApplicantStatusSchema>;
export type ApplicantStatusEnum = z.infer<typeof applicantStatusEnum>;
export type GenderEnum = z.infer<typeof genderEnum>;
export type CampusEnum = z.infer<typeof campusEnum>;