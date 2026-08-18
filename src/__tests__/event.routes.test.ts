import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import {
  mockEventRecord,
  mockCancelledEventRecord,
  mockRegistrationRecord,
  authUnauthenticated,
  authAdminLogistics,
  authMember,
} from "./helpers";
import {
  sendEventCancelledEmail,
  resendRegistrationTicketEmail,
} from "../services/email.service";

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

function setupPublic(): void {
  mockAuthMiddleware.mockImplementation(authUnauthenticated);
  mockRequireAuth.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(401).json({ success: false, error: "Unauthorized - authentication required" });
  });
  mockRequireAdminLogistics.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(403).json({ success: false, error: "Forbidden - ADMIN_LOGISTICS access required" });
  });
}

function setupAdminLogistics(): void {
  mockAuthMiddleware.mockImplementation(authAdminLogistics);
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireAdminLogistics.mockImplementation((_req: any, _res: any, next: any) => next());
}

function setupMemberAuth(): void {
  mockAuthMiddleware.mockImplementation(authMember);
  mockRequireAuth.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireMemberOrAdmin.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireAdminLogistics.mockImplementation((_req: any, res: any, _next: any) => {
    res.status(403).json({ success: false, error: "Forbidden - ADMIN_LOGISTICS access required" });
  });
}

