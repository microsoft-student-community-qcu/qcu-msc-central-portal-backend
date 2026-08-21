import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { authUnauthenticated } from "./helpers";

// ── Auth Mock Setup ──────────────────────────────────────────────────────
const {
  mockAuthMiddleware,
  mockRequireAuth,
  mockRequireAdminHR,
  mockRequireAdminLogistics,
  mockRequireAnyAdmin,
  mockRequireMemberOrAdmin,
  mockRequireSuperadmin,
  mockRequireAdminFinance,
  mockRequireAdminFinanceHead,
  mockRequireAdminLogisticsHead,
} = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRequireAdminHR: vi.fn(),
  mockRequireAdminLogistics: vi.fn(),
  mockRequireAnyAdmin: vi.fn(),
  mockRequireMemberOrAdmin: vi.fn(),
  mockRequireSuperadmin: vi.fn(),
  mockRequireAdminFinance: vi.fn(),
  mockRequireAdminFinanceHead: vi.fn(),
  mockRequireAdminLogisticsHead: vi.fn(),
}));

vi.mock("../routes/authMiddleware", () => ({
  authMiddleware: mockAuthMiddleware,
  requireAuth: mockRequireAuth,
  requireAdminHR: mockRequireAdminHR,
  requireAdminLogistics: mockRequireAdminLogistics,
  requireAnyAdmin: mockRequireAnyAdmin,
  requireMemberOrAdmin: mockRequireMemberOrAdmin,
  requireSuperadmin: mockRequireSuperadmin,
  requireAdminFinance: mockRequireAdminFinance,
  requireAdminFinanceHead: mockRequireAdminFinanceHead,
  requireAdminLogisticsHead: mockRequireAdminLogisticsHead,
}));

import app from "../app";

function setupAsSuperadmin(): void {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = "superadmin-id";
    req.userRole = "SUPERADMIN";
    next();
  });
  mockRequireSuperadmin.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
}

function setupAsRole(role: string): void {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = role === "SUPERADMIN" ? "superadmin-id" : "admin-hr-id";
    req.userRole = role;
    next();
  });
  mockRequireSuperadmin.mockImplementation((req: any, res: any, next: any) => {
    if (req.userRole !== "SUPERADMIN") {
      res.status(403).json({ success: false, message: "Forbidden - SUPERADMIN access required" });
    } else {
      next();
    }
  });
}

function setupUnauthenticated(): void {
  mockAuthMiddleware.mockImplementation(authUnauthenticated);
  mockRequireSuperadmin.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(401).json({ success: false, message: "Unauthorized - authentication required" });
  });
}

const mockSuperadminRecord = {
  id: "superadmin-id",
  email: "superadmin@msc-qcu.tech",
  firstName: "System",
  lastName: "Superadmin",
  studentId: "00-0000",
  role: "SUPERADMIN",
  emailVerified: true,
  createdAt: new Date("2026-01-01"),
};

describe("GET /api/v2/admin/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsSuperadmin();
  });

  it("returns 403 for non-superadmin roles", async () => {
    setupAsRole("ADMIN_HR");
    const res = await request(app).get("/api/v2/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("SUPERADMIN");
  });

  it("returns 401 when not authenticated", async () => {
    setupUnauthenticated();
    const res = await request(app).get("/api/v2/admin/users");
    expect(res.status).toBe(401);
  });

  it("returns a paginated user list", async () => {
    (prisma.user.count as any).mockResolvedValueOnce(1);
    (prisma.user.findMany as any).mockResolvedValueOnce([mockSuperadminRecord]);
    const res = await request(app).get("/api/v2/admin/users?page=1&pageSize=10");
    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it("returns 400 for an invalid role filter", async () => {
    const res = await request(app).get("/api/v2/admin/users?role=NOT_A_ROLE");
    expect(res.status).toBe(400);
  });

  it("never exposes password fields", async () => {
    (prisma.user.count as any).mockResolvedValueOnce(1);
    (prisma.user.findMany as any).mockResolvedValueOnce([mockSuperadminRecord]);
    const res = await request(app).get("/api/v2/admin/users");
    expect(res.body.data.users[0].password).toBeUndefined();
  });
});

describe("PATCH /api/v2/admin/users/:userId/role", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsSuperadmin();
  });

  it("updates a role and writes an audit log", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "user-1", role: "MEMBER" });
    (prisma.user.update as any).mockResolvedValueOnce({ id: "user-1", role: "ADMIN_HR" });
    (prisma.auditLog.findFirst as any).mockResolvedValueOnce(null);
    (prisma.auditLog.create as any).mockResolvedValueOnce({});

    const res = await request(app)
      .patch("/api/v2/admin/users/user-1/role")
      .send({ role: "ADMIN_HR" });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("ADMIN_HR");
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ROLE_CHANGE",
          entityType: "USER",
          entityId: "user-1",
          actorId: "superadmin-id",
        }),
      })
    );
  });

  it("returns 400 for an invalid role", async () => {
    const res = await request(app)
      .patch("/api/v2/admin/users/user-1/role")
      .send({ role: "INVALID" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target user does not exist", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v2/admin/users/ghost/role")
      .send({ role: "MEMBER" });
    expect(res.status).toBe(404);
  });

  it("blocks self-demotion with 403", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "superadmin-id", role: "SUPERADMIN" });
    const res = await request(app)
      .patch("/api/v2/admin/users/superadmin-id/role")
      .send({ role: "MEMBER" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("own role");
  });

  it("blocks demoting the last SUPERADMIN with 403", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "user-2", role: "SUPERADMIN" });
    (prisma.user.count as any).mockResolvedValueOnce(1);
    const res = await request(app)
      .patch("/api/v2/admin/users/user-2/role")
      .send({ role: "ADMIN_HR" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("last SUPERADMIN");
  });

  it("allows demoting a SUPERADMIN when another one exists", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "user-2", role: "SUPERADMIN" });
    (prisma.user.count as any).mockResolvedValueOnce(2);
    (prisma.user.update as any).mockResolvedValueOnce({ id: "user-2", role: "ADMIN_HR" });
    (prisma.auditLog.findFirst as any).mockResolvedValueOnce(null);
    (prisma.auditLog.create as any).mockResolvedValueOnce({});

    const res = await request(app)
      .patch("/api/v2/admin/users/user-2/role")
      .send({ role: "ADMIN_HR" });
    expect(res.status).toBe(200);
  });
});

