import { z } from "zod";


// ── Reused Enums ──────────────────────────────────────────────────────────

export const officeEnum = z.enum(
  [
    "SECRETARIAT_OFFICE",
    "RELATIONS_OFFICE",
    "FINANCE_OFFICE",
    "LOGISTICS_OFFICE",
    "CREATIVES_OFFICE",
    "MANAGEMENT_AND_DEVELOPMENT_OFFICE",
    "STARTUP_DEVELOPERS_OFFICE",
  ],
  {
    error: "Office must be one of: Secretariat, Relations, Finance, Logistics, Creatives, Management & Development, or Startup Developers",
  }
);

// ── Create Draft Schema (Batch 0) ─────────────────────────────────────────

export const createDraftSchema = z.object({
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

  ocrSessionId: z
    .string({ message: "OCR session ID is required. Call POST /api/v1/ocr/verify first." })
    .uuid(
      "OCR session ID format is invalid. Provide a valid session ID from POST /api/v1/ocr/verify."
    ),
});

// ── Resume Draft Schema ────────────────────────────────────────────────────

export const resumeDraftSchema = z.object({
  token: z
    .string({ message: "Resume token is required" })
    .min(1, "Resume token cannot be empty"),
});

// ── Update Draft Batch 1 Schema ───────────────────────────────────────────

export const updateDraftBatch1Schema = z.object({
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

  gender: z.enum(
    ["MALE", "FEMALE", "LGBTQIA", "PREFER_NOT_TO_SAY"],
    {
      error: "Gender must be Male, Female, LGBTQIA+, or Prefer not to say",
    }
  ),

  cellphoneNumber: z
    .string({ message: "Cellphone number is required" })
    .regex(
      /^09\d{9}$/,
      "Cellphone number must be 11 digits starting with 09 (e.g., 09123456789)"
    ),

  houseAddress: z
    .string({ message: "House address is required" })
    .min(1, "House address cannot be empty")
    .max(500, "House address must be under 500 characters"),

  facebookLink: z
    .string({ message: "Facebook link is required" })
    .url("Facebook link must be a valid URL (e.g., https://facebook.com/...)"),
});

// ── Update Draft Batch 2 Schema ───────────────────────────────────────────

export const updateDraftBatch2Schema = z.object({
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

  campus: z.enum(
    ["SAN_BARTOLOME_MAIN", "SAN_FRANCISCO", "BATASAN"],
    {
      error: "Campus must be San Bartolome (Main), San Francisco, or Batasan",
    }
  ),

  office: officeEnum,

  // Hidden fields — injected by the controller from req.files before validation.
  _certificateOfRegistration: z.literal("true", {
    message: "Certificate of Registration file is required",
  }),

  _curriculumVitae: z.literal("true", {
    message: "Curriculum Vitae file is required",
  }),
});

// ── Submit Draft Schema (Batch 3) ─────────────────────────────────────────

export const submitDraftSchema = z.object({
  interestsSkillsHobbies: z
    .string({ message: "Interests, skills, and hobbies is required" })
    .min(1, "Interests, skills, and hobbies cannot be empty"),

  organizationHistory: z
    .string({ message: "Organization history is required" })
    .min(1, "Organization history cannot be empty"),

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
