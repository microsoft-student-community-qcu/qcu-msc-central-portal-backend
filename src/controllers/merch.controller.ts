/**
 * Public merch catalog (V2 Module 04 — Finance, Flow 2 browse).
 *
 * No authentication required. The entire catalog is gated behind the
 * `merch_shop_open` system toggle: when closed, browse endpoints return 503 so
 * the frontend can render a "shop closed" state. Only ACTIVE items are exposed;
 * ARCHIVED items remain in the database for order history but never appear here.
 */

import { Request, Response } from "express";
import { prisma } from "../config/database";
import {
  isMerchShopOpen,
  photosToArray,
  isLowStock,
  merchPhotoUrl,
  safeStorageFilename,
  CATALOG_PHOTO_PREFIX,
} from "../utils/merch";
import { getMerchImageStream } from "../utils/imageStorage";

// Shared presentation shape for a catalog item (public-safe fields only).
function serializeItem(item: {
  id: string;
  name: string;
  description: string;
  price: unknown;
  photos: unknown;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
  variants: { id: string; label: string; stock: number }[];
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    // Prisma Decimal → number for JSON; PHP merch prices are well within range.
    price: Number(item.price),
    photos: photosToArray(item.photos as never).map(merchPhotoUrl),
    lowStockThreshold: item.lowStockThreshold,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    variants: item.variants.map((v) => ({
      id: v.id,
      label: v.label,
      stock: v.stock,
      inStock: v.stock > 0,
      lowStock: v.stock > 0 && isLowStock(v.stock, item.lowStockThreshold),
    })),
  };
}

const ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  photos: true,
  lowStockThreshold: true,
  createdAt: true,
  updatedAt: true,
  variants: {
    select: { id: true, label: true, stock: true },
    orderBy: { label: "asc" as const },
  },
} as const;

/** GET /api/v2/merch — public catalog of ACTIVE items. */
export async function getCatalog(_req: Request, res: Response): Promise<void> {
  try {
    if (!(await isMerchShopOpen())) {
      res.status(503).json({ success: false, message: "The merch shop is currently closed." });
      return;
    }

    const items = await prisma.merchItem.findMany({
      where: { status: "ACTIVE" },
      select: ITEM_SELECT,
      orderBy: [{ createdAt: "desc" }],
    });

    res.status(200).json({ success: true, data: { items: items.map(serializeItem) } });
  } catch (error) {
    console.error("Failed to fetch merch catalog:", error);
    res.status(500).json({ success: false, message: "Internal server error while fetching the catalog" });
  }
}

/** GET /api/v2/merch/:itemId — public detail for a single ACTIVE item. */
export async function getCatalogItem(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isMerchShopOpen())) {
      res.status(503).json({ success: false, message: "The merch shop is currently closed." });
      return;
    }

    const { itemId } = req.params;
    const item = await prisma.merchItem.findUnique({
      where: { id: itemId },
      select: { ...ITEM_SELECT, status: true },
    });

    // ARCHIVED items are hidden from the public catalog even by direct ID.
    if (!item || item.status !== "ACTIVE") {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }

    res.status(200).json({ success: true, data: { item: serializeItem(item) } });
  } catch (error) {
    console.error("Failed to fetch merch item:", error);
    res.status(500).json({ success: false, message: "Internal server error while fetching the item" });
  }
}

/**
 * GET /api/v2/merch/photos/:filename — public proxy for catalog photos.
 *
 * Catalog photos live in the private `merch` blob container (shared with
 * payment screenshots), so their blob URLs 403 for anonymous browsers. This
 * unauthenticated proxy streams them with long cache headers. It is restricted
 * to the `item-` filename prefix so it can NEVER serve a `proof-` payment
 * screenshot, even if the filename were known.
 */
export async function getCatalogPhoto(req: Request, res: Response): Promise<void> {
  try {
    // Two-step so the error tells the caller WHICH rule failed: first validate
    // the filename is safe (no traversal/illegal chars), then that it is a
    // catalog photo. A payment screenshot (proof-*) is a valid filename but the
    // wrong class here — say so explicitly instead of a vague "invalid".
    const base = safeStorageFilename(req.params.filename);
    if (!base) {
      res.status(400).json({ success: false, message: "Invalid photo filename" });
      return;
    }
    if (!base.startsWith(CATALOG_PHOTO_PREFIX)) {
      res.status(400).json({ success: false, message: "This file is not a catalog photo." });
      return;
    }
    const safe = base;
    const { stream, contentType, contentLength } = await getMerchImageStream(safe);
    if (!stream) {
      res.status(404).json({ success: false, message: "Photo not found" });
      return;
    }
    res.setHeader("Content-Type", contentType || "image/jpeg");
    // Catalog photos are immutable (filename is UUID-based) — cache aggressively.
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    stream.pipe(res);
  } catch (error) {
    console.error("Failed to serve merch photo:", error);
    res.status(404).json({ success: false, message: "Photo not found or inaccessible" });
  }
}
