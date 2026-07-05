import { Router } from "express";
import { requireAuth, requireAdminHR } from "./authMiddleware";
import { getMe, updateUserRole, linkApplicant, validateSetupToken } from "../controllers/user.controller";

const router = Router();

router.post("/validate-setup-token", validateSetupToken);
router.get("/me", requireAuth, getMe);
router.post("/link-applicant", requireAuth, linkApplicant);
router.patch("/:userId/role", requireAdminHR, updateUserRole);

export default router;
