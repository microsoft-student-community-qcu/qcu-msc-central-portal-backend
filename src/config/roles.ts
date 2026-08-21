/**
 * Single source of truth for role sets and role inheritance.
 *
 * V1 (PRD-V1): APPLICANT, MEMBER, ADMIN_HR, ADMIN_LOGISTICS.
 * V2 (PRD-V2): adds SUPERADMIN, ADMIN_FINANCE, ADMIN_FINANCE_HEAD,
 * ADMIN_LOGISTICS_HEAD, STARTUP_DEV. ADMIN_CORE was intentionally removed —
 * its permissions are folded into the heads and SUPERADMIN.
 *
 * Every role check in the codebase must reference these sets instead of
 * hardcoding arrays, so V1 endpoints can never accidentally grant V2 roles
 * and portal boundaries stay consistent.
 */

export const SUPERADMIN = "SUPERADMIN" as const;

/** Roles that existed in V1 — the only roles V1 endpoints may assign. */
export const V1_ROLES = [
  "APPLICANT",
  "MEMBER",
  "ADMIN_HR",
  "ADMIN_LOGISTICS",
] as const;

/** Roles that may sign in through the Admin Portal. */
export const ADMIN_ROLES = [
  "ADMIN_HR",
  "ADMIN_LOGISTICS",
  "SUPERADMIN",
  "ADMIN_FINANCE",
  "ADMIN_FINANCE_HEAD",
  "ADMIN_LOGISTICS_HEAD",
] as const;

/** Every role that exists in the system. */
export const ALL_ROLES = [...V1_ROLES, "SUPERADMIN", "ADMIN_FINANCE", "ADMIN_FINANCE_HEAD", "ADMIN_LOGISTICS_HEAD", "STARTUP_DEV"] as const;

export type Role = (typeof ALL_ROLES)[number];

/** True when the given role is SUPERADMIN (used for role inheritance). */
export function isSuperadmin(role: unknown): boolean {
  return role === SUPERADMIN;
}
