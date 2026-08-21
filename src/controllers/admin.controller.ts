/**
 * Admin controllers (V2 Module 01 — Super Admin Settings Hub).
 *
 * All endpoints are SUPERADMIN-only and live under /api/v2/admin.
 * Mutations are rate-limited and audit-logged; audit rows are tamper-evident
 * (see src/utils/audit.ts).
 */

import { Request, Response } from "express";
import { prisma } from "../config/database";
import type { UserRole } from "@prisma/client";
import { ALL_ROLES, SUPERADMIN } from "../config/roles";
import { SETTING_DESCRIPTIONS } from "../config/settings";
import { adminUpdateUserRoleSchema } from "../schemas/user.schema";
import { updateSettingsSchema, clampPagination } from "../schemas/admin.schema";
import { recordAudit, verifyAuditChain } from "../utils/audit";

const MAX_USER_PAGE_SIZE = 50;
const MAX_LOG_PAGE_SIZE = 100;

// Safe user fields only — never passwords, sessions, or internal fields.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  middleInitial: true,
  name: true,
  studentId: true,
  role: true,
  image: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

function actorFrom(req: Request): string | null {
  return ((req as any).userId as string | null) ?? null;
}

function ipFrom(req: Request): string | null {
  return typeof req.ip === "string" ? req.ip : null;
}

function pagination(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ── User management ─────────────────────────────────────────────────────────

/** GET /api/v2/admin/users — search + paginated user list for role management. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const roleFilter = typeof req.query.role === "string" ? req.query.role : "";
    if (roleFilter && !(ALL_ROLES as readonly string[]).includes(roleFilter)) {
      res.status(400).json({
        success: false,
        message: "Invalid role filter",
      });
      return;
    }

    const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize, MAX_USER_PAGE_SIZE);

    const where = {
      ...(roleFilter ? { role: roleFilter as UserRole } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search } },
              { name: { contains: search } },
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { studentId: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: { users, pagination: pagination(total, page, pageSize) },
    });
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * PATCH /api/v2/admin/users/:userId/role — SUPERADMIN-only role mutation.
 * Enforces the self-demotion lock and the last-superadmin lock (both 403).
 */
export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const actorId = actorFrom(req);
    const { userId } = req.params;

    const parsed = adminUpdateUserRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const newRole = parsed.data.role;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Self-demotion lock — a superadmin may not downgrade their own role
    // (PRD-V2 edge case: prevents permanent system lockouts).
    if (actorId === target.id && newRole !== SUPERADMIN) {
      res.status(403).json({
        success: false,
        message: "You cannot change your own role. Another SUPERADMIN must perform this action.",
      });
      return;
    }

    // Last-superadmin lock — never demote the only remaining SUPERADMIN.
    if (target.role === SUPERADMIN && newRole !== SUPERADMIN) {
      const superadminCount = await prisma.user.count({ where: { role: SUPERADMIN } });
      if (superadminCount <= 1) {
        res.status(403).json({
          success: false,
          message: "Cannot demote the last SUPERADMIN. Promote another user first.",
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: SAFE_USER_SELECT,
    });

    await recordAudit({
      actorId,
      action: "ROLE_CHANGE",
      entityType: "USER",
      entityId: userId,
      details: { from: target.role, to: newRole },
      ipAddress: ipFrom(req),
    });

    res.status(200).json({
      success: true,
      data: updated,
      message: "User role updated successfully",
    });
  } catch (error) {
    console.error("Failed to update user role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ── System settings ─────────────────────────────────────────────────────────

/** GET /api/v2/admin/settings — all global toggles. */
export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: [{ key: "asc" }],
      select: {
        key: true,
        value: true,
        description: true,
        updatedById: true,
        updatedAt: true,
      },
    });

    res.status(200).json({ success: true, data: { settings } });
  } catch (error) {
    console.error("Failed to get settings:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/** PATCH /api/v2/admin/settings — whitelisted boolean toggles, audit-logged. */
export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const actorId = actorFrom(req);

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const entries = Object.entries(parsed.data);
    for (const [key, value] of entries) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value, updatedById: actorId },
        create: {
          key,
          value,
          updatedById: actorId,
          description: SETTING_DESCRIPTIONS[key] ?? null,
        },
      });
    }

    const changed = Object.fromEntries(entries);
    await recordAudit({
      actorId,
      action: "SETTING_UPDATE",
      entityType: "SYSTEM_SETTING",
      details: { updated: changed },
      ipAddress: ipFrom(req),
    });

    // Maintenance mode gets its own audit event type (module doc §8).
    if (typeof changed.maintenance_mode === "boolean") {
      await recordAudit({
        actorId,
        action: "SYSTEM_MAINTENANCE",
        entityType: "SYSTEM_SETTING",
        entityId: "maintenance_mode",
        details: { maintenance_mode: changed.maintenance_mode },
        ipAddress: ipFrom(req),
      });
    }

    const settings = await prisma.systemSetting.findMany({
      orderBy: [{ key: "asc" }],
      select: { key: true, value: true, description: true, updatedById: true, updatedAt: true },
    });

    res.status(200).json({
      success: true,
      data: { settings },
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.error("Failed to update settings:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ── Audit viewer ────────────────────────────────────────────────────────────

/** GET /api/v2/admin/audit-logs — paginated, filterable, integrity-checked. */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize, MAX_LOG_PAGE_SIZE);

    const where: Record<string, unknown> = {};
    if (typeof req.query.action === "string" && req.query.action) where.action = req.query.action;
    if (typeof req.query.actorId === "string" && req.query.actorId) where.actorId = req.query.actorId;

    // Date-range filter — invalid dates are rejected with a clear error.
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (typeof req.query.from === "string" && req.query.from) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) {
        res.status(400).json({ success: false, message: "Invalid from date" });
        return;
      }
      createdAtFilter.gte = from;
    }
    if (typeof req.query.to === "string" && req.query.to) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) {
        res.status(400).json({ success: false, message: "Invalid to date" });
        return;
      }
      createdAtFilter.lte = to;
    }
    if (createdAtFilter.gte || createdAtFilter.lte) where.createdAt = createdAtFilter;

    const [total, logs, integrity] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      verifyAuditChain(),
    ]);

    res.status(200).json({
      success: true,
      data: { logs, integrity, pagination: pagination(total, page, pageSize) },
    });
  } catch (error) {
    console.error("Failed to get audit logs:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}