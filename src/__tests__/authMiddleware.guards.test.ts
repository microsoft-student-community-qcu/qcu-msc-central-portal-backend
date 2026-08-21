import { describe, it, expect } from "vitest";
import {
  requireAdminHR,
  requireAdminLogistics,
  requireAnyAdmin,
  requireMemberOrAdmin,
  requireSuperadmin,
  requireAdminFinance,
  requireAdminFinanceHead,
  requireAdminLogisticsHead,
} from "../routes/authMiddleware";

// ── Unit tests for the REAL guards (not mocked) ───────────────────────────
// These verify the SUPERADMIN role inheritance (PRD-V2 Global NFR) and that
// each guard keeps the message-only error contract.

type Next = () => void;

function invoke(guard: any, role: string | null): { status: number; body: any; passed: boolean } {
  let passed = false;
  let status = 200;
  let body: any = null;
  const req = { userRole: role } as any;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: any) {
      body = payload;
      return this;
    },
  } as any;
  const next: Next = () => {
    passed = true;
  };
  guard(req, res, next);
  return { status, body, passed };
}

const allRoles = ["APPLICANT", "MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS", "SUPERADMIN", "ADMIN_FINANCE", "ADMIN_FINANCE_HEAD", "ADMIN_LOGISTICS_HEAD", "STARTUP_DEV", null];

describe("role guards", () => {
  const cases: { guard: any; name: string; allowed: string[] }[] = [
    { guard: requireAdminHR, name: "requireAdminHR", allowed: ["ADMIN_HR"] },
    { guard: requireAdminLogistics, name: "requireAdminLogistics", allowed: ["ADMIN_LOGISTICS"] },
    { guard: requireAnyAdmin, name: "requireAnyAdmin", allowed: ["ADMIN_HR", "ADMIN_LOGISTICS"] },
    { guard: requireMemberOrAdmin, name: "requireMemberOrAdmin", allowed: ["MEMBER", "ADMIN_HR", "ADMIN_LOGISTICS"] },
    { guard: requireSuperadmin, name: "requireSuperadmin", allowed: ["SUPERADMIN"] },
    { guard: requireAdminFinance, name: "requireAdminFinance", allowed: ["ADMIN_FINANCE", "ADMIN_FINANCE_HEAD"] },
    { guard: requireAdminFinanceHead, name: "requireAdminFinanceHead", allowed: ["ADMIN_FINANCE_HEAD"] },
    { guard: requireAdminLogisticsHead, name: "requireAdminLogisticsHead", allowed: ["ADMIN_LOGISTICS_HEAD"] },
  ];

  for (const { guard, name, allowed } of cases) {
    describe(name, () => {
      it(`passes for ${allowed.join(", ")} and SUPERADMIN (inheritance)`, () => {
        for (const role of [...allowed, "SUPERADMIN"]) {
          const result = invoke(guard, role);
          expect(result.passed, `expected ${role} to pass`).toBe(true);
        }
      });

      it("rejects every other role with 403 and a message-only body", () => {
        const rejected = allRoles.filter((role) => role !== null && !allowed.includes(role) && role !== "SUPERADMIN");
        for (const role of rejected) {
          const result = invoke(guard, role);
          expect(result.status, `expected ${role} to be rejected`).toBe(403);
          expect(result.body.success).toBe(false);
          expect(typeof result.body.message).toBe("string");
          expect(result.body.errors).toBeUndefined();
        }
      });
    });
  }
});
