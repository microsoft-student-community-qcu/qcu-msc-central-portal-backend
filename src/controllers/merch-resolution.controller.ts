/**
 * Student self-service resolution (V2 Module 04 §8d).
 *
 * When an order is oversold it lands in `AWAITING_RESOLUTION`. The student gets
 * an unguessable, single-use link (SHA-256-hashed token, 14-day TTL) letting
 * them, without an account:
 *   - GET  /api/v2/merch/resolve/:token          — see their order + swap options
 *   - POST /api/v2/merch/resolve/:token/swap      — switch to an available variant
 *   - POST /api/v2/merch/resolve/:token/refund    — request a full refund
 *
 * The token IS the proof of ownership (unlike order tracking, which needs the
 * email), so no extra email check is required. Every action consumes the token.
 * Price deltas use the effective per-variant price: cheaper → 100% of the
 * difference is refunded (order stays CONFIRMED, `refundOwed` set); pricier →
 * the student must acknowledge, then top up the difference (order holds stock in
 * `AWAITING_PAYMENT`, `shortfallAmount` set); equal → straight to CONFIRMED.
 */

import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { resolveSwapSchema } from "../schemas/merch.schema";
import { hashResolutionToken, recordOrderNotification } from "../utils/merch";
import { recordAudit } from "../utils/audit";
import {
  sendMerchSwapConfirmedEmail,
  sendMerchSwapTopUpEmail,
  sendMerchRefundRequestedEmail,
} from "../services/email.service";

function trackingUrl(orderRef: string): string {
  return `${env.FRONTEND_URL}/merch/orders/${encodeURIComponent(orderRef)}`;
}

// A resolvable order plus the token row that unlocked it.
type Resolvable = Prisma.MerchOrderResolutionTokenGetPayload<{
  include: { order: { include: { variant: { include: { item: { include: { variants: true } } } } } } };
}>;

type LoadResult =
  | { ok: true; token: Resolvable }
  | { ok: false; status: number; message: string };

/**
 * Look up a raw token, validate it (exists / unconsumed / unexpired) and confirm
 * its order is still awaiting resolution. Returns a mapped HTTP error otherwise.
 */
async function loadResolvable(rawToken: string): Promise<LoadResult> {
  const tokenHash = hashResolutionToken(rawToken);
  const token = await prisma.merchOrderResolutionToken.findUnique({
    where: { tokenHash },
    include: { order: { include: { variant: { include: { item: { include: { variants: true } } } } } } },
  });
  if (!token) return { ok: false, status: 404, message: "This resolution link is invalid." };
  if (token.consumedAt) return { ok: false, status: 410, message: "This link has already been used." };
  if (token.expiresAt < new Date()) {
    return { ok: false, status: 410, message: "This link has expired. Please contact the Finance team for a new one." };
  }
  if (token.order.status !== "AWAITING_RESOLUTION") {
    return { ok: false, status: 409, message: "This order has already been resolved." };
  }
  return { ok: true, token };
}

// Effective unit price for a variant as a Decimal: its override, else the
// parent item price. Wrapped in Prisma.Decimal so the value is always a Decimal
// (Prisma returns Decimals at runtime; this also tolerates string inputs).
function effectivePrice(variantPrice: Prisma.Decimal | null, itemPrice: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(variantPrice ?? itemPrice);
}

/** GET /api/v2/merch/resolve/:token — order context + same-item swap options. */
export async function getResolution(req: Request, res: Response): Promise<void> {
  try {
    const result = await loadResolvable(req.params.token);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    const order = result.token.order;
    const item = order.variant.item;

    // Swap options: same-item variants (excluding the sold-out one) that can
    // cover the ordered quantity, with the price delta vs what was paid.
    const options = item.variants
      .filter((v) => v.id !== order.variantId && v.stock >= order.quantity)
      .map((v) => {
        const newAmount = effectivePrice(v.price, item.price).mul(order.quantity);
        const delta = newAmount.sub(order.amount); // + pricier, − cheaper
        const deltaNum = Number(delta);
        return {
          variantId: v.id,
          label: v.label,
          stock: v.stock,
          newAmount: Number(newAmount),
          priceDelta: deltaNum,
          direction: deltaNum === 0 ? "same" : deltaNum < 0 ? "cheaper" : "pricier",
        };
      });

    res.status(200).json({
      success: true,
      data: {
        order: {
          orderRef: order.orderRef,
          itemName: item.name,
          soldOutVariantLabel: order.variant.label,
          quantity: order.quantity,
          amountPaid: Number(order.amount),
          status: order.status,
        },
        options,
        canRefund: true,
        expiresAt: result.token.expiresAt,
      },
    });
  } catch (error) {
    console.error("Failed to load resolution:", error);
    res.status(500).json({ success: false, message: "Internal server error while loading your order" });
  }
}

