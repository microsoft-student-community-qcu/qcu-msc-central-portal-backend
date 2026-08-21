/**
 * Shared merch helpers (V2 Module 04).
 *
 * Kept separate from the controllers so order-reference generation, the shop
 * toggle lookup, and small formatting helpers are reusable and independently
 * testable.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

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