describe("GET /api/v1/events (public)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupPublic();
  });

  it("returns list of upcoming events", async () => {
    (prisma.event.findMany as any).mockResolvedValueOnce([mockEventRecord]);
    const res = await request(app).get("/api/v1/events");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("returns empty array when no events", async () => {
    (prisma.event.findMany as any).mockResolvedValueOnce([]);
    const res = await request(app).get("/api/v1/events");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/v1/events/:eventId (public)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupPublic();
  });

  it("returns event by ID", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    const res = await request(app).get("/api/v1/events/event-1");
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Test Event");
    expect(res.body.data.spotsRemaining).toBe(95);
  });

  it("returns 404 when event not found", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app).get("/api/v1/events/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/events/:eventId/register (public + member)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupPublic();
  });

  it("registers a guest with valid OCR session", async () => {
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
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.count as any).mockResolvedValueOnce(50);
    (prisma.registration.findUnique as any).mockResolvedValueOnce(null);
    (prisma.registration.create as any).mockResolvedValueOnce(mockRegistrationRecord);
    const res = await request(app)
      .post("/api/v1/events/event-1/register")
      .send({
        lastName: "Doe",
        firstName: "John",
        email: "john.doe@example.com",
        ocrSessionId: session.ocrSessionId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("approved");
  });

  it("returns 403 for MEMBERS_ONLY event when guest", async () => {
    setupPublic();
    (prisma.event.findUnique as any).mockResolvedValueOnce({
      ...mockEventRecord,
      type: "MEMBERS_ONLY",
    });
    const res = await request(app)
      .post("/api/v1/events/event-1/register")
      .send({
        lastName: "Doe",
        firstName: "John",
        email: "john.doe@example.com",
        ocrSessionId: "00000000-0000-4000-8000-000000000001",
      });
    expect(res.status).toBe(403);
  });

  it("registers a member without OCR", async () => {
    setupMemberAuth();
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.count as any).mockResolvedValueOnce(50);
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: "member-id",
      lastName: "Member",
      firstName: "Test",
      middleInitial: null,
      email: "member@example.com",
    });
    (prisma.registration.findUnique as any).mockResolvedValueOnce(null);
    (prisma.registration.create as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      userId: "member-id",
    });
    const res = await request(app)
      .post("/api/v1/events/event-1/register")
      .send({});
    expect(res.status).toBe(201);
  });

  it("returns 409 when event is at full capacity", async () => {
    setupPublic();
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.count as any).mockResolvedValueOnce(100);
    const res = await request(app)
      .post("/api/v1/events/event-1/register")
      .send({
        lastName: "Doe",
        firstName: "John",
        email: "john.doe@example.com",
        ocrSessionId: "00000000-0000-4000-8000-000000000001",
      });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/v1/events (ADMIN_LOGISTICS)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAdminLogistics();
  });

  it("creates an event", async () => {
    (prisma.event.create as any).mockResolvedValueOnce(mockEventRecord);
    const res = await request(app)
      .post("/api/v1/events")
      .send({
        title: "Test Event",
        date: "2027-01-01T00:00:00.000Z",
        priorityStartDate: "2026-01-01T00:00:00.000Z",
        generalStartDate: "2026-06-01T00:00:00.000Z",
        maxCapacity: 100,
      });
    expect(res.status).toBe(201);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/v1/events")
      .send({ title: "Incomplete" });
    expect(res.status).toBe(400);
  });

  it("returns 403 when not ADMIN_LOGISTICS", async () => {
    setupPublic();
    const res = await request(app)
      .post("/api/v1/events")
      .send({
        title: "Test Event",
        date: "2027-01-01T00:00:00.000Z",
        priorityStartDate: "2026-01-01T00:00:00.000Z",
        generalStartDate: "2026-06-01T00:00:00.000Z",
        maxCapacity: 100,
      });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/events/:eventId/registrations (ADMIN_LOGISTICS)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAdminLogistics();
  });

  it("returns registrations list", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.count as any).mockResolvedValueOnce(1);
    (prisma.registration.findMany as any).mockResolvedValueOnce([mockRegistrationRecord]);
    const res = await request(app).get("/api/v1/events/event-1/registrations");
    expect(res.status).toBe(200);
    expect(res.body.data.registrations).toHaveLength(1);
  });

  it("returns 404 when event not found", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app).get("/api/v1/events/event-1/registrations");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/events/:eventId/registrations/:registrationId/approve (ADMIN_LOGISTICS)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAdminLogistics();
  });

  it("approves a pending registration", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      status: "PENDING_REVIEW",
    });
    (prisma.registration.update as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      status: "APPROVED",
    });
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/reg-1/approve")
      .send({ action: "approve" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("APPROVED");
  });

  it("returns 400 if registration is not pending review", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce(mockRegistrationRecord);
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/reg-1/approve")
      .send({ action: "approve" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/events/:eventId/registrations/checkin (ADMIN_LOGISTICS)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAdminLogistics();
  });

  it("checks in a registration via QR payload", async () => {
    (prisma.registration.findUnique as any).mockResolvedValueOnce(mockRegistrationRecord);
    (prisma.registration.update as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      hasAttended: true,
    });
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/checkin")
      .send({ qrPayload: "qr-uuid-123" });
    expect(res.status).toBe(200);
    expect(res.body.data.hasAttended).toBe(true);
  });

  it("returns 400 when QR payload is missing", async () => {
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/checkin")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid QR payload", async () => {
    (prisma.registration.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/checkin")
      .send({ qrPayload: "invalid" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/events/:eventId/registrations/:registrationId/checkin (ADMIN_LOGISTICS)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAdminLogistics();
  });

  it("checks in a registration manually", async () => {
    (prisma.registration.findUnique as any).mockResolvedValueOnce(mockRegistrationRecord);
    (prisma.registration.update as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      hasAttended: true,
    });
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/reg-1/checkin")
      .send();
    expect(res.status).toBe(200);
    expect(res.body.data.hasAttended).toBe(true);
  });

  it("returns 404 for non-existent registration", async () => {
    (prisma.registration.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/events/event-1/registrations/nonexistent/checkin")
      .send();
    expect(res.status).toBe(404);
  });
});

// ── Event Cancellation (V2 Flow 8) ────────────────────────────────────────

describe("PATCH /api/v1/events/:eventId/cancel (ADMIN_LOGISTICS)", () => {
  const reason = "Venue became unavailable due to a scheduling conflict.";

  beforeEach(() => {
    vi.restoreAllMocks();
    // clearAllMocks in addition to restoreAllMocks: the prisma/email mocks are
    // created in setup.ts, so restoreAllMocks leaves their call history intact
    // and the `not.toHaveBeenCalled()` assertions below would see earlier calls.
    vi.clearAllMocks();
    setupAdminLogistics();
  });

  it("soft-deletes the event and notifies pending + approved registrants", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.event.update as any).mockResolvedValueOnce({
      ...mockEventRecord,
      isCancelled: true,
      cancellationReason: reason,
      cancelledAt: new Date(),
    });
    (prisma.registration.findMany as any).mockResolvedValueOnce([
      { email: "approved@example.com" },
      { email: "pending@example.com" },
    ]);

    const res = await request(app)
      .patch("/api/v1/events/event-1/cancel")
      .send({ reason });

    expect(res.status).toBe(200);
    expect(res.body.data.isCancelled).toBe(true);
    expect(res.body.data.cancellationReason).toBe(reason);
    expect(res.body.data.notifiedRegistrants).toBe(2);

    // Soft delete only — the row is updated, never deleted.
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1" },
        data: expect.objectContaining({ isCancelled: true, cancellationReason: reason }),
      })
    );

    // Only PENDING_REVIEW + APPROVED registrants are queried for emails.
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "event-1", status: { in: ["APPROVED", "PENDING_REVIEW"] } },
      })
    );

    expect(sendEventCancelledEmail).toHaveBeenCalledTimes(2);
    expect(sendEventCancelledEmail).toHaveBeenCalledWith(
      "approved@example.com",
      mockEventRecord.title,
      reason
    );
  });

  it("returns 400 when no reason is supplied", async () => {
    const res = await request(app).patch("/api/v1/events/event-1/cancel").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation error");
    expect(res.body.errors.reason).toBeDefined();
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the reason is too short", async () => {
    const res = await request(app)
      .patch("/api/v1/events/event-1/cancel")
      .send({ reason: "nope" });
    expect(res.status).toBe(400);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent event", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/v1/events/nonexistent/cancel")
      .send({ reason });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the event is already cancelled", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockCancelledEventRecord);
    const res = await request(app)
      .patch("/api/v1/events/event-1/cancel")
      .send({ reason });
    expect(res.status).toBe(409);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe("Cancelled events are hidden from public endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    setupPublic();
  });

  it("excludes cancelled events from the public feed query", async () => {
    (prisma.event.findMany as any).mockResolvedValueOnce([]);
    await request(app).get("/api/v1/events");
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isCancelled: false }),
      })
    );
  });

  it("returns 404 on the detail endpoint for a cancelled event", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockCancelledEventRecord);
    const res = await request(app).get("/api/v1/events/event-1");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("This event has been cancelled.");
  });

  it("refuses registration for a cancelled event", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockCancelledEventRecord);
    const res = await request(app).post("/api/v1/events/event-1/register").send({});
    expect(res.status).toBe(409);
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });
});