/** POST /api/v2/merch/resolve/:token/swap — switch to an available variant. */
export async function resolveSwap(req: Request, res: Response): Promise<void> {
  try {
    const parsed = resolveSwapSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await loadResolvable(req.params.token);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    const token = result.token;
    const order = token.order;
    const item = order.variant.item;

    const target = item.variants.find((v) => v.id === parsed.data.variantId);
    if (!target || target.id === order.variantId) {
      res.status(400).json({ success: false, message: "Please choose a different, available size." });
      return;
    }

    const newAmount = effectivePrice(target.price, item.price).mul(order.quantity);
    const delta = newAmount.sub(order.amount); // + pricier, − cheaper
    const deltaNum = Number(delta);

    // A pricier swap charges the student — never without an explicit ack.
    if (deltaNum > 0 && !parsed.data.acknowledgedTopUp) {
      res.status(409).json({
        success: false,
        message: `Switching to ${target.label} costs ₱${deltaNum.toFixed(2)} more. Please confirm you'll pay the difference to proceed.`,
        data: { requiresTopUp: true, shortfall: deltaNum, variantId: target.id, newAmount: Number(newAmount) },
      });
      return;
    }

    // Atomic: commit the target's stock, repoint the order, consume the token.
    const swap = await prisma.$transaction(async (tx) => {
      const dec = await tx.merchVariant.updateMany({
        where: { id: target.id, stock: { gte: order.quantity } },
        data: { stock: { decrement: order.quantity } },
      });
      if (dec.count === 0) return false; // Target sold out mid-swap

      const data: Prisma.MerchOrderUpdateInput = {
        variant: { connect: { id: target.id } },
        amount: newAmount,
        stockHeld: true,
        rejectionReason: null,
      };
      if (deltaNum > 0) {
        // Pricier: hold stock, await the top-up before confirming.
        data.status = "AWAITING_PAYMENT";
        data.shortfallAmount = delta;
        data.refundOwed = null;
      } else if (deltaNum < 0) {
        // Cheaper: confirm now, owe the student 100% of the difference.
        data.status = "CONFIRMED";
        data.shortfallAmount = null;
        data.refundOwed = delta.abs();
      } else {
        data.status = "CONFIRMED";
        data.shortfallAmount = null;
        data.refundOwed = null;
      }
      await tx.merchOrder.update({ where: { id: order.id }, data });
      await tx.merchOrderResolutionToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
      return true;
    });

    if (!swap) {
      res.status(409).json({
        success: false,
        message: "That size just sold out too. Please pick another available size or request a refund.",
      });
      return;
    }

    await recordAudit({
      actorId: null,
      action: "MERCH_ORDER_SWAPPED",
      entityType: "MERCH_ORDER",
      entityId: order.id,
      details: { from: order.variant.label, to: target.label, priceDelta: deltaNum },
      ipAddress: typeof req.ip === "string" ? req.ip : null,
    });

    let emailed: boolean;
    if (deltaNum > 0) {
      emailed = await sendMerchSwapTopUpEmail(order.email, {
        studentName: order.studentName,
        orderRef: order.orderRef,
        itemName: item.name,
        variantLabel: target.label,
        shortfall: deltaNum,
        gcashNumber: env.GCASH_NUMBER ?? null,
        gcashQrImageUrl: env.GCASH_QR_IMAGE_URL ?? null,
        trackingUrl: trackingUrl(order.orderRef),
      });
    } else {
      emailed = await sendMerchSwapConfirmedEmail(order.email, {
        studentName: order.studentName,
        orderRef: order.orderRef,
        itemName: item.name,
        variantLabel: target.label,
        refundOwed: deltaNum < 0 ? Math.abs(deltaNum) : null,
      });
    }
    await recordOrderNotification(order.id, emailed);

    res.status(200).json({
      success: true,
      message:
        deltaNum > 0
          ? "Your new size is reserved. Please pay the difference and submit the reference number to confirm."
          : "Your order has been switched to the new size.",
      data: {
        status: deltaNum > 0 ? "AWAITING_PAYMENT" : "CONFIRMED",
        shortfall: deltaNum > 0 ? deltaNum : 0,
        refundOwed: deltaNum < 0 ? Math.abs(deltaNum) : 0,
        trackingUrl: trackingUrl(order.orderRef),
      },
    });
  } catch (error) {
    console.error("Failed to process resolution swap:", error);
    res.status(500).json({ success: false, message: "Internal server error while switching your order" });
  }
}

/** POST /api/v2/merch/resolve/:token/refund — request a full refund. */
export async function resolveRefund(req: Request, res: Response): Promise<void> {
  try {
    const result = await loadResolvable(req.params.token);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    const order = result.token.order;

    await prisma.$transaction(async (tx) => {
      await tx.merchOrder.update({ where: { id: order.id }, data: { refundRequestedAt: new Date() } });
      await tx.merchOrderResolutionToken.update({ where: { id: result.token.id }, data: { consumedAt: new Date() } });
    });

    await recordAudit({
      actorId: null,
      action: "MERCH_ORDER_REFUND_REQUESTED",
      entityType: "MERCH_ORDER",
      entityId: order.id,
      details: { orderRef: order.orderRef },
      ipAddress: typeof req.ip === "string" ? req.ip : null,
    });

    const emailed = await sendMerchRefundRequestedEmail(order.email, {
      studentName: order.studentName,
      orderRef: order.orderRef,
    });
    await recordOrderNotification(order.id, emailed);

    res.status(200).json({
      success: true,
      message: "Refund requested. Our Finance team will process it and email you a receipt.",
    });
  } catch (error) {
    console.error("Failed to process resolution refund:", error);
    res.status(500).json({ success: false, message: "Internal server error while requesting your refund" });
  }
}
