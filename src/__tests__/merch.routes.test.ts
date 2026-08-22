import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../config/database";
import { pngFixture, pdfFixture } from "./helpers";

// ── Auth mock setup (mirrors admin.routes.test.ts) ─────────────────────────
const {
  mockAuthMiddleware,
  mockRequireAuth,
  mockRequireAdminHR,
  mockRequireAdminLogistics,
  mockRequireAnyAdmin,
  mockRequireMemberOrAdmin,
  mockRequireSuperadmin,
  mockRequireAdminFinance,
  mockRequireAdminFinanceHead,
  mockRequireAdminLogisticsHead,
} = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRequireAdminHR: vi.fn(),
  mockRequireAdminLogistics: vi.fn(),
  mockRequireAnyAdmin: vi.fn(),
  mockRequireMemberOrAdmin: vi.fn(),
  mockRequireSuperadmin: vi.fn(),
  mockRequireAdminFinance: vi.fn(),
  mockRequireAdminFinanceHead: vi.fn(),
  mockRequireAdminLogisticsHead: vi.fn(),
}));

vi.mock("../routes/authMiddleware", () => ({
  authMiddleware: mockAuthMiddleware,
  requireAuth: mockRequireAuth,
  requireAdminHR: mockRequireAdminHR,
  requireAdminLogistics: mockRequireAdminLogistics,
  requireAnyAdmin: mockRequireAnyAdmin,
  requireMemberOrAdmin: mockRequireMemberOrAdmin,
  requireSuperadmin: mockRequireSuperadmin,
  requireAdminFinance: mockRequireAdminFinance,
  requireAdminFinanceHead: mockRequireAdminFinanceHead,
  requireAdminLogisticsHead: mockRequireAdminLogisticsHead,
}));

import app from "../app";

// Public requests: authMiddleware sets userId/userRole to null and passes.
function asGuest(): void {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = null;
    req.userRole = null;
    next();
  });
}

// Forbidden guard: return 403 like the real requireRole would.
function denyRole(mock: any): void {
  mock.mockImplementation((_req: any, res: any) => {
    res.status(403).json({ success: false, message: "Forbidden" });
  });
}
function allowRole(mock: any, role = "ADMIN_FINANCE"): void {
  mock.mockImplementation((req: any, _res: any, next: any) => {
    req.userId = `${role}-id`;
    req.userRole = role;
    next();
  });
}

