import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { extractFields } from "../services/ocr.service";
import { pngFixture, gifFixture } from "./helpers";
import app from "../app";

describe("POST /api/v1/ocr/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when Content-Type is not multipart/form-data", async () => {
    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Content-Type must be multipart/form-data");
  });

  it("returns 400 for non-JPEG/PNG file", async () => {
    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", gifFixture, {
        filename: "test.gif",
        contentType: "image/gif",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid file type (image/gif)");
  });

  it("returns 200 with OCR data on successful extraction", async () => {
    (extractFields as any).mockResolvedValueOnce({
      extracted: true,
      studentId: "QCU-2020-001",
      lastName: "Doe",
      firstName: "John",
      middleInitial: "M",
    });

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", pngFixture, {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.studentId).toBe("QCU-2020-001");
    expect(res.body.data.ocrSessionId).toBeDefined();
    expect(res.body.data.manualRequired).toBe(false);
  });

  it("returns 422 when OCR extraction fails but retries remain", async () => {
    (extractFields as any).mockResolvedValue({
      extracted: false,
      studentId: null,
      lastName: null,
      firstName: null,
      middleInitial: null,
    });

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", pngFixture, {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.data.manualRequired).toBe(false);
    expect(res.body.data.attemptsRemaining).toBeGreaterThan(0);
  });

  it("returns 422 with manualRequired after max failures", async () => {
    (extractFields as any).mockResolvedValue({
      extracted: false,
      studentId: null,
      lastName: null,
      firstName: null,
      middleInitial: null,
    });

    // Exhaust all attempts
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/ocr/verify")
        .attach("image", pngFixture, {
          filename: "id.jpg",
          contentType: "image/jpeg",
        });
    }

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", pngFixture, {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(422);
    expect(res.body.data.manualRequired).toBe(true);
    expect(res.body.data.attemptsRemaining).toBe(0);
  });

  it("rate limits after 10 requests in quick succession", async () => {
    (extractFields as any).mockResolvedValue({
      extracted: true,
      studentId: "QCU-2020-001",
      lastName: "Doe",
      firstName: "John",
      middleInitial: "M",
    });

    // Send 11 requests quickly
    for (let i = 0; i < 11; i++) {
      await request(app)
        .post("/api/v1/ocr/verify")
        .attach("image", pngFixture, {
          filename: "id.jpg",
          contentType: "image/jpeg",
        });
    }

    // The 11th should be rate-limited
    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", pngFixture, {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(429);
  });
});
