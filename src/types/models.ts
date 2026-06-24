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
 */
export type UserRole = "ADMIN" | "MEMBER" | "STUDENT";

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
  studentId: string;
  emailVerified: boolean;
  image: string | null;
  /** Strict role — never a raw string. */
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrowed Admin type — a User whose role is strictly 'ADMIN'.
 * Use this type in admin-only controllers and middleware guards.
 */
export interface Admin extends Omit<User, "role"> {
  role: "ADMIN";
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
 * Domain model for a student's event registration ticket.
 * Supports both authenticated Members and unauthenticated Students.
 */
export interface Registration {
  id: string;
  eventId: string;
  /** Null for non-member walk-in registrations. */
  userId: string | null;
  /** Stored for non-member registrations that have no User record. */
  email: string;
  name: string;
  /** Unique UUID payload embedded in the generated QR code. */
  qrPayload: string;
  hasAttended: boolean;
  createdAt: Date;
}
