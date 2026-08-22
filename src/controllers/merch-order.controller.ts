/**
 * Student merch order flow (V2 Module 04 — Finance, Flows 2–4 student side).
 *
 * All endpoints are public (no auth), but order tracking and payment-proof
 * submission require the caller to supply the order's email — this guards
 * against enumeration of orders by reference number alone. Stock is never
 * reserved here; it is only decremented when a finance officer confirms
 * payment (see merch-admin.controller.ts).
 */

import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { createOrderSchema, trackOrderQuerySchema, submitPaymentProofSchema } from "../schemas/merch.schema";
import { isMerchShopOpen, generateOrderRef, imageExtensionFor, isResubmittableRejection, recordOrderNotification } from "../utils/merch";
import { validateImageMimeType } from "../utils/fileValidation";
import { saveMerchImage } from "../utils/imageStorage";
import {
  sendMerchOrderCreatedEmail,
  sendMerchProofReceivedEmail,
  sendMerchDuplicateReferenceEmail,
} from "../services/email.service";

/** Build the student-facing tracking URL for an order. */
function trackingUrl(orderRef: string): string {
  return `${env.FRONTEND_URL}/merch/orders/${encodeURIComponent(orderRef)}`;
}

/** Public-safe serialization of an order for the tracking page. */
function serializeOrder(order: {
  orderRef: string;
  studentName: string;
  studentId: string | null;
  email: string;
  gcashNumber: string | null;
  quantity: number;
  amount: unknown;
  status: string;
  rejectionReason: string | null;
  financeNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  variant: { label: string; item: { name: string } };
}) {
  return {
    orderRef: order.orderRef,
    studentName: order.studentName,
    studentId: order.studentId,
    email: order.email,
    itemName: order.variant.item.name,
    variantLabel: order.variant.label,
    quantity: order.quantity,
    amount: Number(order.amount),
    status: order.status,
    rejectionReason: order.rejectionReason,
    // financeNote is only surfaced for the free-text OTHER rejection / cancellation.
    financeNote: order.financeNote,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * POST /api/v2/merch/orders — create a pre-order (Flow 2).
 * Real-time stock check, no reservation, generates orderRef, emails the
 * payment QR. Returns the payment-screen payload.
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isMerchShopOpen())) {
      res.status(503).json({ success: false, message: "The merch shop is currently closed." });
      return;
    }

    // The shop cannot take orders without the org GCash payment details.
    if (!env.GCASH_NUMBER || !env.GCASH_QR_IMAGE_URL) {
      res.status(503).json({
        success: false,
        message: "Online pre-orders are temporarily unavailable. Please try again later.",
      });
      return;
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { variantId, quantity, studentName, email, studentId, gcashNumber } = parsed.data;

    // Resolve the variant + parent item; the item must be ACTIVE.
    const variant = await prisma.merchVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        label: true,
        stock: true,
        item: { select: { id: true, name: true, price: true, status: true } },
      },
    });
    if (!variant || variant.item.status !== "ACTIVE") {
      res.status(404).json({ success: false, message: "The selected item or variant is unavailable." });
      return;
    }

    // Real-time stock check at submit time (PRD Flow 2 — even if it looked
    // available on page load). Other form data is preserved client-side.
    if (variant.stock < quantity) {
      res.status(409).json({
        success: false,
        message: "Sorry, the selected size is no longer available. Please choose a different size or check back later.",
      });
      return;
    }

    // amount snapshot = unit price × quantity (Decimal maths, not float).
    const amount = new Prisma.Decimal(variant.item.price as Prisma.Decimal).mul(quantity);
    const authedUserId = req.userId ?? null;

    // Create the order, retrying on the rare orderRef collision (unique index).
    let created: { id: string; orderRef: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const orderRef = await generateOrderRef();
      try {
        created = await prisma.merchOrder.create({
          data: {
            orderRef,
            userId: authedUserId,
            studentName,
            studentId: studentId ?? null,
            email,
            gcashNumber: gcashNumber ?? null,
            variantId: variant.id,
            quantity,
            amount,
            status: "AWAITING_PAYMENT", // Stock NOT reserved yet
          },
          select: { id: true, orderRef: true },
        });
      } catch (err) {
        // P2002 = unique constraint (orderRef race) → regenerate and retry.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }

    if (!created) {
      res.status(500).json({ success: false, message: "Could not create the order. Please try again." });
      return;
    }

    const numericAmount = Number(amount);

    // Fire-and-forget style email (the send helper logs and swallows failures
    // like the rest of the codebase, so a mail outage never blocks an order).
    const emailed = await sendMerchOrderCreatedEmail(email, {
      studentName,
      orderRef: created.orderRef,
      itemName: variant.item.name,
      variantLabel: variant.label,
      quantity,
      amount: numericAmount,
      gcashNumber: env.GCASH_NUMBER,
      gcashQrImageUrl: env.GCASH_QR_IMAGE_URL,
      trackingUrl: trackingUrl(created.orderRef),
    });
    await recordOrderNotification(created.id, emailed);

    res.status(201).json({
      success: true,
      data: {
        orderRef: created.orderRef,
        amount: numericAmount,
        gcashNumber: env.GCASH_NUMBER,
        gcashQrImageUrl: env.GCASH_QR_IMAGE_URL,
        trackingUrl: trackingUrl(created.orderRef),
        instructions: `Scan the GCash QR and pay exactly ₱${numericAmount.toFixed(2)}. After paying, return here and submit your 13-digit GCash reference number.`,
      },
      message: "Pre-order created. Please complete your GCash payment.",
    });
  } catch (error) {
    console.error("Failed to create merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while creating the order" });
  }
}

