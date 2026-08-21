import { Request, Response, NextFunction } from "express";
import { auth } from "../config/auth";
import { SUPERADMIN, isSuperadmin } from "../config/roles";

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

/**
 * Guard factory with SUPERADMIN role inheritance (PRD-V2 Global NFR:
 * "Superadmin is automatically authorized for any restricted action").
 * A user passes when their role is in `allowedRoles` OR is SUPERADMIN.
 */
function requireRole(...allowedRoles: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = (req as any).userRole;
    if (!allowedRoles.includes(userRole) && !isSuperadmin(userRole)) {
      res.status(403).json({
        success: false,
        message: `Forbidden - ${allowedRoles.join(" or ")} access required`,
      });
      return;
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!(req as any).userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized - authentication required",
    });
    return;
  }
  next();
}

export const requireAdminHR = requireRole("ADMIN_HR");

export const requireAdminLogistics = requireRole("ADMIN_LOGISTICS");

export const requireAnyAdmin = requireRole("ADMIN_HR", "ADMIN_LOGISTICS");

export const requireMemberOrAdmin = requireRole("MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS");

export const requireSuperadmin = requireRole(SUPERADMIN);

export const requireAdminFinance = requireRole("ADMIN_FINANCE");

export const requireAdminFinanceHead = requireRole("ADMIN_FINANCE_HEAD");

export const requireAdminLogisticsHead = requireRole("ADMIN_LOGISTICS_HEAD");

