import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createHash } from "node:crypto";
import { prisma } from "../config/database";
import { auth } from "../config/auth";
import { signPasswordResetToken, verifyPasswordResetToken } from "../utils/token";
import { sendPasswordResetEmail } from "../services/email.service";
import { authUnauthenticated } from "./helpers";

// ── Auth Mock Setup ──────────────────────────────────────────────────────
const { mockAuthMiddleware, mockRequireAuth } = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

// App imports all route files at load time, so the mock must expose every
// guard export (only authMiddleware + requireAuth are exercised here).
vi.mock("../routes/authMiddleware", () => ({
  authMiddleware: mockAuthMiddleware,
  requireAuth: mockRequireAuth,
  requireAdminHR: vi.fn(),
  requireAdminLogistics: vi.fn(),
  requireAnyAdmin: vi.fn(),
  requireMemberOrAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
  requireAdminFinance: vi.fn(),
  requireAdminFinanceHead: vi.fn(),
  requireAdminLogisticsHead: vi.fn(),
}));

// ── Password Hashing Mock ────────────────────────────────────────────────
const { mockHashPassword, mockVerifyPassword } = vi.hoisted(() => ({
  mockHashPassword: vi.fn(async (password: string) => `hash:${password}`),
  mockVerifyPassword: vi.fn(async () => true),
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

import app from "../app";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function setupAuthenticated(userId = "user-1", role = "APPLICANT"): void {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = userId;
    req.userRole = role;
    next();
  });
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
}

function setupUnauthenticated(): void {
  mockAuthMiddleware.mockImplementation(authUnauthenticated);
  mockRequireAuth.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(401).json({ success: false, message: "Unauthorized - authentication required" });
  });
}

const GENERIC = "If an account exists, a password reset link has been sent.";

describe("POST /api/v1/auth/student/forgot-password (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("sends a reset link for an existing student account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "juan@example.com",
      role: "APPLICANT",
    } as any);
    vi.mocked(signPasswordResetToken).mockResolvedValue("reset-token-abc");

    const res = await request(app)
      .post("/api/v1/auth/student/forgot-password")
      .send({ email: "juan@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe(GENERIC);
    expect(prisma.verification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          identifier: "password-reset:user-1",
          value: hashToken("reset-token-abc"),
          expiresAt: expect.any(Date),
        },
      })
    );
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("juan@example.com", "reset-token-abc", "student");
  });

  it("does not reveal whether an unknown email is registered (anti-enumeration)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/student/forgot-password")
      .send({ email: "ghost@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(prisma.verification.create).not.toHaveBeenCalled();
  });

  it("returns validation errors for a malformed email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/student/forgot-password")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toHaveProperty("email");
  });
});

describe("POST /api/v1/auth/admin/forgot-password (role boundary)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("sends a link for an existing admin account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-1",
      email: "admin@msc-qcu.tech",
      role: "ADMIN_HR",
    } as any);
    vi.mocked(signPasswordResetToken).mockResolvedValue("admin-token");

    const res = await request(app)
      .post("/api/v1/auth/admin/forgot-password")
      .send({ email: "admin@msc-qcu.tech" });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("admin@msc-qcu.tech", "admin-token", "admin");
  });

  it("rejects a non-admin account but still replies generically", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "juan@example.com",
      role: "APPLICANT",
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/admin/forgot-password")
      .send({ email: "juan@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(GENERIC);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/validate-reset-token (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("returns the account email for a valid, unexpired token", async () => {
    vi.mocked(verifyPasswordResetToken).mockResolvedValue({
      userId: "user-1",
      email: "juan@example.com",
      purpose: "password-reset",
    });
    vi.mocked(prisma.verification.findFirst).mockResolvedValue({
      identifier: "password-reset:user-1",
      value: hashToken("good-token"),
      expiresAt: new Date(Date.now() + 60_000),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/validate-reset-token")
      .send({ token: "good-token" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { email: "juan@example.com" } });
  });

  it("rejects an invalid token", async () => {
    vi.mocked(verifyPasswordResetToken).mockRejectedValue(new Error("bad token"));

    const res = await request(app)
      .post("/api/v1/auth/validate-reset-token")
      .send({ token: "bad-token" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid or expired reset link. Please request a new one.");
  });

  it("rejects an expired record (DB-level TTL backstop)", async () => {
    vi.mocked(verifyPasswordResetToken).mockResolvedValue({
      userId: "user-1",
      email: "juan@example.com",
      purpose: "password-reset",
    });
    vi.mocked(prisma.verification.findFirst).mockResolvedValue({
      value: hashToken("stale-token"),
      expiresAt: new Date(Date.now() - 60_000),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/validate-reset-token")
      .send({ token: "stale-token" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/reset-password (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("updates the password and invalidates all sessions", async () => {
    vi.mocked(verifyPasswordResetToken).mockResolvedValue({
      userId: "user-1",
      email: "juan@example.com",
      purpose: "password-reset",
    });
    vi.mocked(prisma.verification.findFirst).mockResolvedValue({
      value: hashToken("good-token"),
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      providerId: "credential",
      password: "old-hash",
    } as any);
    mockVerifyPassword.mockResolvedValue(false);
    mockHashPassword.mockResolvedValue("fresh-scrypt-hash");

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "good-token", newPassword: "NewPass123!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { password: "fresh-scrypt-hash" },
    });
    expect(prisma.verification.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "password-reset:user-1" },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("rejects an already-consumed token (no Verification row)", async () => {
    vi.mocked(verifyPasswordResetToken).mockResolvedValue({
      userId: "user-1",
      email: "juan@example.com",
      purpose: "password-reset",
    });
    vi.mocked(prisma.verification.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "used-token", newPassword: "NewPass123!" });

    expect(res.status).toBe(400);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects a short password with field-level validation errors", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "good-token", newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("newPassword");
  });

  it("rejects a new password identical to the current account password", async () => {
    vi.mocked(verifyPasswordResetToken).mockResolvedValue({
      userId: "user-1",
      email: "juan@example.com",
      purpose: "password-reset",
    });
    vi.mocked(prisma.verification.findFirst).mockResolvedValue({
      value: hashToken("good-token"),
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      providerId: "credential",
      password: "stored-hash",
    } as any);
    mockVerifyPassword.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "good-token", newPassword: "OldPass123" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("New password cannot be the same as your current password.");
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/change-password (authenticated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated("user-1", "MEMBER");
  });

  it("rejects an incorrect current password", async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      providerId: "credential",
      password: "stored-hash",
    } as any);
    mockVerifyPassword.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "WrongPass1", newPassword: "NewPass123!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Current password is incorrect.");
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects a new password identical to the current password", async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      providerId: "credential",
      password: "stored-hash",
    } as any);
    mockVerifyPassword.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "SamePass123", newPassword: "SamePass123" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("New password cannot be the same as your current password.");
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("updates the password and keeps only the current session", async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      providerId: "credential",
      password: "stored-hash",
    } as any);
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("hash-scrypt-1");
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: { id: "session-here" },
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "OldPass123", newPassword: "NewPass123!" });

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { password: "hash-scrypt-1" },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", NOT: { id: "session-here" } },
    });
  });

  it("blocks unauthenticated requests", async () => {
    setupUnauthenticated();

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "OldPass123", newPassword: "NewPass123!" });

    expect(res.status).toBe(401);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});