describe("settings endpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsSuperadmin();
  });

  it("GET /api/v2/admin/settings returns all settings", async () => {
    (prisma.systemSetting.findMany as any).mockResolvedValueOnce([
      { key: "events_registration_open", value: true, description: "d", updatedById: null, updatedAt: new Date() },
    ]);
    const res = await request(app).get("/api/v2/admin/settings");
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toHaveLength(1);
  });

  it("PATCH /api/v2/admin/settings accepts whitelisted booleans and audits", async () => {
    (prisma.systemSetting.upsert as any).mockResolvedValue({});
    (prisma.auditLog.findFirst as any).mockResolvedValueOnce(null);
    (prisma.auditLog.create as any).mockResolvedValue({});
    (prisma.systemSetting.findMany as any).mockResolvedValueOnce([
      { key: "merch_shop_open", value: true, description: "d", updatedById: null, updatedAt: new Date() },
    ]);

    const res = await request(app)
      .patch("/api/v2/admin/settings")
      .send({ merch_shop_open: true });

    expect(res.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "merch_shop_open" } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SETTING_UPDATE" }) })
    );
  });

  it("PATCH rejects unknown setting keys with 400 (field-level error)", async () => {
    const res = await request(app)
      .patch("/api/v2/admin/settings")
      .send({ bogus_key: true });
    expect(res.status).toBe(400);
    expect(res.body.errors.bogus_key).toBeDefined();
    expect(res.body.errors.bogus_key.join(" ")).toContain("Unknown setting key");
  });

  it("PATCH rejects non-boolean values with 400", async () => {
    const res = await request(app)
      .patch("/api/v2/admin/settings")
      .send({ merch_shop_open: "yes" });
    expect(res.status).toBe(400);
  });

  it("PATCH emits SYSTEM_MAINTENANCE audit when maintenance_mode toggles", async () => {
    (prisma.systemSetting.upsert as any).mockResolvedValue({});
    (prisma.auditLog.findFirst as any).mockResolvedValue(null);
    (prisma.auditLog.create as any).mockResolvedValue({});
    (prisma.systemSetting.findMany as any).mockResolvedValueOnce([]);

    const res = await request(app)
      .patch("/api/v2/admin/settings")
      .send({ maintenance_mode: true });

    expect(res.status).toBe(200);
    const createCalls = (prisma.auditLog.create as any).mock.calls;
    const actions = createCalls.map((c: any) => c[0].data.action);
    expect(actions).toContain("SETTING_UPDATE");
    expect(actions).toContain("SYSTEM_MAINTENANCE");
  });
});

describe("GET /api/v2/admin/audit-logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsSuperadmin();
  });

  it("returns paginated logs with chain integrity", async () => {
    (prisma.auditLog.count as any).mockResolvedValueOnce(0);
    // findMany is called once for the page list and once inside verifyAuditChain,
    // so it must resolve persistently rather than once.
    (prisma.auditLog.findMany as any).mockResolvedValue([]);
    const res = await request(app).get("/api/v2/admin/audit-logs?page=1&pageSize=50");
    expect(res.status).toBe(200);
    expect(res.body.data.integrity.integrityOk).toBe(true);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("rejects an invalid from date with 400", async () => {
    const res = await request(app).get("/api/v2/admin/audit-logs?from=not-a-date");
    expect(res.status).toBe(400);
  });
});