function openShop(): void {
  (prisma.systemSetting.findUnique as any).mockResolvedValue({ value: true });
}
function closeShop(): void {
  (prisma.systemSetting.findUnique as any).mockResolvedValue({ value: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  asGuest();
  // Default: all admin guards pass unless a test overrides them.
  allowRole(mockRequireAdminFinance, "ADMIN_FINANCE");
  allowRole(mockRequireAdminFinanceHead, "ADMIN_FINANCE_HEAD");
});

// ── Public catalog ──────────────────────────────────────────────────────────
describe("GET /api/v2/merch (public catalog)", () => {
  it("returns 503 when the merch shop is closed", async () => {
    closeShop();
    const res = await request(app).get("/api/v2/merch");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it("returns active items with computed stock flags when open", async () => {
    openShop();
    (prisma.merchItem.findMany as any).mockResolvedValue([
      {
        id: "item-1",
        name: "MSC Shirt",
        description: "Cotton tee",
        price: "350.00",
        photos: ["https://blob/merch/a.png"],
        lowStockThreshold: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: [
          { id: "v-s", label: "S", stock: 3 },
          { id: "v-m", label: "M", stock: 0 },
        ],
      },
    ]);

    const res = await request(app).get("/api/v2/merch");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item.price).toBe(350);
    expect(item.variants[0]).toMatchObject({ label: "S", stock: 3, inStock: true, lowStock: true });
    expect(item.variants[1]).toMatchObject({ label: "M", stock: 0, inStock: false, lowStock: false });
  });

  it("hides ARCHIVED items from the detail endpoint", async () => {
    openShop();
    (prisma.merchItem.findUnique as any).mockResolvedValue({ id: "item-1", status: "ARCHIVED", variants: [] });
    const res = await request(app).get("/api/v2/merch/item-1");
    expect(res.status).toBe(404);
  });
});

// ── Order creation (Flow 2) ─────────────────────────────────────────────────
describe("POST /api/v2/merch/orders", () => {
  const validBody = {
    variantId: "v-s",
    quantity: 2,
    studentName: "Jane Doe",
    email: "jane@example.com",
  };

  it("returns 503 when the shop is closed", async () => {
    closeShop();
    const res = await request(app).post("/api/v2/merch/orders").send(validBody);
    expect(res.status).toBe(503);
  });

  it("returns 400 on validation error", async () => {
    openShop();
    const res = await request(app).post("/api/v2/merch/orders").send({ variantId: "v-s" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation error");
    expect(res.body.errors).toBeDefined();
  });

  it("returns 409 when the selected variant is out of stock", async () => {
    openShop();
    (prisma.merchVariant.findUnique as any).mockResolvedValue({
      id: "v-s",
      label: "S",
      stock: 1,
      item: { id: "item-1", name: "Shirt", price: "350.00", status: "ACTIVE" },
    });
    const res = await request(app).post("/api/v2/merch/orders").send(validBody); // qty 2 > stock 1
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no longer available/i);
  });

  it("creates an order and returns the payment payload", async () => {
    openShop();
    (prisma.merchVariant.findUnique as any).mockResolvedValue({
      id: "v-s",
      label: "S",
      stock: 50,
      item: { id: "item-1", name: "Shirt", price: "350.00", status: "ACTIVE" },
    });
    (prisma.merchOrder.count as any).mockResolvedValue(41);
    (prisma.merchOrder.create as any).mockResolvedValue({ orderRef: "MSC-MERCH-2026-0042" });

    const res = await request(app).post("/api/v2/merch/orders").send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.orderRef).toBe("MSC-MERCH-2026-0042");
    expect(res.body.data.amount).toBe(700); // 350 × 2
    expect(res.body.data.gcashNumber).toBe("09171234567");
    expect(res.body.data.gcashQrImageUrl).toContain("org-gcash-qr.png");
  });
});

// ── Order tracking (anti-enumeration) ───────────────────────────────────────
describe("GET /api/v2/merch/orders/:orderRef", () => {
  it("returns 404 when the email does not match the order", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      orderRef: "MSC-MERCH-2026-0042",
      email: "owner@example.com",
      variant: { label: "S", item: { name: "Shirt" } },
      amount: "700.00",
      status: "AWAITING_PAYMENT",
    });
    const res = await request(app)
      .get("/api/v2/merch/orders/MSC-MERCH-2026-0042")
      .query({ email: "attacker@example.com" });
    expect(res.status).toBe(404);
  });

  it("returns the order when the email matches", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      orderRef: "MSC-MERCH-2026-0042",
      studentName: "Jane",
      studentId: null,
      email: "owner@example.com",
      gcashNumber: null,
      quantity: 2,
      amount: "700.00",
      status: "AWAITING_PAYMENT",
      rejectionReason: null,
      financeNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      variant: { label: "S", item: { name: "Shirt" } },
    });
    const res = await request(app)
      .get("/api/v2/merch/orders/MSC-MERCH-2026-0042")
      .query({ email: "OWNER@example.com" }); // case-insensitive
    expect(res.status).toBe(200);
    expect(res.body.data.order.orderRef).toBe("MSC-MERCH-2026-0042");
  });
});

// ── Payment proof (Flow 3) ──────────────────────────────────────────────────
describe("POST /api/v2/merch/orders/:orderRef/payment-proof", () => {
  const order = {
    id: "order-1",
    email: "jane@example.com",
    status: "AWAITING_PAYMENT",
    studentName: "Jane",
  };

  it("auto-rejects a duplicate reference number", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(order);
    (prisma.paymentProofSubmission.findFirst as any).mockResolvedValue({ id: "dup-1" });

    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "1234567890123")
      .attach("screenshot", pngFixture, "proof.png");

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been used/i);
    // Order flipped to REJECTED / DUPLICATE_REFERENCE inside the transaction.
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", rejectionReason: "DUPLICATE_REFERENCE" }),
      })
    );
  });

  it("accepts a unique reference into PENDING_VERIFICATION", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(order);
    (prisma.paymentProofSubmission.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "9876543210001")
      .attach("screenshot", pngFixture, "proof.png");

    expect(res.status).toBe(200);
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_VERIFICATION" }) })
    );
  });

  it("rejects a non-image screenshot (PDF)", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(order);
    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "9876543210001")
      .attach("screenshot", pdfFixture, "proof.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPEG, PNG, or WEBP/i);
  });
});

