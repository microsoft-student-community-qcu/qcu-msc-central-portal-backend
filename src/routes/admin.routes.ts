import { Router } from "express";
import { requireSuperadmin } from "./authMiddleware";
import { adminMutationLimiter } from "../config/rateLimit";
import {
  listUsers,
  updateUserRole,
  getSettings,
  updateSettings,
  getAuditLogs,
} from "../controllers/admin.controller";

/**
 * V2 admin API (Module 01 — Super Admin Settings Hub).
 * Every endpoint is SUPERADMIN-only; mutation endpoints are rate-limited.
 */
const router = Router();

router.get("/users", requireSuperadmin, listUsers);
router.patch("/users/:userId/role", requireSuperadmin, adminMutationLimiter, updateUserRole);
router.get("/settings", requireSuperadmin, getSettings);
router.patch("/settings", requireSuperadmin, adminMutationLimiter, updateSettings);
router.get("/audit-logs", requireSuperadmin, getAuditLogs);

export default router;