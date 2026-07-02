import { Router } from "express";
import { requireAuth, requireAdminHR } from "./authMiddleware";
import { getMe, updateUserRole, linkApplicant } from "../controllers/user.controller";

const router = Router();

router.get("/me", requireAuth, getMe);
router.post("/link-applicant", requireAuth, linkApplicant);
router.patch("/:userId/role", requireAdminHR, updateUserRole);

export default router;
