import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Authentication middleware to verify JWT token.
 * Extracts user information from token and attaches to request.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Continue without authentication - some endpoints allow public access
      (req as any).userId = null;
      (req as any).userRole = null;
      next();
      return;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    (req as any).userId = decoded.userId;
    (req as any).userRole = decoded.role;

    next();
  } catch (error) {
    // Invalid token - continue without authentication
    (req as any).userId = null;
    (req as any).userRole = null;
    next();
  }
}

/**
 * Middleware to require authentication.
 * Use this on protected endpoints.
 */
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

/**
 * Middleware to require ADMIN_HR role.
 */
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

/**
 * Middleware to require ADMIN_LOGISTICS role.
 */
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

/**
 * Middleware to require ADMIN_HR or ADMIN_LOGISTICS (any admin sub-type).
 */
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

/**
 * Middleware to require MEMBER, ADMIN_HR, or ADMIN_LOGISTICS role.
 */
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