// ── Finance admin: confirm (atomic stock decrement) ─────────────────────────
describe("POST /api/v2/admin/merch/orders/:orderId/confirm", () => {
  const pendingOrder = {
    id: "order-1",
    orderRef: "MSC-MERCH-2026-0042",
    email: "jane@example.com",
    studentName: "Jane",
    status: "PENDING_VERIFICATION",
    quantity: 2,
    variant: { id: "v-s", label: "S", item: { name: "Shirt" } },
    proofSubmissions: [{ id: "sub-1" }],
  };

  it("confirms and decrements stock when available", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pendingOrder);
    (prisma.merchVariant.updateMany as any).mockResolvedValue({ count: 1 });

    const res = await request(app).post("/api/v2/admin/merch/orders/order-1/confirm");
    expect(res.status).toBe(200);
    expect(prisma.merchVariant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v-s", stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("routes to AWAITING_RESOLUTION (not REJECTED) when the decrement matches no row", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pendingOrder);
    (prisma.merchVariant.updateMany as any).mockResolvedValue({ count: 0 });

    const res = await request(app).post("/api/v2/admin/merch/orders/order-1/confirm");
    expect(res.status).toBe(409);
    // Oversell: paid student must NOT be rejected/told to resubmit — the order
    // awaits their resolution (swap or refund) instead (issue #178).
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AWAITING_RESOLUTION", rejectionReason: "OUT_OF_STOCK" }),
      })
    );
  });

  it("returns 409 when the order is not pending verification", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({ ...pendingOrder, status: "CONFIRMED" });
    const res = await request(app).post("/api/v2/admin/merch/orders/order-1/confirm");
    expect(res.status).toBe(409);
  });
});

// ── Finance admin: reject (auto-reroute + shortfall) ────────────────────────
describe("POST /api/v2/admin/merch/orders/:orderId/reject", () => {
  const pending = {
    id: "order-1",
    status: "PENDING_VERIFICATION",
    email: "jane@example.com",
    studentName: "Jane",
    orderRef: "MSC-MERCH-2026-0042",
    amount: 350,
    variant: { label: "S", item: { name: "Shirt" } },
    proofSubmissions: [{ id: "sub-1" }],
  };

  it("auto-reroutes OUT_OF_STOCK to AWAITING_RESOLUTION (never REJECTED)", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pending);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/reject")
      .send({ reason: "OUT_OF_STOCK" });
    expect(res.status).toBe(200);
    // The student paid — reject must not strand their money in REJECTED.
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AWAITING_RESOLUTION", rejectionReason: "OUT_OF_STOCK" }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("400s an AMOUNT_MISMATCH rejection with no shortfall amount", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pending);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/reject")
      .send({ reason: "AMOUNT_MISMATCH" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.shortfallAmount).toBeDefined();
  });

  it("records the shortfall on an AMOUNT_MISMATCH rejection", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pending);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/reject")
      .send({ reason: "AMOUNT_MISMATCH", shortfallAmount: 100 });
    expect(res.status).toBe(200);
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", rejectionReason: "AMOUNT_MISMATCH" }),
      })
    );
  });

  it("400s when the shortfall is not less than the order total", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pending);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/reject")
      .send({ reason: "AMOUNT_MISMATCH", shortfallAmount: 350 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/less than the order total/i);
  });

  it("400s when a shortfall is sent for a non-mismatch reason", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(pending);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/reject")
      .send({ reason: "SCREENSHOT_UNCLEAR", shortfallAmount: 100 });
    expect(res.status).toBe(400);
    expect(res.body.errors?.shortfallAmount).toBeDefined();
  });
});

