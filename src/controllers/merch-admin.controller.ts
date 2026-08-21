/**
 * Finance admin — merch management (V2 Module 04 — Finance, Flows 1, 4, 5).
 *
 * Item CRUD + order verification. `requireAdminFinance` admits ADMIN_FINANCE,
 * ADMIN_FINANCE_HEAD, and SUPERADMIN; archive/cancel are head-only via
 * `requireAdminFinanceHead`. Every mutation is audit-logged with a MERCH_*
 * action. Stock is decremented atomically on confirm (never read-then-write).
 */

import { Request, Response } from "express";
import { Prisma, MerchItemStatus, MerchOrderStatus, MerchRejectionReason } from "@prisma/client";
import { prisma } from "../config/database";
import {
  createMerchItemSchema,
  updateMerchItemSchema,
  rejectOrderSchema,
  cancelOrderSchema,
} from "../schemas/merch.schema";
import { validateImageMimeType } from "../utils/fileValidation";
import { saveMerchImage, getMerchImageStream } from "../utils/imageStorage";
import { photosToArray, imageExtensionFor } from "../utils/merch";
import { recordAudit } from "../utils/audit";
import { clampPagination } from "../schemas/admin.schema";
import { randomUUID } from "node:crypto";
import {
  sendMerchOrderConfirmedEmail,
  sendMerchOrderRejectedEmail,
  sendMerchOrderClaimedEmail,
  sendMerchOrderCancelledEmail,
} from "../services/email.service";
import { env } from "../config/env";

const MAX_ORDER_PAGE_SIZE = 50;
const MAX_PHOTOS = 6;

// Human-readable rejection reason labels for the student-facing email.
// Typed by the Prisma enum so a new reason must be given a label here.
const REJECTION_REASON_LABELS: Record<MerchRejectionReason, string> = {
  REFERENCE_NOT_FOUND: "Reference number not found in GCash history",
  AMOUNT_MISMATCH: "Amount received does not match the order total",
  SCREENSHOT_UNCLEAR: "Screenshot is unclear or inconsistent with the reference number",
  DUPLICATE_REFERENCE: "The GCash reference number has already been used on another order",
  OUT_OF_STOCK: "The item is out of stock",
  OTHER: "Other",
};

function actorFrom(req: Request): string | null {
  return req.userId ?? null;
}
function ipFrom(req: Request): string | null {
  return typeof req.ip === "string" ? req.ip : null;
}
function trackingUrl(orderRef: string): string {
  return `${env.FRONTEND_URL}/merch/orders/${encodeURIComponent(orderRef)}`;
}

// Narrow an arbitrary query string to a known enum value (or null). The cast is
// guarded by a runtime membership check against the actual Prisma enum, so it
// is provably safe and keeps the valid-status list single-sourced from Prisma.
function toItemStatus(value: string): MerchItemStatus | null {
  return (Object.values(MerchItemStatus) as string[]).includes(value) ? (value as MerchItemStatus) : null;
}
function toOrderStatus(value: string): MerchOrderStatus | null {
  return (Object.values(MerchOrderStatus) as string[]).includes(value) ? (value as MerchOrderStatus) : null;
}

// Exact shape returned by the admin item queries (always includes variants).
// Derived from the Prisma payload so it stays in sync with the schema.
type AdminMerchItem = Prisma.MerchItemGetPayload<{ include: { variants: true } }>;

function serializeAdminItem(item: AdminMerchItem) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    status: item.status,
    photos: photosToArray(item.photos),
    lowStockThreshold: item.lowStockThreshold,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    variants: item.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock })),
  };
}

// ── Item management (Flow 1) ────────────────────────────────────────────────

/** GET /api/v2/admin/merch/items — full catalog incl. ARCHIVED, live stock. */
export async function listItemsAdmin(req: Request, res: Response): Promise<void> {
  try {
    const statusFilter = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const status = toItemStatus(statusFilter);
    const where: Prisma.MerchItemWhereInput = status ? { status } : {};

    const items = await prisma.merchItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { variants: { orderBy: { label: "asc" } } },
    });

    res.status(200).json({ success: true, data: { items: items.map(serializeAdminItem) } });
  } catch (error) {
    console.error("Failed to list merch items:", error);
    res.status(500).json({ success: false, message: "Internal server error while listing items" });
  }
}

