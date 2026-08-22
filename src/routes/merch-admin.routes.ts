import { Router } from "express";
import multer from "multer";
import { requireAdminFinance, requireAdminFinanceHead } from "./authMiddleware";
import { adminMutationLimiter } from "../config/rateLimit";
import { multerErrorHandler } from "../utils/multerError";
import {
  listItemsAdmin,
  createItem,
  updateItem,
  archiveItem,
  listOrders,
  getOrderDetail,
  confirmOrder,
  rejectOrder,
  claimOrder,
  cancelOrder,
  refundOrder,
  resendOrderEmail,
  issueResolutionLink,
  serveMerchScreenshot,
} from "../controllers/merch-admin.controller";

/**
 * Finance admin merch routes (V2 Module 04). Mounted at /api/v2/admin/merch
 * after authMiddleware. `requireAdminFinance` admits ADMIN_FINANCE,
 * ADMIN_FINANCE_HEAD, and SUPERADMIN (role inheritance); archive, cancel, and
 * refund are head-only. Mutations are additionally rate-limited (defense in depth).
 */

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024, files: 6 } });

const handleMulterError = multerErrorHandler(
  "Each photo must not exceed 10MB",
  "You can upload at most 6 photos"
);

const router = Router();

// ── Item management (Flow 1) ────────────────────────────────────────────────
router.get("/items", requireAdminFinance, listItemsAdmin);
router.post(
  "/items",
  requireAdminFinance,
  adminMutationLimiter,
  upload.fields([{ name: "photos", maxCount: 6 }]),
  handleMulterError,
  createItem
);
router.patch(
  "/items/:itemId",
  requireAdminFinance,
  adminMutationLimiter,
  upload.fields([{ name: "photos", maxCount: 6 }]),
  handleMulterError,
  updateItem
);
router.post("/items/:itemId/archive", requireAdminFinanceHead, adminMutationLimiter, archiveItem);

// ── Order verification (Flows 4–5) ──────────────────────────────────────────
router.get("/orders", requireAdminFinance, listOrders);
router.get("/orders/:orderId", requireAdminFinance, getOrderDetail);
router.post("/orders/:orderId/confirm", requireAdminFinance, adminMutationLimiter, confirmOrder);
router.post("/orders/:orderId/reject", requireAdminFinance, adminMutationLimiter, rejectOrder);
router.post("/orders/:orderId/claim", requireAdminFinance, adminMutationLimiter, claimOrder);
router.post("/orders/:orderId/cancel", requireAdminFinanceHead, adminMutationLimiter, cancelOrder);
// Refund is head-only (records a FULL MerchRefund + moves AWAITING_RESOLUTION → REFUNDED).
router.post("/orders/:orderId/refund", requireAdminFinanceHead, adminMutationLimiter, refundOrder);
// Manual re-notify for orders whose status email may have silently failed.
router.post("/orders/:orderId/resend-email", requireAdminFinance, adminMutationLimiter, resendOrderEmail);
// Reissue a fresh self-service resolution link for an AWAITING_RESOLUTION order (§8d).
router.post("/orders/:orderId/resolution-link", requireAdminFinance, adminMutationLimiter, issueResolutionLink);

// ── Protected screenshot proxy ──────────────────────────────────────────────
router.get("/screenshots/:filename", requireAdminFinance, serveMerchScreenshot);

export default router;
