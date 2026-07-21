import { vi, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// ── Environment Variables ─────────────────────────────────────────────────
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
process.env.BETTER_AUTH_SECRET = "test-secret-at-least-8-chars-long";
process.env.BETTER_AUTH_URL = "http://localhost:5000";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.OCR_MAX_FAILURES = "3";
process.env.RESEND_API_KEY = "re_test-key-for-testing";

const testUploadDir = path.join(os.tmpdir(), `qcu-test-uploads-${Date.now()}`);
process.env.IMAGE_STORAGE_PATH = path.join(testUploadDir, "ocr");
process.env.DOCUMENT_STORAGE_PATH = path.join(testUploadDir, "documents");

beforeAll(() => {
  fs.mkdirSync(path.join(testUploadDir, "ocr"), { recursive: true });
  fs.mkdirSync(path.join(testUploadDir, "documents"), { recursive: true });
});

afterAll(() => {
  fs.rmSync(testUploadDir, { recursive: true, force: true });
});

// ── Global Prisma Mock ────────────────────────────────────────────────────
vi.mock("../config/database", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    applicant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  } as any,
}));

// ── Global External Service Mocks ─────────────────────────────────────────
vi.mock("../utils/imageStorage", () => ({
  saveImage: vi.fn((_buffer: Buffer, filename: string) =>
    path.join(process.env.IMAGE_STORAGE_PATH!, filename)
  ),
  saveDocument: vi.fn((_buffer: Buffer, filename: string) =>
    path.join(process.env.DOCUMENT_STORAGE_PATH!, filename)
  ),
  ensureStorageDir: vi.fn(() => process.env.IMAGE_STORAGE_PATH!),
  ensureDocumentStorageDir: vi.fn(() => process.env.DOCUMENT_STORAGE_PATH!),
  getImagePath: vi.fn((filename: string) =>
    path.join(process.env.IMAGE_STORAGE_PATH!, filename)
  ),
  getDocumentPath: vi.fn((filename: string) =>
    path.join(process.env.DOCUMENT_STORAGE_PATH!, filename)
  ),
}));

vi.mock("../services/ocr.service", () => ({
  extractFields: vi.fn(),
}));

vi.mock("../utils/token", () => ({
  signSetupToken: vi.fn(() => Promise.resolve("mock-setup-token")),
  verifySetupToken: vi.fn(),
}));

vi.mock("../config/auth", () => ({
  auth: {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("../services/email.service", () => ({
  sendSetupLinkEmail: vi.fn(() => Promise.resolve()),
  sendRegistrationConfirmedEmail: vi.fn(() => Promise.resolve()),
  sendRegistrationPendingReviewEmail: vi.fn(() => Promise.resolve()),
  sendRegistrationApprovedEmail: vi.fn(() => Promise.resolve()),
  sendRegistrationRejectedEmail: vi.fn(() => Promise.resolve()),
  sendManualIdApprovedEmail: vi.fn(() => Promise.resolve()),
  sendManualIdRejectedEmail: vi.fn(() => Promise.resolve()),
}));
