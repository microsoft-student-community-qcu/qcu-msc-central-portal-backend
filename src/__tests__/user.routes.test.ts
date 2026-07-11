import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { verifySetupToken } from "../utils/token";
import {
  mockUserRecord,
  authUnauthenticated,
  authApplicant,
} from "./helpers";

// ── Auth Mock Setup ──────────────────────────────────────────────────────
const {
  mockAuthMiddleware,
  mockRequireAuth,
  mockRequireAdminHR,
  mockRequireAdminLogistics,
  mockRequireAnyAdmin,
  mockRequireMemberOrAdmin,
} = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRequireAdminHR: vi.fn(),
  mockRequireAdminLogistics: vi.fn(),
  mockRequireAnyAdmin: vi.fn(),
  mockRequireMemberOrAdmin: vi.fn(),
}));

vi.mock("../routes/authMiddleware", () => ({
  authMiddleware: mockAuthMiddleware,
  requireAuth: mockRequireAuth,
  requireAdminHR: mockRequireAdminHR,
  requireAdminLogistics: mockRequireAdminLogistics,
  requireAnyAdmin: mockRequireAnyAdmin,
  requireMemberOrAdmin: mockRequireMemberOrAdmin,
}));

import app from "../app";

function setupAsRole(role: string): void {
  const userId = role === "APPLICANT" ? "applicant-id" : role === "ADMIN_HR" ? "admin-hr-id" : "applicant-id";
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = userId;
    req.userRole = role;
    next();
  });
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireAdminHR.mockImplementation((req: any, res: any, _next: any) => {
    if (req.userRole !== "ADMIN_HR") {
      res.status(403).json({ success: false, error: "Forbidden - ADMIN_HR access required" });
    } else {
      _next();
    }
  });
}

function setupUnauthenticated(): void {
  mockAuthMiddleware.mockImplementation(authUnauthenticated);
  mockRequireAuth.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(401).json({ success: false, error: "Unauthorized - authentication required" });
  });
}

describe("POST /api/v1/users/validate-setup-token (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUnauthenticated();
  });

  it("returns 400 for missing token", async () => {
    const res = await request(app)
      .post("/api/v1/users/validate-setup-token")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Token is required");
  });

  it("returns 400 for invalid or expired token", async () => {
    (verifySetupToken as any).mockRejectedValueOnce(new Error("Invalid token"));
    const res = await request(app)
      .post("/api/v1/users/validate-setup-token")
      .send({ token: "invalid-token" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Invalid or expired setup link. Please request a new one.");
  });

  it("returns 400 if applicant already has userId", async () => {
    (verifySetupToken as any).mockResolvedValueOnce({
      applicantId: "applicant-1",
      email: "test@example.com",
      purpose: "password-setup",
    });
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      id: "applicant-1",
      userId: "user-1",
    });
    const res = await request(app)
      .post("/api/v1/users/validate-setup-token")
      .send({ token: "valid-token" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("This setup link has already been used. Please sign in instead.");
  });

  it("returns 200 with applicant data for valid token", async () => {
    (verifySetupToken as any).mockResolvedValueOnce({
      applicantId: "applicant-1",
      email: "test@example.com",
      purpose: "password-setup",
    });
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      id: "applicant-1",
      userId: null,
    });
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      email: "test@example.com",
      firstName: "John",
      middleInitial: "M",
      lastName: "Doe",
      studentId: "20-0001",
    });
    const res = await request(app)
      .post("/api/v1/users/validate-setup-token")
      .send({ token: "valid-token" });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("test@example.com");
    expect(res.body.data.name).toBe("John M Doe");
  });
});

describe("GET /api/v1/users/me (authenticated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAsRole("APPLICANT");
  });

  it("returns current user profile", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(mockUserRecord);
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("john.doe@example.com");
  });

  it("returns 401 when not authenticated", async () => {
    setupUnauthenticated();
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not found", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/users/link-applicant (authenticated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAsRole("APPLICANT");
  });

  it("links an applicant to the user", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      id: "applicant-1",
      userId: null,
      email: "john.doe@example.com",
    });
    (prisma.user.findUnique as any).mockResolvedValueOnce(mockUserRecord);
    (prisma.applicant.update as any).mockResolvedValueOnce({ userId: "user-1" });
    const res = await request(app)
      .post("/api/v1/users/link-applicant")
      .send({ applicantId: "applicant-1" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("linked");
  });

  it("returns 400 when body is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/users/link-applicant")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when applicant not found", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/api/v1/users/link-applicant")
      .send({ applicantId: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when applicant already linked", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      id: "applicant-1",
      userId: "other-user",
      email: "test@example.com",
    });
    const res = await request(app)
      .post("/api/v1/users/link-applicant")
      .send({ applicantId: "applicant-1" });
    expect(res.status).toBe(409);
  });

  it("returns 400 when emails do not match", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      id: "applicant-1",
      userId: null,
      email: "other@example.com",
    });
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      ...mockUserRecord,
      email: "john.doe@example.com",
    });
    const res = await request(app)
      .post("/api/v1/users/link-applicant")
      .send({ applicantId: "applicant-1" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/users/:userId/role (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAsRole("ADMIN_HR");
  });

  it("updates a user's role", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(mockUserRecord);
    (prisma.user.update as any).mockResolvedValueOnce({
      ...mockUserRecord,
      role: "MEMBER",
    });
    const res = await request(app)
      .patch("/api/v1/users/user-1/role")
      .send({ role: "MEMBER" });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("MEMBER");
  });

  it("returns 400 for invalid role", async () => {
    const res = await request(app)
      .patch("/api/v1/users/user-1/role")
      .send({ role: "INVALID" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/users/user-1/role")
      .send({ role: "MEMBER" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupAsRole("APPLICANT");
    const res = await request(app)
      .patch("/api/v1/users/user-1/role")
      .send({ role: "MEMBER" });
    expect(res.status).toBe(403);
  });
});
