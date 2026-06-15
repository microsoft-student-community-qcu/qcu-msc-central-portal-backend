import { Router } from "express";
import {
  createUser,
  loginUser,
  getUserProfile,
  updateUserRole,
} from "../controllers/userController";
import { requireAuth, requireAdmin } from "./authMiddleware";

const router = Router();

/**
 * POST /api/users
 * Create a new user account
 */
router.post("/", createUser);

/**
 * POST /api/users/login
 * Login and get JWT token
 */
router.post("/login", loginUser);

/**
 * GET /api/users/me
 * Get authenticated user's profile (requires auth)
 */
router.get("/me", requireAuth, getUserProfile);

/**
 * PATCH /api/users/:userId/role
 * Update user's role (admin only)
 */
router.patch("/:userId/role", requireAuth, requireAdmin, updateUserRole);

export default router;