/** POST /api/v2/admin/merch/items — create a catalog item (multipart photos). */
export async function createItem(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const photos = files?.photos ?? [];

    const parsed = createMerchItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    if (photos.length === 0) {
      res.status(400).json({ success: false, message: "At least one product photo is required." });
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      res.status(400).json({ success: false, message: `You can upload at most ${MAX_PHOTOS} photos.` });
      return;
    }

    // Validate every photo by magic bytes before uploading any.
    for (const photo of photos) {
      const check = await validateImageMimeType(photo.buffer, "Product photo");
      if (!check.valid) {
        res.status(400).json({ success: false, message: check.message });
        return;
      }
    }

    const { name, description, price, lowStockThreshold, variants } = parsed.data;

    // Upload photos → collect public Blob URLs (catalog is public).
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const filename = `item-${randomUUID()}.${imageExtensionFor(photo.mimetype)}`;
      photoUrls.push(await saveMerchImage(photo.buffer, filename, photo.mimetype));
    }

    const item = await prisma.merchItem.create({
      data: {
        name,
        description,
        price: new Prisma.Decimal(price),
        lowStockThreshold,
        photos: photoUrls,
        variants: { create: variants.map((v) => ({ label: v.label, stock: v.stock })) },
      },
      include: { variants: { orderBy: { label: "asc" } } },
    });

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ITEM_CREATED",
      entityType: "MERCH_ITEM",
      entityId: item.id,
      details: { name: item.name, variants: variants.length },
      ipAddress: ipFrom(req),
    });

    res.status(201).json({ success: true, data: { item: serializeAdminItem(item) }, message: "Item created" });
  } catch (error) {
    console.error("Failed to create merch item:", error);
    res.status(500).json({ success: false, message: "Internal server error while creating the item" });
  }
}

/** PATCH /api/v2/admin/merch/items/:itemId — edit fields, photos, variant stock. */
export async function updateItem(req: Request, res: Response): Promise<void> {
  try {
    const { itemId } = req.params;
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const photos = files?.photos ?? [];

    const parsed = updateMerchItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.merchItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }

    const { name, description, price, lowStockThreshold, variants } = parsed.data;

    const data: Prisma.MerchItemUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = new Prisma.Decimal(price);
    if (lowStockThreshold !== undefined) data.lowStockThreshold = lowStockThreshold;

    // Replace the photo set only when new photos are uploaded.
    if (photos.length > 0) {
      if (photos.length > MAX_PHOTOS) {
        res.status(400).json({ success: false, message: `You can upload at most ${MAX_PHOTOS} photos.` });
        return;
      }
      for (const photo of photos) {
        const check = await validateImageMimeType(photo.buffer, "Product photo");
        if (!check.valid) {
          res.status(400).json({ success: false, message: check.message });
          return;
        }
      }
      const photoUrls: string[] = [];
      for (const photo of photos) {
        const filename = `item-${randomUUID()}.${imageExtensionFor(photo.mimetype)}`;
        photoUrls.push(await saveMerchImage(photo.buffer, filename, photo.mimetype));
      }
      data.photos = photoUrls;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.merchItem.update({ where: { id: itemId }, data });
      }
      // Upsert variants by (itemId,label): update stock for existing labels,
      // create new ones. Deletion is intentionally unsupported — orders pin
      // variants (archive the item instead).
      if (variants) {
        for (const v of variants) {
          await tx.merchVariant.upsert({
            where: { itemId_label: { itemId, label: v.label } },
            update: { stock: v.stock },
            create: { itemId, label: v.label, stock: v.stock },
          });
        }
      }
    });

    const item = await prisma.merchItem.findUnique({
      where: { id: itemId },
      include: { variants: { orderBy: { label: "asc" } } },
    });
    // The row was verified above and updated in a transaction, so a missing
    // record here is an unexpected internal fault rather than a client error.
    if (!item) {
      res.status(500).json({ success: false, message: "Internal server error while updating the item" });
      return;
    }

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ITEM_EDITED",
      entityType: "MERCH_ITEM",
      entityId: itemId,
      details: { fields: Object.keys(data), variantsTouched: variants?.length ?? 0 },
      ipAddress: ipFrom(req),
    });

    res.status(200).json({ success: true, data: { item: serializeAdminItem(item) }, message: "Item updated" });
  } catch (error) {
    console.error("Failed to update merch item:", error);
    res.status(500).json({ success: false, message: "Internal server error while updating the item" });
  }
}

