import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import app from "../app";

describe("GET /", () => {
  it("returns API info", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "QCU MSC Central Portal API is running.");
    expect(res.body).toHaveProperty("version");
    expect(res.body).toHaveProperty("endpoints");
  });
});

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when DB is connected", async () => {
    (prisma.$queryRaw as any).mockResolvedValueOnce([{ 1: 1 }]);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "healthy", database: "connected" });
  });

  it("returns unhealthy when DB is disconnected", async () => {
    (prisma.$queryRaw as any).mockRejectedValueOnce(new Error("Connection refused"));
    const res = await request(app).get("/health");
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.database).toBe("disconnected");
    expect(res.body.error).toBe("Connection refused");
  });
});

describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Endpoint not found" });
  });
});
