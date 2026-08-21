import { z } from "zod";

// ── Merch validation schemas (V2 Module 04) ─────────────────────────────────
// Zod v4 conventions match event.schema.ts: `{ error }` for enums/coercion,
// positional messages for string checks, `{ message }` inside refine. Every
// message is human-readable and safe to surface directly to the frontend.

// Mirrors Prisma MerchRejectionReason (minus DUPLICATE_REFERENCE, which is only
// ever set automatically by the duplicate-check flow, never chosen by an officer).
export const merchRejectionReasonEnum = z.enum(
  ["REFERENCE_NOT_FOUND", "AMOUNT_MISMATCH", "SCREENSHOT_UNCLEAR", "OUT_OF_STOCK", "OTHER"],
  { error: "Rejection reason must be one of the preset options" }
);

// A single size/variant with its stock. Used inside item creation/edit.
const variantInputSchema = z.object({
  label: z
    .string({ error: "Variant label is required" })
    .trim()
    .min(1, "Variant label is required")
    .max(50, "Variant label must be less than 50 characters"),
  stock: z.coerce
    .number({ error: "Variant stock must be a number" })
    .int("Variant stock must be a whole number")
    .min(0, "Variant stock cannot be negative"),
});

// `variants` arrives as a JSON string in multipart/form-data. Preprocess parses
// it before validation so the client can send a normal JSON array.
const variantsField = z.preprocess((val) => {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val; // Let the array validator produce a readable error
    }
  }
  return val;
}, z
  .array(variantInputSchema, { error: "At least one variant (size) is required" })
  .min(1, "At least one variant (size) is required")
  .max(30, "An item cannot have more than 30 variants")
  .refine(
    (variants) => {
      const labels = variants.map((v) => v.label.toLowerCase());
      return new Set(labels).size === labels.length;
    },
    { message: "Variant labels must be unique within an item" }
  ));

// POST /api/v2/admin/merch/items — multipart (photos are files).
export const createMerchItemSchema = z.object({
  name: z
    .string({ error: "Item name is required" })
    .trim()
    .min(1, "Item name is required")
    .max(150, "Item name must be less than 150 characters"),
  description: z
    .string({ error: "Description is required" })
    .trim()
    .min(1, "Description is required")
    .max(2000, "Description must be less than 2000 characters"),
  price: z.coerce
    .number({ error: "Price is required and must be a number" })
    .positive("Price must be greater than zero")
    .max(1_000_000, "Price is unrealistically high"),
  lowStockThreshold: z.coerce
    .number({ error: "Low-stock threshold must be a number" })
    .int("Low-stock threshold must be a whole number")
    .min(0, "Low-stock threshold cannot be negative")
    .optional()
    .default(10),
  variants: variantsField,
});

// PATCH /api/v2/admin/merch/items/:itemId — all fields optional; variants edit
// replaces stock per existing variant / adds new labels (handled in controller).
export const updateMerchItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Item name is required")
    .max(150, "Item name must be less than 150 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(2000, "Description must be less than 2000 characters")
    .optional(),
  price: z.coerce
    .number({ error: "Price must be a number" })
    .positive("Price must be greater than zero")
    .max(1_000_000, "Price is unrealistically high")
    .optional(),
  lowStockThreshold: z.coerce
    .number({ error: "Low-stock threshold must be a number" })
    .int("Low-stock threshold must be a whole number")
    .min(0, "Low-stock threshold cannot be negative")
    .optional(),
  variants: variantsField.optional(),
});

// POST /api/v2/merch/orders — public pre-order. Logged-in callers have some
// fields pre-filled server-side, but the schema accepts them uniformly.
export const createOrderSchema = z.object({
  variantId: z
    .string({ error: "A variant selection is required" })
    .min(1, "A variant selection is required"),
  quantity: z.coerce
    .number({ error: "Quantity is required and must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(20, "Quantity cannot exceed 20 per order"),
  studentName: z
    .string({ error: "Full name is required" })
    .trim()
    .min(1, "Full name is required")
    .max(150, "Full name must be less than 150 characters"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .email("Enter a valid email address")
    .max(150, "Email must be less than 150 characters"),
  studentId: z
    .string()
    .trim()
    .max(20, "Student ID must be less than 20 characters")
    .optional(),
  gcashNumber: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "Enter a valid GCash number (11 digits, starts with 09)")
    .optional(),
});

// GET /api/v2/merch/orders/:orderRef?email=... — order tracking requires the
// matching email to prevent enumeration of orders by reference alone.
export const trackOrderQuerySchema = z.object({
  email: z
    .string({ error: "Email is required to view this order" })
    .trim()
    .email("Enter a valid email address"),
});

// POST /api/v2/merch/orders/:orderRef/payment-proof — multipart (screenshot file).
export const submitPaymentProofSchema = z.object({
  // Email must match the order — this endpoint is public, so the email guards
  // against anyone submitting proof against a known order reference.
  email: z
    .string({ error: "Email is required" })
    .trim()
    .email("Enter a valid email address"),
  referenceNumber: z
    .string({ error: "GCash reference number is required" })
    .trim()
    .regex(/^\d{13}$/, "The GCash reference number must be exactly 13 digits"),
});

// POST /api/v2/admin/merch/orders/:orderId/reject
export const rejectOrderSchema = z
  .object({
    reason: merchRejectionReasonEnum,
    financeNote: z
      .string()
      .trim()
      .max(500, "Note must be less than 500 characters")
      .optional(),
  })
  .refine((data) => data.reason !== "OTHER" || (data.financeNote && data.financeNote.length > 0), {
    message: "A note is required when the rejection reason is 'Other'",
    path: ["financeNote"],
  });

// POST /api/v2/admin/merch/orders/:orderId/cancel (head-only)
export const cancelOrderSchema = z.object({
  financeNote: z
    .string({ error: "A cancellation note is required" })
    .trim()
    .min(1, "A cancellation note is required")
    .max(500, "Note must be less than 500 characters"),
});

export type CreateMerchItemInput = z.infer<typeof createMerchItemSchema>;
export type UpdateMerchItemInput = z.infer<typeof updateMerchItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