/** POST /api/v2/admin/merch/items/:itemId/archive — head-only soft delete. */
export async function archiveItem(req: Request, res: Response): Promise<void> {
  try {
    const { itemId } = req.params;
    const existing = await prisma.merchItem.findUnique({ where: { id: itemId }, select: { status: true } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }
    if (existing.status === "ARCHIVED") {
      res.status(409).json({ success: false, message: "Item is already archived." });
      return;
    }

    await prisma.merchItem.update({ where: { id: itemId }, data: { status: "ARCHIVED" } });

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ITEM_ARCHIVED",
      entityType: "MERCH_ITEM",
      entityId: itemId,
      ipAddress: ipFrom(req),
    });

    res.status(200).json({ success: true, message: "Item archived" });
  } catch (error) {
    console.error("Failed to archive merch item:", error);
    res.status(500).json({ success: false, message: "Internal server error while archiving the item" });
  }
}

// ── Order verification (Flows 4–5) ──────────────────────────────────────────

/** GET /api/v2/admin/merch/orders — finance queue, filterable by status. */
export async function listOrders(req: Request, res: Response): Promise<void> {
  try {
    const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize, MAX_ORDER_PAGE_SIZE);
    const statusFilter = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const status = toOrderStatus(statusFilter);
    const where: Prisma.MerchOrderWhereInput = status ? { status } : {};

    const [total, orders] = await Promise.all([
      prisma.merchOrder.count({ where }),
      prisma.merchOrder.findMany({
        where,
        orderBy: [{ createdAt: "asc" }], // FCFS within the queue
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          variant: { select: { label: true, item: { select: { name: true } } } },
          proofSubmissions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
    ]);

    const data = orders.map((o) => ({
      id: o.id,
      orderRef: o.orderRef,
      studentName: o.studentName,
      studentId: o.studentId,
      email: o.email,
      gcashNumber: o.gcashNumber,
      itemName: o.variant.item.name,
      variantLabel: o.variant.label,
      quantity: o.quantity,
      amount: Number(o.amount),
      status: o.status,
      rejectionReason: o.rejectionReason,
      latestReferenceNumber: o.proofSubmissions[0]?.referenceNumber ?? null,
      latestScreenshot: o.proofSubmissions[0]?.screenshotPath ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        orders: data,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      },
    });
  } catch (error) {
    console.error("Failed to list merch orders:", error);
    res.status(500).json({ success: false, message: "Internal server error while listing orders" });
  }
}

/** POST /api/v2/admin/merch/orders/:orderId/confirm — verify payment (Flow 4). */
export async function confirmOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      include: { variant: { select: { id: true, label: true, item: { select: { name: true } } } } },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (order.status !== "PENDING_VERIFICATION") {
      res.status(409).json({ success: false, message: "Only orders pending verification can be confirmed." });
      return;
    }

    // Atomic conditional decrement — never read-then-write (PRD NFR concurrency).
    const confirmed = await prisma.$transaction(async (tx) => {
      const dec = await tx.merchVariant.updateMany({
        where: { id: order.variant.id, stock: { gte: order.quantity } },
        data: { stock: { decrement: order.quantity } },
      });
      if (dec.count === 0) return false; // Stock ran out since submission
      await tx.merchOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
      return true;
    });

    if (!confirmed) {
      // Last unit claimed by another confirmed order first (Flow 4 edge case).
      await prisma.merchOrder.update({
        where: { id: orderId },
        data: { status: "REJECTED", rejectionReason: "OUT_OF_STOCK" },
      });
      await recordAudit({
        actorId: actorFrom(req),
        action: "MERCH_ORDER_REJECTED",
        entityType: "MERCH_ORDER",
        entityId: orderId,
        details: { reason: "OUT_OF_STOCK", auto: true },
        ipAddress: ipFrom(req),
      });
      await sendMerchOrderRejectedEmail(order.email, {
        studentName: order.studentName,
        orderRef: order.orderRef,
        reasonLabel: REJECTION_REASON_LABELS.OUT_OF_STOCK,
        trackingUrl: trackingUrl(order.orderRef),
      });
      res.status(409).json({
        success: false,
        message: "Stock ran out before this order could be confirmed. The order was rejected and the student notified.",
      });
      return;
    }

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ORDER_CONFIRMED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { variant: order.variant.label, quantity: order.quantity },
      ipAddress: ipFrom(req),
    });

    await sendMerchOrderConfirmedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      itemName: order.variant.item.name,
      variantLabel: order.variant.label,
    });

    res.status(200).json({ success: true, message: "Payment confirmed. Stock updated and the student notified." });
  } catch (error) {
    console.error("Failed to confirm merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while confirming the order" });
  }
}

