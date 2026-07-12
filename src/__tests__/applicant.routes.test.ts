import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import {
  mockApplicantInput,
  mockApplicantRecord,
  authAdminHR,
  authUnauthenticated,
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

function setupAdminHR(): void {
  mockAuthMiddleware.mockImplementation(authAdminHR);
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireAdminHR.mockImplementation((_req: any, _res: any, next: any) => next());
}

function setupUnauthenticated(): void {
  mockAuthMiddleware.mockImplementation(authUnauthenticated);
  mockRequireAuth.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(401).json({ success: false, error: "Unauthorized - authentication required" });
  });
  mockRequireAdminHR.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(403).json({ success: false, error: "Forbidden - ADMIN_HR access required" });
  });
}

// Helper to build a multipart form for applicant creation
function buildApplicantForm(overrides: Record<string, string> = {}) {
  const fields = { ...mockApplicantInput, ...overrides };
  let r = request(app).post("/api/v1/applicants");
  for (const [key, value] of Object.entries(fields)) {
    r = r.field(key, value);
  }
  r = r
    .attach("certificateOfRegistration", Buffer.from("fake pdf"), {
      filename: "cor.pdf",
      contentType: "application/pdf",
    })
    .attach("curriculumVitae", Buffer.from("fake pdf"), {
      filename: "cv.pdf",
      contentType: "application/pdf",
    });
  return r;
}

describe("POST /api/v1/applicants (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUnauthenticated();
  });

  it("returns 400 when no files are attached", async () => {
    const res = await request(app)
      .post("/api/v1/applicants")
      .field("email", "test@example.com");

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing OCR session", async () => {
    const res = await buildApplicantForm({ ocrSessionId: "00000000-0000-4000-8000-000000009999" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("OCR session expired");
  });

  it("creates applicant successfully with valid OCR session", async () => {
    setupUnauthenticated();
    const session = ocrStore.createSession({
      studentId: "20-0001",
      lastName: "Doe",
      firstName: "John",
      middleInitial: "M",
      manualRequired: false,
      attemptsRemaining: 3,
      imagePath: "/uploads/ocr/test.jpg",
      digitCorrectedInName: false,
    });
    (prisma.applicant.create as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      id: "new-applicant-id",
    });
    const res = await buildApplicantForm({ ocrSessionId: session.ocrSessionId });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("id");
  });
});

describe("GET /api/v1/applicants (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("lists applicants with default pagination", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(1);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([mockApplicantRecord]);
    const res = await request(app).get("/api/v1/applicants");
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it("filters by status query param", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?status=APPROVED");
    expect(res.status).toBe(200);
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupUnauthenticated();
    const res = await request(app).get("/api/v1/applicants");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/applicants/:applicantId (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("returns applicant by ID", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(mockApplicantRecord);
    const res = await request(app).get("/api/v1/applicants/applicant-1");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("applicant-1");
  });

  it("returns 404 when applicant not found", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app).get("/api/v1/applicants/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupUnauthenticated();
    const res = await request(app).get("/api/v1/applicants/applicant-1");
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/applicants/:applicantId/status (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("updates applicant status", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(mockApplicantRecord);
    (prisma.applicant.update as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      status: "APPROVED",
    });
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/status")
      .send({ status: "APPROVED" });
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid status value", async () => {
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/status")
      .send({ status: "INVALID" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when applicant not found", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/status")
      .send({ status: "APPROVED" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/applicants/:applicantId (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("updates applicant details", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(mockApplicantRecord);
    (prisma.applicant.update as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      lastName: "Updated",
    });
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1")
      .send({ lastName: "Updated" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when applicant not found", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1")
      .send({ lastName: "Updated" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/applicants/:applicantId/approve-id (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("approves a manual ID applicant", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      manual_application: true,
    });
    (prisma.applicant.update as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      manual_application: false,
      status: "PENDING_REVIEW",
    });
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/approve-id")
      .send({ action: "approve", studentId: "20-0001" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("ID approved");
  });

  it("rejects a manual ID applicant", async () => {
    (prisma.applicant.findUnique as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      manual_application: true,
    });
    (prisma.applicant.update as any).mockResolvedValueOnce({
      ...mockApplicantRecord,
      status: "REJECTED",
    });
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/approve-id")
      .send({ action: "reject" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("rejected");
  });

  it("returns 400 for invalid action", async () => {
    const res = await request(app)
      .patch("/api/v1/applicants/applicant-1/approve-id")
      .send({ action: "invalid" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/applicants/resend-setup-link (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUnauthenticated();
  });

  it("returns 400 for missing email", async () => {
    const res = await request(app)
      .post("/api/v1/applicants/resend-setup-link")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain("Email is required");
  });

  it("returns 200 (always succeeds for privacy)", async () => {
    (prisma.applicant.findFirst as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/api/v1/applicants/resend-setup-link")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
  });
});