/**
 * GET /api/v2/merch/orders/:orderRef?email=... — order tracking (Flow 3+).
 * Requires the matching email; a mismatch returns 404 (not 403) so the
 * endpoint never confirms that an orderRef exists to a non-owner.
 */
export async function trackOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderRef } = req.params;
    const parsed = trackOrderQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const order = await prisma.merchOrder.findUnique({
      where: { orderRef },
      select: {
        orderRef: true,
        studentName: true,
        studentId: true,
        email: true,
        gcashNumber: true,
        quantity: true,
        amount: true,
        status: true,
        rejectionReason: true,
        financeNote: true,
        createdAt: true,
        updatedAt: true,
        variant: { select: { label: true, item: { select: { name: true } } } },
      },
    });

    // Anti-enumeration: unknown order or email mismatch both return 404.
    if (!order || order.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }

    res.status(200).json({ success: true, data: { order: serializeOrder(order) } });
  } catch (error) {
    console.error("Failed to track merch order:", error);
    res.status(500).json({ success: false, message: "Internal server error while fetching the order" });
  }
}

/**
 * POST /api/v2/merch/orders/:orderRef/payment-proof — submit screenshot +
 * reference number (Flow 3). Runs the instant cross-order duplicate check;
 * a duplicate auto-rejects with no officer review.
 */
