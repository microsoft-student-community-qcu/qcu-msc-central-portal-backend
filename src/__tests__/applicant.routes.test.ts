import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import {
  mockApplicantInput,
  mockApplicantRecord,
  authAdminHR,
  authUnauthenticated,
  pdfFixture,
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
    .attach("certificateOfRegistration", pdfFixture, {
      filename: "cor.pdf",
      contentType: "application/pdf",
    })
    .attach("curriculumVitae", pdfFixture, {
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

  it("searches across name, email, studentId, college, and program fields", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?search=juan");
    expect(res.status).toBe(200);

    const expectedWhere = {
      OR: [
        { firstName: { contains: "juan" } },
        { lastName: { contains: "juan" } },
        { email: { contains: "juan" } },
        { studentId: { contains: "juan" } },
        { college: { contains: "juan" } },
        { program: { contains: "juan" } },
        { section: { contains: "juan" } },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("maps a search term to campus enum values when it matches", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?search=bartolome");
    expect(res.status).toBe(200);

    const expectedWhere = {
      OR: [
        { firstName: { contains: "bartolome" } },
        { lastName: { contains: "bartolome" } },
        { email: { contains: "bartolome" } },
        { studentId: { contains: "bartolome" } },
        { campus: { in: ["SAN_BARTOLOME_MAIN"] } },
        { college: { contains: "bartolome" } },
        { program: { contains: "bartolome" } },
        { section: { contains: "bartolome" } },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("combines search with other filters via AND", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?status=APPROVED&search=delacruz");
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ status: "APPROVED" }],
      OR: [
        { firstName: { contains: "delacruz" } },
        { lastName: { contains: "delacruz" } },
        { email: { contains: "delacruz" } },
        { studentId: { contains: "delacruz" } },
        { college: { contains: "delacruz" } },
        { program: { contains: "delacruz" } },
        { section: { contains: "delacruz" } },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("filters by a single office query param", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?office=LOGISTICS_OFFICE");
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ office: { in: ["LOGISTICS_OFFICE"] } }],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("filters by multiple comma-separated offices", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get(
      "/api/v1/applicants?office=SECRETARIAT_OFFICE,RELATIONS_OFFICE"
    );
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ office: { in: ["SECRETARIAT_OFFICE", "RELATIONS_OFFICE"] } }],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("combines office filter with search", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get(
      "/api/v1/applicants?office=LOGISTICS_OFFICE&search=reyes"
    );
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ office: { in: ["LOGISTICS_OFFICE"] } }],
      OR: [
        { firstName: { contains: "reyes" } },
        { lastName: { contains: "reyes" } },
        { email: { contains: "reyes" } },
        { studentId: { contains: "reyes" } },
        { college: { contains: "reyes" } },
        { program: { contains: "reyes" } },
        { section: { contains: "reyes" } },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("returns 400 for an invalid office filter", async () => {
    const res = await request(app).get("/api/v1/applicants?office=NOT_AN_OFFICE");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid office filter");
  });

  it("filters by multiple comma-separated campuses", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get(
      "/api/v1/applicants?campus=SAN_BARTOLOME_MAIN,BATASAN"
    );
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ campus: { in: ["SAN_BARTOLOME_MAIN", "BATASAN"] } }],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("filters by college with partial match", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?college=Computer");
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ OR: [{ college: { contains: "Computer" } }] }],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("filters by multiple comma-separated colleges", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?college=Computer,Business");
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [
        {
          OR: [
            { college: { contains: "Computer" } },
            { college: { contains: "Business" } },
          ],
        },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("filters by program with partial match", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/applicants?program=Bachelor");
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [{ OR: [{ program: { contains: "Bachelor" } }] }],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("combines college filter with search and office", async () => {
    (prisma.applicant.count as any).mockResolvedValueOnce(0);
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get(
      "/api/v1/applicants?office=LOGISTICS_OFFICE&college=Computer&search=reyes"
    );
    expect(res.status).toBe(200);

    const expectedWhere = {
      AND: [
        { office: { in: ["LOGISTICS_OFFICE"] } },
        { OR: [{ college: { contains: "Computer" } }] },
      ],
      OR: [
        { firstName: { contains: "reyes" } },
        { lastName: { contains: "reyes" } },
        { email: { contains: "reyes" } },
        { studentId: { contains: "reyes" } },
        { college: { contains: "reyes" } },
        { program: { contains: "reyes" } },
        { section: { contains: "reyes" } },
      ],
    };
    expect(prisma.applicant.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.applicant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("returns 400 for an invalid campus filter", async () => {
    const res = await request(app).get("/api/v1/applicants?campus=NOT_A_CAMPUS");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid campus filter");
  });

  it("returns 400 for a college filter with no usable values", async () => {
    const res = await request(app).get("/api/v1/applicants?college=,,,");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid college filter");
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupUnauthenticated();
    const res = await request(app).get("/api/v1/applicants");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/applicants/counts (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("returns aggregated counts by status with ALL as the sum", async () => {
    (prisma.applicant.groupBy as any).mockResolvedValueOnce([
      { status: "PENDING_REVIEW", _count: { _all: 5 } },
      { status: "APPROVED", _count: { _all: 3 } },
      { status: "FOR_INTERVIEW", _count: { _all: 2 } },
    ]);

    const res = await request(app).get("/api/v1/applicants/counts");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        ALL: 10,
        PENDING_REVIEW: 5,
        APPROVED: 3,
        FOR_INTERVIEW: 2,
        REJECTED: 0,
        CANCELLED: 0,
        RESUBMIT: 0,
      },
      message: "Applicant counts retrieved successfully",
    });
  });

  it("returns zeroed counts when there are no applicants", async () => {
    (prisma.applicant.groupBy as any).mockResolvedValueOnce([]);

    const res = await request(app).get("/api/v1/applicants/counts");

    expect(res.status).toBe(200);
    expect(res.body.data.ALL).toBe(0);
    expect(res.body.data.PENDING_REVIEW).toBe(0);
  });

  it("returns 500 when the database query fails", async () => {
    (prisma.applicant.groupBy as any).mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get("/api/v1/applicants/counts");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal server error");
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupUnauthenticated();

    const res = await request(app).get("/api/v1/applicants/counts");

    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/applicants/dashboard-stats (ADMIN_HR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminHR();
  });

  it("returns pre-aggregated metrics for the dashboard charts", async () => {
    const now = new Date();
    (prisma.applicant.findMany as any).mockResolvedValueOnce([
      { createdAt: now },
      { createdAt: now },
    ]);
    (prisma.applicant.groupBy as any)
      .mockResolvedValueOnce([
        { office: "SECRETARIAT_OFFICE", _count: { _all: 4 } },
        { office: "FINANCE_OFFICE", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([{ campus: "SAN_BARTOLOME_MAIN", _count: { _all: 5 } }])
      .mockResolvedValueOnce([
        { manual_application: false, _count: { _all: 8 } },
        { manual_application: true, _count: { _all: 3 } },
      ]);

    const res = await request(app).get("/api/v1/applicants/dashboard-stats");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Growth: exactly 6 zero-filled months, with the current month counting
    // both createdAt rows.
    expect(res.body.data.applicationGrowth).toHaveLength(6);
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const currentBucket = res.body.data.applicationGrowth.find(
      (bucket: { month: string }) => bucket.month === current
    );
    expect(currentBucket.count).toBe(2);

    // Distributions: APPROVED-only groups, sorted alphabetically.
    expect(res.body.data.departmentDistribution).toEqual([
      { department: "FINANCE_OFFICE", count: 2 },
      { department: "SECRETARIAT_OFFICE", count: 4 },
    ]);
    expect(res.body.data.campusDistribution).toEqual([
      { campus: "SAN_BARTOLOME_MAIN", count: 5 },
    ]);
    expect(res.body.data.verificationMethodDistribution).toEqual({
      automatedOcr: 8,
      manualUpload: 3,
    });
    expect(res.body.message).toBe("Dashboard stats retrieved successfully");
  });

  it("zero-fills all six growth months when there are no applications", async () => {
    (prisma.applicant.findMany as any).mockResolvedValueOnce([]);
    (prisma.applicant.groupBy as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await request(app).get("/api/v1/applicants/dashboard-stats");

    expect(res.status).toBe(200);
    expect(res.body.data.applicationGrowth).toHaveLength(6);
    expect(res.body.data.applicationGrowth.every((bucket: { count: number }) => bucket.count === 0)).toBe(
      true
    );
  });

  it("returns 500 when a database query fails", async () => {
    (prisma.applicant.findMany as any).mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get("/api/v1/applicants/dashboard-stats");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal server error");
  });

  it("returns 403 when not ADMIN_HR", async () => {
    setupUnauthenticated();

    const res = await request(app).get("/api/v1/applicants/dashboard-stats");

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
    expect(res.body.errors.email).toContain("Email is required");
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
