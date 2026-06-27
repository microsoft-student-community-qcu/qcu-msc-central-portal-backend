/**
 * @file models.ts
 * @description Strict domain-level TypeScript interfaces for the QCU MSC Central Portal.
 * These are intentionally decoupled from the ORM layer so that Prisma client
 * regeneration cycles never break the domain type contract.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Strict union of all user roles defined in the PRD.
 * Guest is a behavioral role (no User record) — not included here.
 */
export type UserRole = "APPLICANT" | "MEMBER" | "ADMIN_HR" | "ADMIN_LOGISTICS";

/**
 * Strict union of all applicant pipeline statuses.
 */
export type ApplicantStatus = "APPLIED" | "INTERVIEWING" | "ACCEPTED" | "REJECTED";

/**
 * Strict union of event visibility types.
 */
export type EventType = "PUBLIC" | "MEMBERS_ONLY";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/**
 * Domain model for an authenticated user.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  /** Strict role — never a raw string. */
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrowed Admin types — a User whose role is strictly one of the admin roles.
 * Use these types in admin-only controllers and middleware guards.
 */
export interface AdminHR extends Omit<User, "role"> {
  role: "ADMIN_HR";
}

export interface AdminLogistics extends Omit<User, "role"> {
  role: "ADMIN_LOGISTICS";
}

// ---------------------------------------------------------------------------
// Applicant
// ---------------------------------------------------------------------------

/**
 * Domain model for a prospective MSC member application.
 * Matches the Recruitment & Applicant Tracking module in the PRD.
 */
export interface Applicant {
  id: string;
  name: string;
  email: string;
  departmentChoice: string;
  resumeLink: string;
  githubLink: string;
  /** Strict pipeline status — never a raw string. */
  status: ApplicantStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/**
 * Domain model for an organizational event (workshop, seminar, initiative).
 * Matches the Event Registration & Ticketing module in the PRD.
 */
export interface Event {
  id: string;
  title: string;
  description: string | null;
  date: Date;
  /** Strict visibility type — never a raw string. */
  type: EventType;
  maxCapacity: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registration lifecycle status — mirrors Prisma RegistrationStatus.
 */
export type RegistrationStatus = "APPROVED" | "PENDING_REVIEW" | "REJECTED" | "CANCELLED";

/**
 * Domain model for a student's event registration ticket.
 * Supports both authenticated Members and unauthenticated Guests.
 */
export interface Registration {
  id: string;
  eventId: string;
  /** Null for guest registrations (no User record). */
  userId: string | null;
  /** QCU Student ID from Zonal OCR — used for guest registrations. */
  studentId: string | null;
  email: string;
  name: string;
  /** Registration lifecycle status. */
  status: RegistrationStatus;
  /** Flagged true when OCR fails and manual upload is used. */
  manualRegistration: boolean;
  /** Unique UUID payload embedded in the generated QR code. */
  qrPayload: string;
  hasAttended: boolean;
  createdAt: Date;
}
