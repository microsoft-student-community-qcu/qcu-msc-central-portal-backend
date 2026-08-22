/**
 * Shared merch helpers (V2 Module 04).
 *
 * Kept separate from the controllers so order-reference generation, the shop
 * toggle lookup, and small formatting helpers are reusable and independently
 * testable.
 */

import type { Prisma, MerchRejectionReason } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "../config/database";
import { env } from "../config/env";

/** SystemSetting key that gates the entire merch shop (Module 01 whitelist). */
export const MERCH_SHOP_SETTING_KEY = "merch_shop_open";

/**
 * Whether the merch shop is currently open. Defaults to CLOSED when the toggle
 * row is absent (matches the `merch_shop_open` default of false).
 */
export async function isMerchShopOpen(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: MERCH_SHOP_SETTING_KEY },
    select: { value: true },
  });
  return setting?.value === true;
}

/**
 * Generate the next human-facing order reference for the current year:
 * `MSC-MERCH-YYYY-NNNN` (sequence zero-padded to 4 digits, continues past 9999).
 * Derived from the count of orders created this calendar year. The unique
 * constraint on `orderRef` plus a retry in the caller guards the rare race.
 */
export async function generateOrderRef(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const countThisYear = await prisma.merchOrder.count({
    where: { createdAt: { gte: yearStart, lt: yearEnd } },
  });

  const sequence = String(countThisYear + 1).padStart(4, "0");
  return `MSC-MERCH-${year}-${sequence}`;
}

/** Parse the JSON `photos` column into a string[] defensively. */
export function photosToArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

/** True when a variant's stock is at or below the item's low-stock threshold. */
export function isLowStock(stock: number, threshold: number): boolean {
  return stock <= threshold;
}

/** GCash reference numbers are 13 digits — used by the duplicate-check flow. */
export const GCASH_REFERENCE_REGEX = /^\d{13}$/;

/** Map a detected image MIME type to a file extension for stored uploads. */
export function imageExtensionFor(mimetype: string): string {
  switch (mimetype) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

// Rejection reasons a student can resolve by resubmitting a correct payment
// proof. OUT_OF_STOCK is deliberately excluded — no resubmission creates
// inventory, so those orders route to AWAITING_RESOLUTION instead (issue #178).
// DUPLICATE_REFERENCE stays resubmittable: an honest typo can collide with a
// real reference, and the duplicate check simply re-runs on resubmit.
const RESUBMITTABLE_REJECTIONS: readonly MerchRejectionReason[] = [
  "REFERENCE_NOT_FOUND",
  "AMOUNT_MISMATCH",
  "SCREENSHOT_UNCLEAR",
  "DUPLICATE_REFERENCE",
  "OTHER",
];

/** Whether a REJECTED order with this reason may accept a new payment proof. */
export function isResubmittableRejection(reason: MerchRejectionReason | null): boolean {
  return reason !== null && RESUBMITTABLE_REJECTIONS.includes(reason);
}

// ── Stored-file helpers ─────────────────────────────────────────────────────
// The `merch` blob container holds catalog photos (`item-*`), payment
// screenshots (`proof-*`), and QR images. Filenames are always
// `<prefix>-<uuid>.<ext>`. The prefix lets each proxy serve ONLY its own class
// of file so the PUBLIC catalog-photo proxy can never stream a private
// payment screenshot.

export const CATALOG_PHOTO_PREFIX = "item-";
export const SCREENSHOT_PREFIX = "proof-";

// Only these characters are allowed — no path separators or traversal, so a
// crafted :filename can't escape the storage directory (local-fallback path).
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

/**
 * Validate a request-supplied storage filename. Returns the safe basename, or
 * null if it contains traversal / illegal characters or (when `requirePrefix`
 * is given) does not belong to the expected file class.
 */
export function safeStorageFilename(raw: string, requirePrefix?: string): string | null {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw);
  if (base !== raw || !SAFE_FILENAME.test(base)) return null;
  if (requirePrefix && !base.startsWith(requirePrefix)) return null;
  return base;
}

/**
 * Build the public proxy URL for a stored catalog-photo filename. Values that
 * are already absolute URLs (legacy rows stored the full blob URL) pass through
 * unchanged. Uses BETTER_AUTH_URL as the backend's own public base.
 */
export function merchPhotoUrl(filenameOrUrl: string): string {
  if (/^https?:\/\//i.test(filenameOrUrl)) return filenameOrUrl;
  return `${env.BETTER_AUTH_URL}/api/v2/merch/photos/${encodeURIComponent(filenameOrUrl)}`;
}

/**
 * Record the outcome of a status-email attempt on the order (Module 04 §7b).
 * `lastNotifiedAt` is stamped for every attempt (so Finance sees when we last
 * tried); `notificationCount` only increments on a genuine success. Best-effort
 * — a tracking-write failure must never break the mutation that triggered it.
 */
export async function recordOrderNotification(orderId: string, ok: boolean): Promise<void> {
  try {
    await prisma.merchOrder.update({
      where: { id: orderId },
      data: {
        lastNotifiedAt: new Date(),
        lastNotificationOk: ok,
        ...(ok ? { notificationCount: { increment: 1 } } : {}),
      },
    });
  } catch (err) {
    console.error(`[MERCH] Failed to record notification state for order ${orderId}:`, err);
  }
}

// ── Resolution tokens (Module 04 §8d) ───────────────────────────────────────
// Unguessable single-use link that lets an oversold student self-serve a swap
// or refund. Only the SHA-256 hash is stored (password-reset precedent).

/** How long a resolution link stays valid. Expiry is never terminal — Finance can regenerate. */
export const RESOLUTION_TOKEN_TTL_DAYS = 14;
const RESOLUTION_TOKEN_TTL_MS = RESOLUTION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/** SHA-256 the raw token before any DB read/write so a leaked row can't be replayed. */
export function hashResolutionToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a fresh resolution token for an order and return the RAW token (only its
 * hash is stored). Deletes any prior unconsumed token for the order first, so a
 * regenerated link invalidates the old one.
 */
export async function mintResolutionToken(orderId: string, now: Date = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashResolutionToken(raw);
  const expiresAt = new Date(now.getTime() + RESOLUTION_TOKEN_TTL_MS);
  await prisma.merchOrderResolutionToken.deleteMany({ where: { orderId, consumedAt: null } });
  await prisma.merchOrderResolutionToken.create({ data: { orderId, tokenHash, expiresAt } });
  return raw;
}

/** Build the student-facing swap/refund links (frontend routes) for a raw token. */
export function resolutionUrls(rawToken: string): { swapUrl: string; refundUrl: string } {
  const base = `${env.FRONTEND_URL}/merch/resolve/${encodeURIComponent(rawToken)}`;
  return { swapUrl: `${base}?intent=swap`, refundUrl: `${base}?intent=refund` };
}