// ── Finance admin: RBAC on head-only endpoints ──────────────────────────────
describe("head-only merch endpoints", () => {
  it("archive is blocked for a plain finance officer (guard 403)", async () => {
    denyRole(mockRequireAdminFinanceHead);
    const res = await request(app).post("/api/v2/admin/merch/items/item-1/archive");
    expect(res.status).toBe(403);
  });

  it("cancel is blocked for a plain finance officer (guard 403)", async () => {
    denyRole(mockRequireAdminFinanceHead);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/cancel")
      .send({ financeNote: "test" });
    expect(res.status).toBe(403);
  });
});

// ── §7a Resubmit lock (payment proof) ───────────────────────────────────────
describe("payment-proof resubmit lock (§7a)", () => {
  it("blocks resubmission on an AWAITING_RESOLUTION order (no double-pay)", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      id: "order-1",
      email: "jane@example.com",
      status: "AWAITING_RESOLUTION",
      studentName: "Jane",
      rejectionReason: "OUT_OF_STOCK",
      shortfallAmount: null,
    });
    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "1234567890123")
      .attach("screenshot", pngFixture, "proof.png");
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/being resolved/i);
  });

  it("blocks resubmission on a REJECTED+OUT_OF_STOCK order", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      id: "order-1",
      email: "jane@example.com",
      status: "REJECTED",
      studentName: "Jane",
      rejectionReason: "OUT_OF_STOCK",
      shortfallAmount: null,
    });
    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "1234567890123")
      .attach("screenshot", pngFixture, "proof.png");
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not awaiting payment proof/i);
  });

  it("allows resubmission on a REJECTED+AMOUNT_MISMATCH order (student-fixable)", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      id: "order-1",
      email: "jane@example.com",
      status: "REJECTED",
      studentName: "Jane",
      rejectionReason: "AMOUNT_MISMATCH",
      shortfallAmount: "100.00",
    });
    (prisma.paymentProofSubmission.findFirst as any).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v2/merch/orders/MSC-MERCH-2026-0042/payment-proof")
      .field("email", "jane@example.com")
      .field("referenceNumber", "9876543210001")
      .attach("screenshot", pngFixture, "proof.png");
    expect(res.status).toBe(200);
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_VERIFICATION" }) })
    );
    // The accepted submission is flagged as a top-up carrying the shortfall.
    expect(prisma.paymentProofSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isTopUp: true }) })
    );
  });
});

// ── §7a Refund (head-only) ──────────────────────────────────────────────────
describe("POST /api/v2/admin/merch/orders/:orderId/refund", () => {
  const refundable = {
    id: "order-1",
    status: "AWAITING_RESOLUTION",
    email: "jane@example.com",
    studentName: "Jane",
    orderRef: "MSC-MERCH-2026-0042",
    amount: 350,
    refunds: [],
  };

  it("is blocked for a plain finance officer (guard 403)", async () => {
    denyRole(mockRequireAdminFinanceHead);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 350, method: "GCASH" });
    expect(res.status).toBe(403);
  });

  it("records a refund and moves AWAITING_RESOLUTION → REFUNDED", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(refundable);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 350, method: "GCASH", referenceNumber: "1234567890123" });
    expect(res.status).toBe(200);
    expect(prisma.merchRefund.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "FULL" }) })
    );
    expect(prisma.merchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) })
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("requires a note when the refund method is OTHER", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(refundable);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 350, method: "OTHER" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.note).toBeDefined();
  });

  it("rejects a refund amount greater than the order total", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(refundable);
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 500, method: "GCASH" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot exceed/i);
  });

  it("409s when the order is not awaiting resolution", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({ ...refundable, status: "CONFIRMED" });
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 350, method: "GCASH" });
    expect(res.status).toBe(409);
  });

  it("409s when a full refund already exists", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({ ...refundable, refunds: [{ id: "r-1", type: "FULL" }] });
    const res = await request(app)
      .post("/api/v2/admin/merch/orders/order-1/refund")
      .send({ amount: 350, method: "GCASH" });
    expect(res.status).toBe(409);
  });
});

