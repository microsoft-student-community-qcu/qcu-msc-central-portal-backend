import { z } from "zod";

// Zod enum for SponsorshipStatus values.
// Mirrors Prisma SponsorshipStatus exactly.
export const sponsorshipStatusEnum = z.enum(["NEW", "CONTACTED", "CLOSED"], {
  error: "Sponsorship status must be NEW, CONTACTED, or CLOSED",
});

// Schema for creating a new sponsorship inquiry.
// Public-facing — submitted by Guest (External) users per PRD-V1 via the
// landing page's "Collaborate With Us" CTA. No auth required.
export const createSponsorshipInquirySchema = z.object({
  email: z.string().email("Invalid email address format"),
  contactName: z
    .string()
    .min(1, "Contact name is required")
    .max(100, "Contact name must be less than 100 characters"),
  contactPhone: z
    .string()
    .min(1, "Contact phone cannot be empty")
    .max(30, "Contact phone must be less than 30 characters")
    .optional(),
  company: z
    .string()
    .min(1, "Company name is required")
    .max(200, "Company name must be less than 200 characters"),
  message: z.string().min(10, "Message must be at least 10 characters long"),
});

// Schema for Relations Office updating an inquiry's follow-up status.
export const updateSponsorshipStatusSchema = z.object({
  status: sponsorshipStatusEnum,
});

export type CreateSponsorshipInquirySchema = z.infer<typeof createSponsorshipInquirySchema>;
export type UpdateSponsorshipStatusSchema = z.infer<typeof updateSponsorshipStatusSchema>;
export type SponsorshipStatusEnum = z.infer<typeof sponsorshipStatusEnum>;