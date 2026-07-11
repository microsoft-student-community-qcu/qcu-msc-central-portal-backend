import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import path from "node:path";
import { extractFields } from "../services/ocr.service";
import app from "../app";

describe("POST /api/v1/ocr/verify", () => {
  const fakeImagePath = path.join(__dirname, "..", "..", "test-fixtures", "test-id.jpg");

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
      .attach("image", Buffer.from("fake image data"), {
        filename: "test.gif",
        contentType: "image/gif",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Image must be JPEG or PNG");
  });

  it("returns 200 with OCR data on successful extraction", async () => {
    (extractFields as any).mockResolvedValueOnce({
      extracted: true,
      studentId: "QCU-2020-001",
      lastName: "Doe",
      firstName: "John",
      middleInitial: "M",
      fullName: "John M Doe",
    });

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", Buffer.from("fake jpeg data"), {
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
      fullName: null,
    });

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", Buffer.from("fake jpeg data"), {
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
      fullName: null,
    });

    // Exhaust all attempts
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/ocr/verify")
        .attach("image", Buffer.from("fake jpeg data"), {
          filename: "id.jpg",
          contentType: "image/jpeg",
        });
    }

    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", Buffer.from("fake jpeg data"), {
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
      fullName: "John M Doe",
    });

    // Send 11 requests quickly
    for (let i = 0; i < 11; i++) {
      await request(app)
        .post("/api/v1/ocr/verify")
        .attach("image", Buffer.from("fake jpeg data"), {
          filename: "id.jpg",
          contentType: "image/jpeg",
        });
    }

    // The 11th should be rate-limited
    const res = await request(app)
      .post("/api/v1/ocr/verify")
      .attach("image", Buffer.from("fake jpeg data"), {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(429);
  });
});