// ── QR Ticket Re-send (V2 Flow 7 edge case) ───────────────────────────────

describe("POST /api/v1/events/:eventId/registrations/:registrationId/resend-ticket", () => {
  const url = "/api/v1/events/event-1/registrations/reg-1/resend-ticket";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    setupAdminLogistics();
  });

  it("re-sends the existing QR payload to an approved registrant", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce(mockRegistrationRecord);

    const res = await request(app).post(url).send();

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(mockRegistrationRecord.email);
    // The stored payload is reused, never regenerated.
    expect(resendRegistrationTicketEmail).toHaveBeenCalledWith(
      mockRegistrationRecord.email,
      mockEventRecord.title,
      mockRegistrationRecord.qrPayload
    );
  });

  it("returns 400 for a registration that is not approved", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      status: "PENDING_REVIEW",
    });

    const res = await request(app).post(url).send();
    expect(res.status).toBe(400);
    expect(resendRegistrationTicketEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the registration belongs to another event", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce({
      ...mockRegistrationRecord,
      eventId: "event-2",
    });

    const res = await request(app).post(url).send();
    expect(res.status).toBe(404);
  });

  it("returns 409 when the event has been cancelled", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockCancelledEventRecord);
    const res = await request(app).post(url).send();
    expect(res.status).toBe(409);
    expect(resendRegistrationTicketEmail).not.toHaveBeenCalled();
  });

  it("returns 502 when the email provider fails", async () => {
    (prisma.event.findUnique as any).mockResolvedValueOnce(mockEventRecord);
    (prisma.registration.findUnique as any).mockResolvedValueOnce(mockRegistrationRecord);
    (resendRegistrationTicketEmail as any).mockRejectedValueOnce(new Error("SMTP down"));

    const res = await request(app).post(url).send();
    expect(res.status).toBe(502);
  });

  it("returns 403 for non-logistics callers", async () => {
    setupPublic();
    const res = await request(app).post(url).send();
    expect(res.status).toBe(403);
  });
});
