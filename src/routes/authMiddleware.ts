import { Request, Response, NextFunction } from "express";
import { auth } from "../config/auth";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session) {
      (req as any).userId = session.user.id;
      (req as any).userRole = (session.user as any).role ?? null;
    } else {
      (req as any).userId = null;
      (req as any).userRole = null;
    }
  } catch {
    (req as any).userId = null;
    (req as any).userRole = null;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!(req as any).userId) {
    res.status(401).json({
      success: false,
      error: "Unauthorized - authentication required",
    });
    return;
  }
  next();
}

export function requireAdminHR(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).userRole !== "ADMIN_HR") {
    res.status(403).json({
      success: false,
      error: "Forbidden - ADMIN_HR access required",
    });
    return;
  }
  next();
}

export function requireAdminLogistics(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).userRole !== "ADMIN_LOGISTICS") {
    res.status(403).json({
      success: false,
      error: "Forbidden - ADMIN_LOGISTICS access required",
    });
    return;
  }
  next();
}

export function requireAnyAdmin(req: Request, res: Response, next: NextFunction): void {
  const userRole = (req as any).userRole;
  if (!["ADMIN_HR", "ADMIN_LOGISTICS"].includes(userRole)) {
    res.status(403).json({
      success: false,
      error: "Forbidden - admin access required",
    });
    return;
  }
  next();
}

export function requireMemberOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const userRole = (req as any).userRole;
  if (!["MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS"].includes(userRole)) {
    res.status(403).json({
      success: false,
      error: "Forbidden - MEMBER or admin access required",
    });
    return;
  }
  next();
}

