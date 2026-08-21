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
  refundOrderSchema,
} from "../schemas/merch.schema";
import { validateImageMimeType } from "../utils/fileValidation";
import { saveMerchImage, getMerchImageStream } from "../utils/imageStorage";
import { photosToArray, imageExtensionFor, recordOrderNotification, safeStorageFilename, SCREENSHOT_PREFIX, CATALOG_PHOTO_PREFIX, merchPhotoUrl } from "../utils/merch";
import { recordAudit } from "../utils/audit";
import { clampPagination } from "../schemas/admin.schema";
import { randomUUID } from "node:crypto";
import {
  sendMerchOrderConfirmedEmail,
  sendMerchOrderRejectedEmail,
  sendMerchOrderClaimedEmail,
  sendMerchOrderCancelledEmail,
  sendMerchOutOfStockEmail,
  sendMerchRefundProcessedEmail,
  sendMerchOrderCreatedEmail,
  sendMerchProofReceivedEmail,
} from "../services/email.service";
import { env } from "../config/env";

const MAX_ORDER_PAGE_SIZE = 50;

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
    photos: photosToArray(item.photos).map(merchPhotoUrl),
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
    // Note: multer's maxCount (6) already rejects the 7th+ file before we reach
    // here (mapped to a 400 by handleMulterError), so no photos.length > MAX
    // check is needed — it would be unreachable.

    // Validate every photo by magic bytes before uploading any.
    for (const photo of photos) {
      const check = await validateImageMimeType(photo.buffer, "Product photo");
      if (!check.valid) {
        res.status(400).json({ success: false, message: check.message });
        return;
      }
    }

    const { name, description, price, lowStockThreshold, variants } = parsed.data;

    // Upload photos → store the FILENAME (not the blob URL) so the public photo
    // proxy (GET /api/v2/merch/photos/:filename) serves them from the private
    // container. Serializers turn filenames back into absolute proxy URLs.
    const photoFilenames: string[] = [];
    for (const photo of photos) {
      const filename = `${CATALOG_PHOTO_PREFIX}${randomUUID()}.${imageExtensionFor(photo.mimetype)}`;
      await saveMerchImage(photo.buffer, filename, photo.mimetype);
      photoFilenames.push(filename);
    }

    const item = await prisma.merchItem.create({
      data: {
        name,
        description,
        price: new Prisma.Decimal(price),
        lowStockThreshold,
        photos: photoFilenames,
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

    // Replace the photo set only when new photos are uploaded. (multer's
    // maxCount already caps the count before we get here.)
    if (photos.length > 0) {
      for (const photo of photos) {
        const check = await validateImageMimeType(photo.buffer, "Product photo");
        if (!check.valid) {
          res.status(400).json({ success: false, message: check.message });
          return;
        }
      }
      const photoFilenames: string[] = [];
      for (const photo of photos) {
        const filename = `${CATALOG_PHOTO_PREFIX}${randomUUID()}.${imageExtensionFor(photo.mimetype)}`;
        await saveMerchImage(photo.buffer, filename, photo.mimetype);
        photoFilenames.push(filename);
      }
      data.photos = photoFilenames;
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
          _count: { select: { proofSubmissions: true } },
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
      attemptCount: o._count.proofSubmissions,
      // Notification tracking (§7b) — lets Finance spot orders whose last email
      // silently failed (lastNotificationOk === false) and when they last tried.
      lastNotifiedAt: o.lastNotifiedAt,
      lastNotificationOk: o.lastNotificationOk,
      notificationCount: o.notificationCount,
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
    const actorId = actorFrom(req);
    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      include: {
        variant: { select: { id: true, label: true, item: { select: { name: true } } } },
        proofSubmissions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    if (order.status !== "PENDING_VERIFICATION") {
      res.status(409).json({ success: false, message: "Only orders pending verification can be confirmed." });
      return;
    }

    const latestSubmissionId = order.proofSubmissions[0]?.id ?? null;

    // Atomic conditional decrement — never read-then-write (PRD NFR concurrency).
    const confirmed = await prisma.$transaction(async (tx) => {
      const dec = await tx.merchVariant.updateMany({
        where: { id: order.variant.id, stock: { gte: order.quantity } },
        data: { stock: { decrement: order.quantity } },
      });
      if (dec.count === 0) return false; // Stock ran out since submission
      await tx.merchOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
      // The payment on this attempt was valid — record the officer's decision.
      if (latestSubmissionId) {
        await tx.paymentProofSubmission.update({
          where: { id: latestSubmissionId },
          data: { officerDecision: "VERIFIED", reviewedById: actorId, reviewedAt: new Date() },
        });
      }
      return true;
    });

    if (!confirmed) {
      // Oversold: the student PAID but the last unit was confirmed for someone
      // else first. This is not a payment rejection — the payment was fine — so
      // the order moves to REFUND_PENDING (owes a refund/swap), never REJECTED,
      // and the student gets the out-of-stock email (no "resubmit" button).
      // See issue #178 for why oversell is structural under the no-reserve model.
      await prisma.$transaction(async (tx) => {
        await tx.merchOrder.update({
          where: { id: orderId },
          data: { status: "REFUND_PENDING", rejectionReason: "OUT_OF_STOCK" },
        });
        if (latestSubmissionId) {
          await tx.paymentProofSubmission.update({
            where: { id: latestSubmissionId },
            data: { officerDecision: "VERIFIED", reviewedById: actorId, reviewedAt: new Date() },
          });
        }
      });
      await recordAudit({
        actorId,
        action: "MERCH_ORDER_REFUND_PENDING",
        entityType: "MERCH_ORDER",
        entityId: orderId,
        details: { reason: "OUT_OF_STOCK", auto: true },
        ipAddress: ipFrom(req),
      });
      const emailed = await sendMerchOutOfStockEmail(order.email, {
        studentName: order.studentName,
        orderRef: order.orderRef,
        itemName: order.variant.item.name,
        variantLabel: order.variant.label,
      });
      await recordOrderNotification(orderId, emailed);
      res.status(409).json({
        success: false,
        message:
          "Stock ran out before this order could be confirmed. The order is now awaiting a refund and the student has been notified — process the refund from the order.",
      });
      return;
    }

    await recordAudit({
      actorId,
      action: "MERCH_ORDER_CONFIRMED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { variant: order.variant.label, quantity: order.quantity },
      ipAddress: ipFrom(req),
    });

    const emailed = await sendMerchOrderConfirmedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      itemName: order.variant.item.name,
      variantLabel: order.variant.label,
    });
    await recordOrderNotification(orderId, emailed);

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
      select: {
        id: true,
        status: true,
        email: true,
        studentName: true,
        orderRef: true,
        proofSubmissions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      },
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
    const actorId = actorFrom(req);
    const latestSubmissionId = order.proofSubmissions[0]?.id ?? null;

    // Record the decision on BOTH the submission (per-attempt history — a later
    // resubmission never erases why this attempt failed) and the order (latest
    // denormalised state that the tracking page and queue read).
    await prisma.$transaction(async (tx) => {
      await tx.merchOrder.update({
        where: { id: orderId },
        data: { status: "REJECTED", rejectionReason: reason, financeNote: financeNote ?? null },
      });
      if (latestSubmissionId) {
        await tx.paymentProofSubmission.update({
          where: { id: latestSubmissionId },
          data: {
            officerDecision: "REJECTED",
            rejectionReason: reason,
            financeNote: financeNote ?? null,
            reviewedById: actorId,
            reviewedAt: new Date(),
          },
        });
      }
    });

    await recordAudit({
      actorId,
      action: "MERCH_ORDER_REJECTED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { reason },
      ipAddress: ipFrom(req),
    });

    const emailed = await sendMerchOrderRejectedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      reasonLabel: REJECTION_REASON_LABELS[reason] ?? reason,
      trackingUrl: trackingUrl(order.orderRef),
    });
    await recordOrderNotification(orderId, emailed);

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

    const emailed = await sendMerchOrderClaimedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      itemName: order.variant.item.name,
    });
    await recordOrderNotification(orderId, emailed);

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
    // Terminal / refund-track states are not cancellable. Oversold orders
    // (REFUND_PENDING) and refunded orders are handled by the refund endpoint,
    // which keeps a dedicated MerchRefund record instead of a bare cancel.
    const uncancellable: MerchOrderStatus[] = ["CANCELLED", "PAID_AND_CLAIMED", "REFUND_PENDING", "REFUNDED"];
    if (uncancellable.includes(order.status)) {
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

    const emailed = await sendMerchOrderCancelledEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      note: parsed.data.financeNote,
    });
    await recordOrderNotification(orderId, emailed);

    res.status(200).json({ success: true, message: "Order cancelled and the student notified." });
  } catch (error) {
    console.error("Failed to cancel merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while cancelling the order" });
  }
}