/** POST /api/v2/admin/merch/orders/:orderId/reject — reject with reason (Flow 4). */
export async function rejectOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const parsed = rejectOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, email: true, studentName: true, orderRef: true },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (order.status !== "PENDING_VERIFICATION") {
      res.status(409).json({ success: false, message: "Only orders pending verification can be rejected." });
      return;
    }

    const { reason, financeNote } = parsed.data;
    await prisma.merchOrder.update({
      where: { id: orderId },
      data: { status: "REJECTED", rejectionReason: reason, financeNote: financeNote ?? null },
    });

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ORDER_REJECTED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { reason },
      ipAddress: ipFrom(req),
    });

    await sendMerchOrderRejectedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      reasonLabel: REJECTION_REASON_LABELS[reason] ?? reason,
      trackingUrl: trackingUrl(order.orderRef),
    });

    res.status(200).json({ success: true, message: "Order rejected and the student notified." });
  } catch (error) {
    console.error("Failed to reject merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while rejecting the order" });
  }
}

/** POST /api/v2/admin/merch/orders/:orderId/claim — mark claimed at pickup (Flow 5). */
export async function claimOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      include: { variant: { select: { item: { select: { name: true } } } } },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (order.status !== "CONFIRMED") {
      res.status(409).json({ success: false, message: "Only confirmed orders can be marked as claimed." });
      return;
    }

    await prisma.merchOrder.update({ where: { id: orderId }, data: { status: "PAID_AND_CLAIMED" } });

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ORDER_CLAIMED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      ipAddress: ipFrom(req),
    });

    await sendMerchOrderClaimedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      itemName: order.variant.item.name,
    });

    res.status(200).json({ success: true, message: "Order marked as claimed. Receipt emailed to the student." });
  } catch (error) {
    console.error("Failed to claim merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while claiming the order" });
  }
}

/** POST /api/v2/admin/merch/orders/:orderId/cancel — head-only cancel (any live stage). */
export async function cancelOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const parsed = cancelOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, email: true, studentName: true, orderRef: true, quantity: true, variantId: true },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (order.status === "CANCELLED" || order.status === "PAID_AND_CLAIMED") {
      res.status(409).json({ success: false, message: "This order can no longer be cancelled." });
      return;
    }

    // If the order was CONFIRMED, its stock was already decremented — return it.
    await prisma.$transaction(async (tx) => {
      if (order.status === "CONFIRMED") {
        await tx.merchVariant.update({
          where: { id: order.variantId },
          data: { stock: { increment: order.quantity } },
        });
      }
      await tx.merchOrder.update({
        where: { id: orderId },
        data: { status: "CANCELLED", financeNote: parsed.data.financeNote },
      });
    });

    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ORDER_CANCELLED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { restoredStock: order.status === "CONFIRMED" },
      ipAddress: ipFrom(req),
    });

    await sendMerchOrderCancelledEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      note: parsed.data.financeNote,
    });

    res.status(200).json({ success: true, message: "Order cancelled and the student notified." });
  } catch (error) {
    console.error("Failed to cancel merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while cancelling the order" });
  }
}

// ── Protected screenshot proxy ──────────────────────────────────────────────

/** GET /api/v2/admin/merch/screenshots/:filename — finance-only proxy. */
export async function serveMerchScreenshot(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { stream, contentType, contentLength } = await getMerchImageStream(filename);
    if (!stream) {
      res.status(404).json({ success: false, message: "Screenshot not found" });
      return;
    }
    res.setHeader("Content-Type", contentType || "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    stream.pipe(res);
  } catch (error) {
    console.error("Failed to serve merch screenshot:", error);
    res.status(404).json({ success: false, message: "Screenshot not found or inaccessible" });
  }
}
