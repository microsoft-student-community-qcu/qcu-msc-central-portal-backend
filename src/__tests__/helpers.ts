// ── Shared Test Data ──────────────────────────────────────────────────────
export const mockApplicantInput = {
  lastName: "Doe",
  firstName: "John",
  middleInitial: "M",
  email: "john.doe@example.com",
  college: "College of Computer Studies",
  program: "BS Computer Science",
  section: "CS-101",
  campus: "SAN_BARTOLOME_MAIN" as const,
  dateOfBirth: "2000-01-15",
  placeOfBirth: "Manila",
  gender: "MALE" as const,
  office: "SECRETARIAT_OFFICE",
  houseAddress: "123 Main St",
  cellphoneNumber: "09171234567",
  facebookLink: "https://facebook.com/johndoe",
  interestsSkillsHobbies: "Coding, gaming",
  organizationHistory: "None",
  ocrSessionId: "00000000-0000-4000-8000-000000000001",
};

export const mockApplicantRecord = {
  id: "applicant-1",
  ...mockApplicantInput,
  dateOfBirth: new Date("2000-01-15"),
  studentId: "20-0001",
  certificateOfRegistration: "/uploads/documents/cor_1.pdf",
  curriculumVitae: "/uploads/documents/cv_1.pdf",
  idImagePath: "/uploads/ocr/id_1.jpg",
  manual_application: false,
  status: "PENDING_REVIEW",
  userId: null,
  portfolio: null,
  githubOrProjectLinks: null,
  previousWorksAchievements: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export const mockUserRecord = {
  id: "user-1",
  email: "john.doe@example.com",
  firstName: "John",
  lastName: "Doe",
  studentId: "20-0001",
  role: "APPLICANT",
  image: null,
  emailVerified: true,
  createdAt: new Date("2026-01-01"),
  middleInitial: "M",
};

const pastDate = new Date("2026-01-01");
const now = new Date();
// Make registration dates in the past so the window is open
export const mockEventRecord = {
  id: "event-1",
  title: "Test Event",
  description: "A test event",
  date: new Date(now.getTime() + 86400000), // tomorrow
  priorityStartDate: new Date("2025-01-01"),
  generalStartDate: new Date("2025-06-01"),
  type: "PUBLIC" as const,
  maxCapacity: 100,
  createdAt: pastDate,
  updatedAt: pastDate,
  _count: { registrations: 5 },
};

export const mockRegistrationRecord = {
  id: "reg-1",
  eventId: "event-1",
  userId: null,
  studentId: "20-0001",
  lastName: "Doe",
  firstName: "John",
  middleInitial: "M",
  email: "john.doe@example.com",
  qrPayload: "qr-uuid-123",
  manual_registration: false,
  status: "APPROVED" as const,
  hasAttended: false,
  createdAt: pastDate,
  updatedAt: pastDate,
};

// ── Real File Fixtures ────────────────────────────────────────────────────
// Real minimal file bytes so magic-byte validation (VUL-010) accepts them.
// Fake buffers like Buffer.from("fake jpeg") fail file-type detection.

export const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

export const pdfFixture = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
);

export const gifFixture = Buffer.from(
  "GIF89a\u0001\u0000\u0001\u0000\u0080\u0000\u0000\u0000\u0000\u0000\u00ff\u00ff\u00ff\u0021\u00f9\u0004\u0000\u0000\u0000\u0000\u0000\u002c\u0000\u0000\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0002\u0002\u0044\u0001\u0000\u003b"
);

// ── Auth Mock Factories ───────────────────────────────────────────────────
// Each test file creates its own vi.fn() instances and wires them into
// vi.mock('../routes/authMiddleware', ...).  The factory functions below
// return the mock implementations to pass to .mockImplementation().

export function authUnauthenticated(req: any, _res: any, next: any): void {
  req.userId = null;
  req.userRole = null;
  next();
}

export function authAdminHR(req: any, _res: any, next: any): void {
  req.userId = "admin-hr-id";
  req.userRole = "ADMIN_HR";
  next();
}

export function authAdminLogistics(req: any, _res: any, next: any): void {
  req.userId = "admin-logistics-id";
  req.userRole = "ADMIN_LOGISTICS";
  next();
}

export function authMember(req: any, _res: any, next: any): void {
  req.userId = "member-id";
  req.userRole = "MEMBER";
  next();
}

export function authApplicant(req: any, _res: any, next: any): void {
  req.userId = "applicant-id";
  req.userRole = "APPLICANT";
  next();
}

export function requireAuthPass(req: any, _res: any, next: any): void {
  if (!req.userId) {
    throw new Error("requireAuth called without userId — test setup issue");
  }
  next();
}

export function requireAdminHRPass(req: any, _res: any, next: any): void {
  if (req.userRole !== "ADMIN_HR") {
    throw new Error(`requireAdminHR called with role ${req.userRole} — test setup issue`);
  }
  next();
}

export function requireAdminLogisticsPass(req: any, _res: any, next: any): void {
  if (req.userRole !== "ADMIN_LOGISTICS") {
    throw new Error(`requireAdminLogistics called with role ${req.userRole} — test setup issue`);
  }
  next();
}