export async function submitPaymentProof(req: Request, res: Response): Promise<void> {
  try {
    const { orderRef } = req.params;

    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    req.body._screenshot = files?.screenshot?.length ? "true" : undefined;

    const parsed = submitPaymentProofSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { email, referenceNumber } = parsed.data;

    if (!files?.screenshot?.length) {
      res.status(400).json({ success: false, message: "A payment screenshot is required." });
      return;
    }

    const order = await prisma.merchOrder.findUnique({
      where: { orderRef },
      select: { id: true, email: true, status: true, studentName: true, rejectionReason: true, shortfallAmount: true },
    });

    // Anti-enumeration: unknown order or email mismatch both return 404.
    if (!order || order.email.toLowerCase() !== email.toLowerCase()) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }

    // A paid order that's awaiting resolution / already refunded must never
    // accept another payment — that's the double-pay exploit (issue #178).
    if (order.status === "AWAITING_RESOLUTION" || order.status === "REFUNDED") {
      res.status(409).json({
        success: false,
        message:
          "This order is being resolved and can no longer accept payment. Our Finance team will contact you about your refund or a replacement.",
      });
      return;
    }

    // Resubmission is only allowed for a fresh order or a student-fixable
    // rejection (bad reference, amount mismatch, unclear screenshot, duplicate
    // typo, other). OUT_OF_STOCK is never resubmittable — see isResubmittableRejection.
    const canSubmit =
      order.status === "AWAITING_PAYMENT" ||
      (order.status === "REJECTED" && isResubmittableRejection(order.rejectionReason));
    if (!canSubmit) {
      res.status(409).json({
        success: false,
        message: "This order is not awaiting payment proof.",
      });
      return;
    }

    // Validate the screenshot by magic bytes (images only — never PDFs).
    const screenshot = files.screenshot[0];
    const imgCheck = await validateImageMimeType(screenshot.buffer, "Payment screenshot");
    if (!imgCheck.valid) {
      res.status(400).json({ success: false, message: imgCheck.message });
      return;
    }

    // Persist the screenshot to Blob (merch container).
    const ext = imageExtensionFor(screenshot.mimetype);
    const filename = `proof-${order.id}-${randomUUID()}.${ext}`;
    await saveMerchImage(screenshot.buffer, filename, screenshot.mimetype);

    // ── Instant duplicate-reference check across ALL other orders (Flow 3) ──
    const duplicate = await prisma.paymentProofSubmission.findFirst({
      where: { referenceNumber, order: { id: { not: order.id } } },
      select: { id: true },
    });

    if (duplicate) {
      // Auto-reject: record the attempt, flip the order, email the student.
      await prisma.$transaction([
        prisma.paymentProofSubmission.create({
          data: { orderId: order.id, screenshotPath: filename, referenceNumber, result: "DUPLICATE_REJECTED" },
        }),
        prisma.merchOrder.update({
          where: { id: order.id },
          data: { status: "REJECTED", rejectionReason: "DUPLICATE_REFERENCE" },
        }),
      ]);

      const dupEmailed = await sendMerchDuplicateReferenceEmail(order.email, {
        studentName: order.studentName,
        orderRef,
      });
      await recordOrderNotification(order.id, dupEmailed);

      res.status(409).json({
        success: false,
        message:
          "The GCash reference number you submitted has already been used on another order. If you believe this is an error, please contact the Finance team directly.",
      });
      return;
    }

    // A top-up resubmission pays only the outstanding difference after an
    // AMOUNT_MISMATCH rejection (§8b). Flag it + snapshot the shortfall so the
    // officer and the attempt timeline show it's a partial follow-up payment.
    const isTopUp =
      order.status === "REJECTED" &&
      order.rejectionReason === "AMOUNT_MISMATCH" &&
      order.shortfallAmount !== null;

    // Unique → accept into the verification queue.
    await prisma.$transaction([
      prisma.paymentProofSubmission.create({
        data: {
          orderId: order.id,
          screenshotPath: filename,
          referenceNumber,
          result: "ACCEPTED",
          isTopUp,
          shortfallAmount: isTopUp ? order.shortfallAmount : null,
        },
      }),
      prisma.merchOrder.update({
        where: { id: order.id },
        // Clear any prior rejection metadata on resubmit. shortfallAmount is
        // kept so the officer still sees this is a top-up pending verification.
        data: { status: "PENDING_VERIFICATION", rejectionReason: null, financeNote: null },
      }),
    ]);

    const proofEmailed = await sendMerchProofReceivedEmail(order.email, { studentName: order.studentName, orderRef });
    await recordOrderNotification(order.id, proofEmailed);

    res.status(200).json({
      success: true,
      message: "Your payment proof has been received. Our Finance team will verify your payment shortly.",
    });
  } catch (error) {
    console.error("Failed to submit payment proof:", error);
    res.status(500).json({ success: false, message: "Internal server error while submitting payment proof" });
  }
}
