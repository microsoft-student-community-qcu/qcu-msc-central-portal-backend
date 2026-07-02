import { Router } from "express";
import { requireAdminHR } from "./authMiddleware";
import { getMe, updateUserRole } from "../controllers/user.controller";

const router = Router();

router.get("/me", getMe);
router.patch("/:userId/role", requireAdminHR, updateUserRole);

export default router;
