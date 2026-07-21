import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { auth } from "../config/auth";
import app from "../app";

describe("POST /api/auth/sign-up/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email: "not-an-email",
        password: "password123",
        firstName: "Test",
        lastName: "User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Invalid email format");
  });

  it("returns 400 for short password", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email: "test@example.com",
        password: "short",
        firstName: "Test",
        lastName: "User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Password must be at least 8 characters");
  });

  it("returns 400 if studentId already taken", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ id: "existing-id" });

    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email: "test@example.com",
        password: "password123",
        firstName: "Test",
        lastName: "User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Student ID already taken");
  });

  it("handles Better Auth 'Failed to create user' error", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const mockResponse = new Response(
      JSON.stringify({ message: "Failed to create user" }),
      { status: 422, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email: "test@example.com",
        password: "password123",
        firstName: "Test",
        lastName: "User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Failed to create user. Please check your input.");
  });

  it("calls auth.handler when validation passes", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "new-id", email: "test@example.com" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({
        email: "test@example.com",
        password: "password123",
        firstName: "Test",
        lastName: "User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

describe("POST /api/v1/auth/student/sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "bad", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toContain("Invalid email format");
  });

  it("returns 403 when ADMIN_HR tries to sign in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "ADMIN_HR" });

    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Admin accounts");
  });

  it("returns 403 when ADMIN_LOGISTICS tries to sign in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "ADMIN_LOGISTICS" });

    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Admin accounts");
  });

  it("allows APPLICANT sign-in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "APPLICANT" });
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "applicant-id", role: "APPLICANT" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "student@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });

  it("allows MEMBER sign-in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "MEMBER" });
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "member-id", role: "MEMBER" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "member@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });

  it("allows sign-in when user does not exist yet (passes through to Better Auth)", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "new-id" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/v1/auth/student/sign-in")
      .send({ email: "new@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

describe("POST /api/v1/auth/admin/sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "bad", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toContain("Invalid email format");
  });

  it("returns 403 when APPLICANT tries to sign in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "APPLICANT" });

    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "student@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Access denied");
  });

  it("returns 403 when MEMBER tries to sign in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "MEMBER" });

    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "member@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Access denied");
  });

  it("returns 403 when user does not exist", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "unknown@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Access denied");
  });

  it("allows ADMIN_HR sign-in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "ADMIN_HR" });
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "admin-hr-id", role: "ADMIN_HR" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });

  it("allows ADMIN_LOGISTICS sign-in", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({ role: "ADMIN_LOGISTICS" });
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "admin-lg-id", role: "ADMIN_LOGISTICS" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/v1/auth/admin/sign-in")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/sign-in/email (generic — disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with message directing to portal-specific endpoints", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Direct sign-in is not available");
    expect(auth.handler).not.toHaveBeenCalled();
  });
});
