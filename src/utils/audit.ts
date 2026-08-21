/**
 * Tamper-evident audit logging (V2 Module 01 — Super Admin Settings Hub).
 *
 * Every row is chained to the previous row via an HMAC-SHA256 hash:
 *   hash = HMAC(prevHash | actorId | action | entityType | entityId |
 *               JSON(details) | createdAt, BETTER_AUTH_SECRET)
 *
 * A tamperer who edits an old row must recompute every subsequent hash with
 * the secret — impossible without it. `verifyAuditChain` recomputes the chain
 * on read and reports the first break index so the viewer can flag tampering.
 *
 * The table is append-only: no update/delete paths exist anywhere in the app.
 * `details` must never contain secrets (passwords, tokens).
 */

import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { env } from "../config/env";

export type AuditAction =
  | "ROLE_CHANGE"
  | "SETTING_UPDATE"
  | "SYSTEM_MAINTENANCE"
  // Module 04 — Merch Pre-Orders (Finance)
  | "MERCH_ITEM_CREATED"
  | "MERCH_ITEM_EDITED"
  | "MERCH_ITEM_ARCHIVED"
  | "MERCH_ORDER_CONFIRMED"
  | "MERCH_ORDER_REJECTED"
  | "MERCH_ORDER_CLAIMED"
  | "MERCH_ORDER_CANCELLED";

export interface RecordAuditInput {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Canonical string that the HMAC is computed over. */
function canonicalPayload(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> | null,
  createdAt: Date
): string {
  return [
    actorId ?? "",
    action,
    entityType,
    entityId ?? "",
    JSON.stringify(details ?? {}),
    createdAt.toISOString(),
  ].join("|");
}

/** HMAC-SHA256 hex digest keyed by the shared Better Auth secret. */
function hashRow(
  prevHash: string | null,
  payload: string
): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${prevHash ?? ""}|${payload}`)
    .digest("hex");
}

/**
 * Append one audit entry. Reads the latest row (by createdAt, id tie-break)
 * to chain hashes. Concurrent writes could theoretically fork the chain;
 * acceptable for the single-superadmin M0 surface.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const createdAt = new Date();
  const last = await prisma.auditLog.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });

  const payload = canonicalPayload(
    input.actorId,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.details ?? null,
    createdAt
  );

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ...(input.details ? { details: input.details as Prisma.InputJsonValue } : {}),
      ipAddress: input.ipAddress ?? null,
      prevHash: last?.hash ?? null,
      hash: hashRow(last?.hash ?? null, payload),
      createdAt,
    },
  });
}

export interface AuditChainResult {
  integrityOk: boolean;
  total: number;
  /** Index of the first row that breaks the chain; null when intact. */
  breakIndex: number | null;
}

/** Recompute the hash chain across all rows and report the first break. */
export async function verifyAuditChain(): Promise<AuditChainResult> {
  const rows = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let expectedPrevHash: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const payload = canonicalPayload(
      row.actorId,
      row.action,
      row.entityType,
      row.entityId,
      row.details as Record<string, unknown> | null,
      row.createdAt
    );
    const expectedHash = hashRow(expectedPrevHash, payload);
    if (row.hash !== expectedHash) {
      return { integrityOk: false, total: rows.length, breakIndex: i };
    }
    expectedPrevHash = row.hash;
  }

  return { integrityOk: true, total: rows.length, breakIndex: null };
}