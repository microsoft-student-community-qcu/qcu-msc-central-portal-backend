import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import { requireAdminFinance, requireAdminFinanceHead } from "./authMiddleware";
import { adminMutationLimiter } from "../config/rateLimit";
import {
  listItemsAdmin,
  createItem,
  updateItem,
  archiveItem,
  listOrders,
  confirmOrder,
  rejectOrder,
  claimOrder,
  cancelOrder,
  serveMerchScreenshot,
} from "../controllers/merch-admin.controller";

/**
 * Finance admin merch routes (V2 Module 04). Mounted at /api/v2/admin/merch
 * after authMiddleware. `requireAdminFinance` admits ADMIN_FINANCE,
 * ADMIN_FINANCE_HEAD, and SUPERADMIN (role inheritance); archive + cancel are
 * head-only. Mutations are additionally rate-limited (defense in depth).
 */

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ success: false, message: "Each photo must not exceed 10MB" });
      return;
    }
    res.status(400).json({ success: false, message: "File upload error" });
    return;
  }
  next(err);
}

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
router.post("/orders/:orderId/confirm", requireAdminFinance, adminMutationLimiter, confirmOrder);
router.post("/orders/:orderId/reject", requireAdminFinance, adminMutationLimiter, rejectOrder);
router.post("/orders/:orderId/claim", requireAdminFinance, adminMutationLimiter, claimOrder);
router.post("/orders/:orderId/cancel", requireAdminFinanceHead, adminMutationLimiter, cancelOrder);

// ── Protected screenshot proxy ──────────────────────────────────────────────
router.get("/screenshots/:filename", requireAdminFinance, serveMerchScreenshot);

export default router;