// ── Order detail, refund & resend (§7a/§7b) ─────────────────────────────────

/**
 * GET /api/v2/admin/merch/orders/:orderId — full order with the payment-proof
 * attempt timeline (§7b #7) and refund record (§7a). Lets an officer see, e.g.
 * "attempt 2 — attempt 1 rejected AMOUNT_MISMATCH".
 */
export async function getOrderDetail(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      include: {
        variant: { select: { label: true, item: { select: { name: true } } } },
        proofSubmissions: { orderBy: { createdAt: "asc" } },
        refund: true,
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }

    const submissions = order.proofSubmissions.map((s, i) => ({
      attempt: i + 1,
      id: s.id,
      referenceNumber: s.referenceNumber,
      screenshot: s.screenshotPath,
      // `result` is the automated intake outcome; a DUPLICATE_REJECTED attempt
      // is terminal there and never reaches an officer (officerDecision stays
      // PENDING). Otherwise officerDecision reflects the human review.
      result: s.result,
      officerDecision: s.officerDecision,
      rejectionReason: s.rejectionReason,
      financeNote: s.financeNote,
      reviewedById: s.reviewedById,
      reviewedAt: s.reviewedAt,
      createdAt: s.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderRef: order.orderRef,
          studentName: order.studentName,
          studentId: order.studentId,
          email: order.email,
          gcashNumber: order.gcashNumber,
          itemName: order.variant.item.name,
          variantLabel: order.variant.label,
          quantity: order.quantity,
          amount: Number(order.amount),
          status: order.status,
          rejectionReason: order.rejectionReason,
          financeNote: order.financeNote,
          lastNotifiedAt: order.lastNotifiedAt,
          lastNotificationOk: order.lastNotificationOk,
          notificationCount: order.notificationCount,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          submissions,
          refund: order.refund
            ? {
                amount: Number(order.refund.amount),
                method: order.refund.method,
                referenceNumber: order.refund.referenceNumber,
                note: order.refund.note,
                processedById: order.refund.processedById,
                processedAt: order.refund.processedAt,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get merch order detail:", error);
    res.status(500).json({ success: false, message: "Internal server error while fetching the order" });
  }
}

/**
 * POST /api/v2/admin/merch/orders/:orderId/refund — head-only. Records a
 * dedicated MerchRefund for an oversold order (REFUND_PENDING → REFUNDED) so
 * the refund amount, method, and reference are transparently auditable (§7a).
 */
export async function refundOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const parsed = refundOrderSchema.safeParse(req.body);
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
      select: {
        id: true,
        status: true,
        email: true,
        studentName: true,
        orderRef: true,
        amount: true,
        refund: { select: { id: true } },
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }
    // Refunds are recorded for orders that owe money after payment — the
    // oversell REFUND_PENDING state. (Head cancellations note refunds offline.)
    if (order.status !== "REFUND_PENDING") {
      res.status(409).json({ success: false, message: "Only orders awaiting a refund can be refunded." });
      return;
    }
    if (order.refund) {
      res.status(409).json({ success: false, message: "A refund has already been recorded for this order." });
      return;
    }

    const { amount, method, referenceNumber, note } = parsed.data;
    const orderTotal = Number(order.amount);
    if (amount > orderTotal) {
      res.status(400).json({
        success: false,
        message: `Refund amount cannot exceed the order total of ₱${orderTotal.toFixed(2)}.`,
      });
      return;
    }

    const actorId = actorFrom(req);
    await prisma.$transaction(async (tx) => {
      await tx.merchRefund.create({
        data: {
          orderId,
          amount: new Prisma.Decimal(amount),
          method,
          referenceNumber: referenceNumber ?? null,
          note: note ?? null,
          processedById: actorId,
        },
      });
      await tx.merchOrder.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
    });

    await recordAudit({
      actorId,
      action: "MERCH_ORDER_REFUNDED",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { amount, method },
      ipAddress: ipFrom(req),
    });

    const emailed = await sendMerchRefundProcessedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
      amount,
      method,
      referenceNumber: referenceNumber ?? null,
      note: note ?? null,
    });
    await recordOrderNotification(orderId, emailed);

    res.status(200).json({ success: true, message: "Refund recorded and the student notified." });
  } catch (error) {
    console.error("Failed to refund merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while recording the refund" });
  }
}