// ── §7b Resend email + order detail ─────────────────────────────────────────
describe("POST /api/v2/admin/merch/orders/:orderId/resend-email", () => {
  it("resends the status email and records the attempt + audit", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      id: "order-1",
      orderRef: "MSC-MERCH-2026-0042",
      email: "jane@example.com",
      studentName: "Jane",
      status: "PENDING_VERIFICATION",
      quantity: 1,
      amount: 350,
      rejectionReason: null,
      financeNote: null,
      variant: { label: "S", item: { name: "Shirt" } },
      refund: null,
    });
    const res = await request(app).post("/api/v2/admin/merch/orders/order-1/resend-email");
    expect(res.status).toBe(200);
    // Notification tracking write + audit entry.
    expect(prisma.merchOrder.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("404s for an unknown order", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(null);
    const res = await request(app).post("/api/v2/admin/merch/orders/nope/resend-email");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v2/admin/merch/orders/:orderId (detail timeline)", () => {
  it("returns the submission timeline with attempt numbers", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue({
      id: "order-1",
      orderRef: "MSC-MERCH-2026-0042",
      studentName: "Jane",
      studentId: null,
      email: "jane@example.com",
      gcashNumber: null,
      quantity: 1,
      amount: 350,
      status: "REJECTED",
      rejectionReason: "AMOUNT_MISMATCH",
      financeNote: null,
      lastNotifiedAt: null,
      lastNotificationOk: null,
      notificationCount: 1,
      shortfallAmount: "100.00",
      refundOwed: null,
      stockHeld: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      variant: { label: "S", item: { name: "Shirt" } },
      proofSubmissions: [
        { id: "s1", referenceNumber: "1111111111111", screenshotPath: "proof-a.png", result: "ACCEPTED", officerDecision: "REJECTED", rejectionReason: "AMOUNT_MISMATCH", financeNote: null, isTopUp: false, shortfallAmount: "100.00", reviewedById: "fin", reviewedAt: new Date(), createdAt: new Date() },
        { id: "s2", referenceNumber: "2222222222222", screenshotPath: "proof-b.png", result: "ACCEPTED", officerDecision: "PENDING", rejectionReason: null, financeNote: null, isTopUp: true, shortfallAmount: "100.00", reviewedById: null, reviewedAt: null, createdAt: new Date() },
      ],
      refunds: [],
    });
    const res = await request(app).get("/api/v2/admin/merch/orders/order-1");
    expect(res.status).toBe(200);
    expect(res.body.data.order.submissions).toHaveLength(2);
    expect(res.body.data.order.submissions[0].attempt).toBe(1);
    expect(res.body.data.order.submissions[1].attempt).toBe(2);
  });

  it("404s for an unknown order", async () => {
    (prisma.merchOrder.findUnique as any).mockResolvedValue(null);
    const res = await request(app).get("/api/v2/admin/merch/orders/nope");
    expect(res.status).toBe(404);
  });
});

// ── §7a Image proxies (public photo vs private screenshot separation) ────────
describe("catalog photo proxy (public) & screenshot proxy (finance)", () => {
  it("public photo proxy refuses a non-item- filename (can't serve screenshots)", async () => {
    const res = await request(app).get("/api/v2/merch/photos/proof-secret.png");
    expect(res.status).toBe(400);
  });

  it("public photo proxy accepts an item- filename (404 when absent)", async () => {
    const res = await request(app).get("/api/v2/merch/photos/item-abc.png");
    // Default storage mock returns a null stream → 404 (not 400).
    expect(res.status).toBe(404);
  });

  it("screenshot proxy refuses a non-proof- filename", async () => {
    const res = await request(app).get("/api/v2/admin/merch/screenshots/item-abc.png");
    expect(res.status).toBe(400);
  });
});

// ── §8 Multer photo-count cap ───────────────────────────────────────────────
describe("item photo upload cap (§8)", () => {
  it("returns a clean 400 when more than 6 photos are attached", async () => {
    const req = request(app).post("/api/v2/admin/merch/items").field("name", "Shirt");
    for (let i = 0; i < 7; i++) req.attach("photos", pngFixture, `p${i}.png`);
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at most 6 photos/i);
  });
});
