import { prisma } from "../config/database";
import { env } from "../config/env";

/**
 * Find the most recently updated application draft for a student ID.
 * Returns null when no resumable draft exists.
 */
export async function findResumableDraft(studentId: string) {
  return prisma.applicationDraft.findFirst({
    where: { studentId },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Whether a draft has outlived its TTL and may be discarded lazily.
 * A stale draft no longer blocks a fresh application.
 */
export function isDraftStale(updatedAt: Date): boolean {
  const ttlMs = env.DRAFT_TTL_HOURS * 60 * 60 * 1000;
  return Date.now() - updatedAt.getTime() > ttlMs;
}
