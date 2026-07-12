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
        name: "Test User",
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
        name: "Test User",
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
        name: "Test User",
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
        name: "Test User",
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
        name: "Test User",
        studentId: "QCU-2020-001",
      });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/sign-in/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "bad", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Invalid email format");
  });

  it("calls auth.handler when validation passes", async () => {
    const mockResponse = new Response(
      JSON.stringify({ user: { id: "test-id" }, session: { id: "session-id" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    (auth.handler as any).mockResolvedValueOnce(mockResponse);

    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});