/**
 * POST /api/v2/admin/merch/orders/:orderId/resend-email — resend the status
 * email for the order's current state (§5/§6). Fixes the "student never got
 * notified" gap: senders can silently fail, so Finance needs a manual retry.
 */
export async function resendOrderEmail(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const order = await prisma.merchOrder.findUnique({
      where: { id: orderId },
      include: {
        variant: { select: { label: true, item: { select: { name: true } } } },
        refund: true,
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }

    const common = { studentName: order.studentName, orderRef: order.orderRef };
    const itemName = order.variant.item.name;
    const variantLabel = order.variant.label;
    let emailed = false;

    switch (order.status) {
      case "AWAITING_PAYMENT": {
        if (!env.GCASH_NUMBER || !env.GCASH_QR_IMAGE_URL) {
          res.status(503).json({ success: false, message: "Payment details are not configured; cannot resend." });
          return;
        }
        emailed = await sendMerchOrderCreatedEmail(order.email, {
          ...common,
          itemName,
          variantLabel,
          quantity: order.quantity,
          amount: Number(order.amount),
          gcashNumber: env.GCASH_NUMBER,
          gcashQrImageUrl: env.GCASH_QR_IMAGE_URL,
          trackingUrl: trackingUrl(order.orderRef),
        });
        break;
      }
      case "PENDING_VERIFICATION":
        emailed = await sendMerchProofReceivedEmail(order.email, common);
        break;
      case "CONFIRMED":
        emailed = await sendMerchOrderConfirmedEmail(order.email, { ...common, itemName, variantLabel });
        break;
      case "REJECTED":
        emailed = await sendMerchOrderRejectedEmail(order.email, {
          ...common,
          reasonLabel: order.rejectionReason
            ? REJECTION_REASON_LABELS[order.rejectionReason] ?? order.rejectionReason
            : "Your payment could not be verified.",
          trackingUrl: trackingUrl(order.orderRef),
        });
        break;
      case "REFUND_PENDING":
        emailed = await sendMerchOutOfStockEmail(order.email, { ...common, itemName, variantLabel });
        break;
      case "REFUNDED":
        if (!order.refund) {
          res.status(409).json({ success: false, message: "No refund record exists for this order yet." });
          return;
        }
        emailed = await sendMerchRefundProcessedEmail(order.email, {
          ...common,
          amount: Number(order.refund.amount),
          method: order.refund.method,
          referenceNumber: order.refund.referenceNumber,
          note: order.refund.note,
        });
        break;
      case "PAID_AND_CLAIMED":
        emailed = await sendMerchOrderClaimedEmail(order.email, { ...common, itemName });
        break;
      case "CANCELLED":
        emailed = await sendMerchOrderCancelledEmail(order.email, {
          ...common,
          note: order.financeNote ?? "Your order was cancelled by the Finance team.",
        });
        break;
      default:
        res.status(409).json({ success: false, message: "No email is available for this order's status." });
        return;
    }

    await recordOrderNotification(orderId, emailed);
    await recordAudit({
      actorId: actorFrom(req),
      action: "MERCH_ORDER_EMAIL_RESENT",
      entityType: "MERCH_ORDER",
      entityId: orderId,
      details: { status: order.status, ok: emailed },
      ipAddress: ipFrom(req),
    });

    if (!emailed) {
      res.status(502).json({ success: false, message: "The email failed to send. Please try again shortly." });
      return;
    }
    res.status(200).json({ success: true, message: "Status email resent to the student." });
  } catch (error) {
    console.error("Failed to resend merch order email:", error);
    res.status(500).json({ success: false, message: "Internal server error while resending the email" });
  }
}

// ── Protected screenshot proxy ──────────────────────────────────────────────

/** GET /api/v2/admin/merch/screenshots/:filename — finance-only proxy. */
export async function serveMerchScreenshot(req: Request, res: Response): Promise<void> {
  try {
    const safe = safeStorageFilename(req.params.filename, SCREENSHOT_PREFIX);
    if (!safe) {
      res.status(400).json({ success: false, message: "Invalid screenshot filename" });
      return;
    }
    const { stream, contentType, contentLength } = await getMerchImageStream(safe);
    if (!stream) {
      res.status(404).json({ success: false, message: "Screenshot not found" });
      return;
    }
    res.setHeader("Content-Type", contentType || "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(safe)}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    stream.pipe(res);
  } catch (error) {
    console.error("Failed to serve merch screenshot:", error);
    res.status(404).json({ success: false, message: "Screenshot not found or inaccessible" });
  }
}
