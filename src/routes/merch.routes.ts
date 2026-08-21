import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import { merchOrderLimiter, merchPaymentProofLimiter, merchTrackingLimiter } from "../config/rateLimit";
import { getCatalog, getCatalogItem } from "../controllers/merch.controller";
import { createOrder, trackOrder, submitPaymentProof } from "../controllers/merch-order.controller";

/**
 * Public merch routes (V2 Module 04 — Finance). No authentication required.
 * Order tracking and payment-proof submission are guarded by the order email
 * (see the controllers), not by a session. Registered before authMiddleware
 * in app.ts so authMiddleware still runs and sets req.userId when a session
 * cookie is present (used to link authenticated pre-orders).
 */

// In-memory upload — screenshots are streamed straight to Blob (10MB cap,
// matching the applicant upload limit).
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ success: false, message: "The screenshot must not exceed 10MB" });
      return;
    }
    res.status(400).json({ success: false, message: "File upload error" });
    return;
  }
  next(err);
}

const router = Router();

// ── Public catalog ──────────────────────────────────────────────────────────
router.get("/", getCatalog);
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

export default router;
