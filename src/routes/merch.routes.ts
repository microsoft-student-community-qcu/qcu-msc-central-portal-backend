import { Router } from "express";
import multer from "multer";
import { merchOrderLimiter, merchPaymentProofLimiter, merchTrackingLimiter, merchResolutionLimiter } from "../config/rateLimit";
import { getCatalog, getCatalogItem, getCatalogPhoto } from "../controllers/merch.controller";
import { createOrder, trackOrder, submitPaymentProof } from "../controllers/merch-order.controller";
import { getResolution, resolveSwap, resolveRefund } from "../controllers/merch-resolution.controller";
import { multerErrorHandler } from "../utils/multerError";

/**
 * Public merch routes (V2 Module 04 — Finance). No authentication required.
 * Order tracking and payment-proof submission are guarded by the order email
 * (see the controllers), not by a session. Registered before authMiddleware
 * in app.ts so authMiddleware still runs and sets req.userId when a session
 * cookie is present (used to link authenticated pre-orders).
 */

// In-memory upload — screenshots are streamed straight to Blob (10MB cap,
// matching the applicant upload limit; `files` caps the count so extras fail
// fast rather than buffering).
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const handleMulterError = multerErrorHandler(
  "The screenshot must not exceed 10MB",
  "Only one screenshot may be uploaded"
);

const router = Router();

// ── Public catalog ──────────────────────────────────────────────────────────
router.get("/", getCatalog);
// Photo proxy must be registered before the ":itemId" param route so
// "/photos/:filename" is not captured as an item id.
router.get("/photos/:filename", getCatalogPhoto);
router.get("/:itemId", getCatalogItem);

// ── Orders ────────────────────────────────────────────────────────────────
router.post("/orders", merchOrderLimiter, createOrder);
router.get("/orders/:orderRef", merchTrackingLimiter, trackOrder);
router.post(
  "/orders/:orderRef/payment-proof",
  merchPaymentProofLimiter,
  upload.fields([{ name: "screenshot", maxCount: 1 }]),
  handleMulterError,
  submitPaymentProof
);

// ── Self-service resolution (§8d) — token-gated swap/refund for oversold orders ─
router.get("/resolve/:token", merchResolutionLimiter, getResolution);
router.post("/resolve/:token/swap", merchResolutionLimiter, resolveSwap);
router.post("/resolve/:token/refund", merchResolutionLimiter, resolveRefund);

export default router;
