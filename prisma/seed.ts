import { v5 as uuidv5 } from "uuid";
import { PrismaClient, UserRole, ApplicantStatus, Gender, Office, Campus } from "@prisma/client";
import { auth } from "../src/config/auth";
import { ALLOWED_SETTING_KEYS, SETTING_DESCRIPTIONS } from "../src/config/settings";

// ============================================================================
// Central seed — run locally with `npx prisma db seed` and automatically by
// CI/CD on `develop` and `release` deploys (CICD skips seeding on `main`).
//
// Creates:
//   - 300 users + accounts (75 MEMBER + 225 APPLICANT) via Better Auth, so the
//     mocked users can actually log in with the documented password.
//   - 10 admins (5 ADMIN_HR + 5 ADMIN_LOGISTICS) with distinct credentials.
//   - 1 SUPERADMIN (V2 Module 01) with its own credential.
//   - 3 default SystemSetting toggles (V2 Module 01).
//   - 300 applicant records (one per user) with a realistic status spread.
//   - 150 application drafts across all form steps.
//
// Data conventions:
//   - Emails: lastname.firstname.mi@gmail.com (digit suffix on collisions).
//   - Student IDs: YY-NNNN — year correlates with section year level
//     (4th year -> 23 ... 1st year -> 26; a few irregulars get 21-22),
//     number in the 1000-2900 range. Admins use the 00-01XX staff range,
//     SUPERADMIN uses 00-0000.
//   - Document fields use the fixed mock blob URLs below.
//
// SAFETY: hard-refuses to run on production/main. Idempotent — re-runs skip
// existing records (matched by email / studentId / ocrSessionId / setting key).
// ============================================================================

const prisma = new PrismaClient();

// ── Tunable seed sizes ────────────────────────────────────────────────────
const USER_COUNT = 300; // total bulk users (each gets one Account)
const MEMBER_USER_COUNT = 75; // subset promoted to MEMBER role (approved applicants)
const APPLICANT_COUNT = 300; // bulk applicant records (one per user)
const DRAFT_COUNT = 150; // application drafts
const IRREGULAR_COUNT = 5; // students enrolled earlier than the standard cohort

const USER_PASSWORD = process.env.SEED_USER_PASSWORD || "SeedPass123!";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "AdminPass123!";
const SUPERADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD || "SuperAdminPass123!";

// ── Fixed mock document URLs (shared dev-storage blobs) ───────────────────
const ID_IMAGE_URL = "https://stsamscqcubackenddev.blob.core.windows.net/ocr/ocr_1785936580931_student-id.png";
const COR_URL = "https://stsamscqcubackenddev.blob.core.windows.net/documents/cor_draft_1785936630204_cor.png";
const CV_URL = "https://stsamscqcubackenddev.blob.core.windows.net/documents/cv_draft_1785936630303_cv-pdf.pdf";

// ── Deterministic PRNG (mulberry32) so re-runs produce identical data ────
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20260805);
const randInt = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (percent: number): boolean => rng() * 100 < percent;

// ── Fixed namespace so draft OCR session IDs are deterministic UUIDs (v5),
// keeping the seed idempotent while staying valid for Zod `.uuid()` checks. ──
const DRAFT_NAMESPACE = "7f3b2c1e-9a4d-4e8f-b6c2-1a2b3c4d5e6f";

// ── Real QCU colleges, programs, and program codes (used in section IDs) ───
interface Program {
  name: string;
  code: string;
}
interface College {
  name: string;
  programs: readonly Program[];
}

const COLLEGE_PROGRAMS: readonly College[] = [
  {
    name: "College of Computer Studies",
    programs: [
      { name: "Bachelor of Science in Information Technology", code: "IT" },
      { name: "Bachelor of Science in Computer Science", code: "CS" },
      { name: "Bachelor of Science in Information Systems", code: "IS" },
    ],
  },
  {
    name: "College of Engineering",
    programs: [
      { name: "Bachelor of Science in Industrial Engineering", code: "IE" },
      { name: "Bachelor of Science in Electronics Engineering", code: "EC" },
    ],
  },
  {
    name: "College of Business Administration and Accountancy",
    programs: [
      { name: "Bachelor of Science in Accountancy", code: "AC" },
      { name: "Bachelor of Science in Entrepreneurship", code: "ENT" },
    ],
  },
  {
    name: "College of Education",
    programs: [{ name: "Bachelor of Early Childhood Education", code: "ECE" }],
  },
];

// Campus -> branch prefix used in QCU section IDs (SB / BA / SF).
const BRANCH_CODE: Record<Campus, string> = {
  [Campus.SAN_BARTOLOME_MAIN]: "SB",
  [Campus.BATASAN]: "BA",
  [Campus.SAN_FRANCISCO]: "SF",
};

const SECTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"] as const;

const CAMPUSES: readonly Campus[] = [Campus.SAN_BARTOLOME_MAIN, Campus.SAN_FRANCISCO, Campus.BATASAN];

const OFFICES: readonly Office[] = [
  Office.SECRETARIAT_OFFICE,
  Office.RELATIONS_OFFICE,
  Office.FINANCE_OFFICE,
  Office.LOGISTICS_OFFICE,
  Office.CREATIVES_OFFICE,
  Office.MANAGEMENT_AND_DEVELOPMENT_OFFICE,
  Office.STARTUP_DEVELOPERS_OFFICE,
];

const GENDERS: readonly Gender[] = [Gender.MALE, Gender.FEMALE, Gender.LGBTQIA, Gender.PREFER_NOT_TO_SAY];

// ── Static reference data (Filipino names) ─────────────────────────────────
const FIRST_NAMES_MALE = [
  "Juan", "Carlo", "Miguel", "Rafael", "Gabriel", "Andres", "Paolo", "Marco", "Joshua", "Nathaniel",
  "Adrian", "Cedric", "Vincent", "Emmanuel", "Ralph", "Jerome", "Christian", "Mark", "John", "Daniel",
] as const;

const FIRST_NAMES_FEMALE = [
  "Maria", "Andrea", "Sofia", "Isabella", "Camille", "Danica", "Trisha", "Angel", "Bianca", "Kathleen",
  "Nicole", "Alyssa", "Patricia", "Samantha", "Bea", "Mikaela", "Jasmine", "Clarisse", "Dianne", "Erika",
] as const;

const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Flores", "Ramos",
  "Aquino", "Del Rosario", "Villanueva", "Domingo", "Castillo", "Navarro", "Salazar", "Mercado", "Padilla",
  "Santiago", "Buenaventura", "Espino", "Manalo", "Dizon", "Lopez",
] as const;

const MIDDLE_INITIALS = ["A", "B", "C", "D", "E", "M", "R", "S", "V"] as const;

// Weighted applicant status distribution for a realistic pipeline.
const STATUS_POOL: { status: ApplicantStatus; weight: number }[] = [
  { status: ApplicantStatus.PENDING_REVIEW, weight: 38 },
  { status: ApplicantStatus.APPROVED, weight: 25 },
  { status: ApplicantStatus.FOR_INTERVIEW, weight: 15 },
  { status: ApplicantStatus.REJECTED, weight: 10 },
  { status: ApplicantStatus.RESUBMIT, weight: 8 },
  { status: ApplicantStatus.CANCELLED, weight: 4 },
];

function pickWeightedStatus(): ApplicantStatus {
  const total = STATUS_POOL.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of STATUS_POOL) {
    roll -= entry.weight;
    if (roll <= 0) return entry.status;
  }
  return ApplicantStatus.PENDING_REVIEW;
}

// ── Person factory ────────────────────────────────────────────────────────
interface Person {
  firstName: string;
  lastName: string;
  middleInitial: string;
  email: string;
  studentId: string;
  gender: Gender;
  dateOfBirth: Date;
  placeOfBirth: string;
  cellphoneNumber: string;
  houseAddress: string;
  facebookLink: string;
  college: string;
  program: string;
  section: string;
  campus: Campus;
  office: Office;
  interestsSkillsHobbies: string;
  organizationHistory: string;
  portfolio: string | null;
  githubOrProjectLinks: string | null;
  previousWorksAchievements: string | null;
}

// Builds one person with a unique gmail email and unique student ID.
// - Email: lastname.firstname.mi@gmail.com (digit suffix on collision).
// - Student ID: YY-NNNN where the year correlates with the section year level
//   (4th year -> 23 ... 1st year -> 26). Irregulars (older enrollment) get
//   21-22. The number ranges 1000-2900 and is deduped against existing IDs.
//
// The `generatedEmails` / `generatedStudentIds` sets are run-local ONLY — they
// guard uniqueness within this seed run. They are NOT seeded from the database,
// so every run produces the exact same people (deterministic). Re-running is
// still idempotent because the create loops skip rows that already exist in the
// DB (checked against the DB-seeded sets in main()).
function buildPerson(
  generatedEmails: Set<string>,
  generatedStudentIds: Set<string>,
  opts: { irregular?: boolean; fixedStudentId?: string } = {}
): Person {
  const female = chance(50);
  const firstName = female ? pick(FIRST_NAMES_FEMALE) : pick(FIRST_NAMES_MALE);
  const lastName = pick(LAST_NAMES);
  const middleInitial = pick(MIDDLE_INITIALS);

  const sectionYear = randInt(1, 4);
  const studentYear = opts.irregular ? randInt(21, 22) : 27 - sectionYear;

  // Unique student ID (admins use a fixed staff-ID range instead of the pool).
  let studentId = opts.fixedStudentId;
  if (!studentId) {
    do {
      studentId = `${studentYear}-${String(randInt(1000, 2900)).padStart(4, "0")}`;
    } while (generatedStudentIds.has(studentId));
  }
  generatedStudentIds.add(studentId);

  // Slugify names for URLs/emails — some last names contain spaces
  // (e.g. "Del Rosario") which would break email/URL syntax.
  const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Unique gmail address, e.g. santos.juan.a@gmail.com.
  const baseLocal = `${slug(lastName)}.${slug(firstName)}.${slug(middleInitial)}`;
  let email = `${baseLocal}@gmail.com`;
  for (let n = 2; generatedEmails.has(email); n++) {
    email = `${baseLocal}${n}@gmail.com`;
  }
  generatedEmails.add(email);

  // College/program/campus are picked together so the section matches the program.
  const college = pick(COLLEGE_PROGRAMS);
  const program = pick(college.programs);
  const campus = pick(CAMPUSES);

  // QCU section format: {BRANCH}{PROGRAM}-{YEAR}{SECTION} e.g. SBIT-3I
  const section = `${BRANCH_CODE[campus]}${program.code}-${sectionYear}${pick(SECTION_LETTERS)}`;

  return {
    firstName,
    lastName,
    middleInitial,
    email,
    studentId,
    gender: pick(GENDERS),
    dateOfBirth: new Date(Date.UTC(randInt(2000, 2006), randInt(0, 11), randInt(1, 28))),
    placeOfBirth: pick(["Quezon City", "Manila", "Marikina", "Caloocan", "Pasig", "Valenzuela", "Taguig"] as const),
    cellphoneNumber: `09${randInt(100000000, 999999999)}`,
    houseAddress: `${randInt(1, 500)} ${pick(["Rizal", "Luna", "Bonifacio", "Mabini", "Magsaysay", "Katipunan"] as const)} St., Quezon City`,
    facebookLink: `https://facebook.com/${slug(firstName)}.${slug(lastName)}`,
    college: college.name,
    program: program.name,
    section,
    campus,
    office: pick(OFFICES),
    interestsSkillsHobbies: pick([
      "Coding, badminton, and photography",
      "Public speaking, debate, and journal writing",
      "Video editing, gaming, and mobile development",
      "Volleyball, singing, and event organizing",
      "UI/UX design, drawing, and music production",
      "Robotics, chess, and data analysis",
    ] as const),
    organizationHistory: pick([
      "Former SSG Class Representative (2024-2025)",
      "Member, QCU Entrepreneurship Society (2023-2024)",
      "Volunteer, local barangay youth council",
      "No prior organization experience",
      "Officer, High School Computer Club (2022-2023)",
      "Church youth group core member",
    ] as const),
    portfolio: chance(40) ? `https://site.com/${slug(firstName)}${slug(lastName)}` : null,
    githubOrProjectLinks: chance(60) ? `https://github.com/${slug(firstName)}${slug(lastName)}` : null,
    previousWorksAchievements: chance(35) ? "Top 3, regional hackathon 2025; freelance logo designs" : null,
  };
}

// Build progressive ApplicationDraft fields based on the current step
// (mirrors the multi-step form: 0 identity, 1 personal, 2 academics, 3 essays).
function makeDraft(
  index: number,
  generatedEmails: Set<string>,
  generatedStudentIds: Set<string>
): {
  ocrSessionId: string;
  currentStep: number;
  manual_application: boolean;
  lastName?: string;
  firstName?: string;
  middleInitial?: string;
  email?: string;
  studentId?: string;
  idImagePath?: string;
  dateOfBirth?: Date;
  placeOfBirth?: string;
  gender?: Gender;
  cellphoneNumber?: string;
  houseAddress?: string;
  facebookLink?: string;
  college?: string;
  program?: string;
  section?: string;
  campus?: Campus;
  office?: Office;
  certificateOfRegistration?: string;
  curriculumVitae?: string;
  interestsSkillsHobbies?: string;
  organizationHistory?: string;
  portfolio?: string | null;
  githubOrProjectLinks?: string | null;
  previousWorksAchievements?: string | null;
  lastResumeEmailSentAt?: Date;
} {
  const person = buildPerson(generatedEmails, generatedStudentIds);
  const step = pick([0, 0, 1, 1, 1, 2, 2, 2, 3, 3] as const);
  const manual = chance(15);

  const draft: ReturnType<typeof makeDraft> = {
    ocrSessionId: uuidv5(`draft-${index}`, DRAFT_NAMESPACE),
    currentStep: step,
    manual_application: manual,
  };

  // Step 0 — identity from OCR / manual entry
  if (step >= 0) {
    draft.lastName = person.lastName;
    draft.firstName = person.firstName;
    draft.middleInitial = person.middleInitial;
    draft.email = person.email;
    draft.studentId = person.studentId;
    draft.idImagePath = ID_IMAGE_URL;
  }

  // Step 1 — personal details & contact
  if (step >= 1) {
    draft.dateOfBirth = person.dateOfBirth;
    draft.placeOfBirth = person.placeOfBirth;
    draft.gender = person.gender;
    draft.cellphoneNumber = person.cellphoneNumber;
    draft.houseAddress = person.houseAddress;
    draft.facebookLink = person.facebookLink;
  }

  // Step 2 — academic info & document uploads (section ties to the program/branch)
  if (step >= 2) {
    draft.college = person.college;
    draft.program = person.program;
    draft.section = person.section;
    draft.campus = person.campus;
    draft.office = person.office;
    draft.certificateOfRegistration = COR_URL;
    draft.curriculumVitae = CV_URL;
  }

  // Step 3 — essays & portfolio
  if (step >= 3) {
    draft.interestsSkillsHobbies = person.interestsSkillsHobbies;
    draft.organizationHistory = person.organizationHistory;
    draft.portfolio = person.portfolio;
    draft.githubOrProjectLinks = person.githubOrProjectLinks;
  }

  // A few drafts already requested a resume email
  if (chance(10)) {
    draft.lastResumeEmailSentAt = new Date(Date.now() - randInt(1, 20) * 3_600_000);
  }

  return draft;
}

// ── Admin roster (5 HR + 5 Logistics) ──────────────────────────────────────
const ADMIN_ROLES: UserRole[] = [
  ...Array.from({ length: 5 }, () => UserRole.ADMIN_HR),
  ...Array.from({ length: 5 }, () => UserRole.ADMIN_LOGISTICS),
];

interface AdminAccount extends Person {
  role: UserRole;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const isForbiddenEnv =
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "release" ||
    process.env.BRANCH_NAME === "main" ||
    process.env.GITHUB_REF_NAME === "main";

  if (isForbiddenEnv) {
    throw new Error("Seeding is disabled for production/main. This seed is for local, develop, and release environments only.");
  }

  console.log("Seeding started...");

  // Pre-fetch existing records so re-runs skip (never duplicate) data
  const [existingUserEmails, existingStudentIds, existingApplicantEmails, existingDraftSessions] = await Promise.all([
    prisma.user.findMany({ select: { email: true } }),
    prisma.user.findMany({ select: { studentId: true } }),
    prisma.applicant.findMany({ select: { email: true } }),
    prisma.applicationDraft.findMany({ select: { ocrSessionId: true } }),
  ]);

  // These sets are used ONLY as skip-checks: if a generated email/student ID
  // already exists in the database, that record is skipped on this run.
  const usedEmails = new Set(existingUserEmails.map((u) => u.email));
  const usedStudentIds = new Set(existingStudentIds.map((u) => u.studentId));
  const applicantEmailSet = new Set(existingApplicantEmails.map((a) => a.email));
  const draftSessionSet = new Set(existingDraftSessions.map((d) => d.ocrSessionId));

  // Run-local sets guarantee deterministic, unique generation within this run.
  // They are NOT seeded from the database, so every run generates the exact
  // same people (and re-runs are then skipped via the DB sets above).
  const generatedEmails = new Set<string>();
  const generatedStudentIds = new Set<string>();

  let createdTotal = 0;
  let skippedTotal = 0;

  // ── 1. Admin accounts (created first — they're the most important) ────────
  const admins: AdminAccount[] = ADMIN_ROLES.map((role, i) => ({
    ...buildPerson(generatedEmails, generatedStudentIds, { fixedStudentId: `00-01${String(i + 1).padStart(2, "0")}` }),
    role,
  }));

  for (const admin of admins) {
    if (usedEmails.has(admin.email) || usedStudentIds.has(admin.studentId)) {
      skippedTotal++;
      continue;
    }

    await auth.api.signUpEmail({
      body: {
        email: admin.email,
        password: ADMIN_PASSWORD,
        name: `${admin.firstName} ${admin.lastName}`,
        firstName: admin.firstName,
        lastName: admin.lastName,
        studentId: admin.studentId,
      },
    });

    // Better Auth defaults to APPLICANT; promote to the requested admin role.
    await prisma.user.update({
      where: { email: admin.email },
      data: { role: admin.role },
    });

    createdTotal++;
  }

  // ── 1b. SUPERADMIN account (V2 Module 01 — first admin of the system) ─────
  const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL || "superadmin@msc-qcu.tech";
  const SUPERADMIN_STUDENT_ID = "00-0000";

  if (!usedEmails.has(SUPERADMIN_EMAIL) && !usedStudentIds.has(SUPERADMIN_STUDENT_ID)) {
    await auth.api.signUpEmail({
      body: {
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        name: "System Superadmin",
        firstName: "System",
        lastName: "Superadmin",
        studentId: SUPERADMIN_STUDENT_ID,
      },
    });

    await prisma.user.update({
      where: { email: SUPERADMIN_EMAIL },
      data: { role: UserRole.SUPERADMIN },
    });

    createdTotal++;
  } else {
    skippedTotal++;
  }

  // ── 1c. Default SystemSetting toggles (V2 Module 01) ──────────────────────
  // Idempotent upsert — existing rows keep their current values.
  for (const key of ALLOWED_SETTING_KEYS) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: {
        key,
        value: key === "events_registration_open",
        description: SETTING_DESCRIPTIONS[key],
      },
    });
  }

  // ── 2. Bulk person pool — built ONCE and reused by the user and applicant
  // loops so both sides always reference the exact same people. ─────────────
  const pool: Person[] = Array.from({ length: USER_COUNT }, (_, i) =>
    buildPerson(generatedEmails, generatedStudentIds, { irregular: i < IRREGULAR_COUNT })
  );

  // ── 3. Bulk users + accounts (via Better Auth so passwords are hashed) ───
  // userIdByIndex keeps applicant links aligned even when some users are
  // skipped on partial re-runs.
  const userIdByIndex = new Map<number, string>();

  for (let i = 0; i < USER_COUNT; i++) {
    const isMember = i < MEMBER_USER_COUNT;
    const person = pool[i];

    if (usedEmails.has(person.email) || usedStudentIds.has(person.studentId)) {
      skippedTotal++;
      continue;
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: person.email,
        password: USER_PASSWORD,
        name: `${person.firstName} ${person.lastName}`,
        firstName: person.firstName,
        lastName: person.lastName,
        studentId: person.studentId,
      },
    });

    // Bulk users default to APPLICANT; promote the member subset.
    await prisma.user.update({
      where: { id: result.user.id },
      data: { role: isMember ? UserRole.MEMBER : UserRole.APPLICANT },
    });

userIdByIndex.set(i, result.user.id);
    createdTotal++;
  }

  console.log(`Users created: ${createdTotal} (skipped ${skippedTotal} existing)`);

  // ── 4. Applicant records (one per bulk user) ──────────────────────────────
  const applicants: {
    lastName: string;
    firstName: string;
    middleInitial: string;
    email: string;
    college: string;
    program: string;
    section: string;
    campus: Campus;
    studentId: string;
    dateOfBirth: Date;
    placeOfBirth: string;
    gender: Gender;
    office: Office;
    certificateOfRegistration: string;
    curriculumVitae: string;
    houseAddress: string;
    cellphoneNumber: string;
    facebookLink: string;
    interestsSkillsHobbies: string;
    organizationHistory: string;
    portfolio: string | null;
    githubOrProjectLinks: string | null;
    previousWorksAchievements: string | null;
    status: ApplicantStatus;
    manual_application: boolean;
    idImagePath: string;
    userId: string | null;
    createdAt: Date;
  }[] = [];

  for (let i = 0; i < APPLICANT_COUNT; i++) {
    const isMember = i < MEMBER_USER_COUNT;
    const person = pool[i];

    if (applicantEmailSet.has(person.email)) {
      continue;
    }
    applicantEmailSet.add(person.email);

    // Members are approved; the rest follow the realistic status distribution.
    const status = isMember ? ApplicantStatus.APPROVED : pickWeightedStatus();

    applicants.push({
      lastName: person.lastName,
      firstName: person.firstName,
      middleInitial: person.middleInitial,
      email: person.email,
      college: person.college,
      program: person.program,
      section: person.section,
      campus: person.campus,
      studentId: person.studentId,
      dateOfBirth: person.dateOfBirth,
      placeOfBirth: person.placeOfBirth,
      gender: person.gender,
      office: person.office,
      certificateOfRegistration: COR_URL,
      curriculumVitae: CV_URL,
      houseAddress: person.houseAddress,
      cellphoneNumber: person.cellphoneNumber,
      facebookLink: person.facebookLink,
      interestsSkillsHobbies: person.interestsSkillsHobbies,
      organizationHistory: person.organizationHistory,
      portfolio: person.portfolio,
      githubOrProjectLinks: person.githubOrProjectLinks,
      previousWorksAchievements: person.previousWorksAchievements,
      status,
      manual_application: chance(20),
      idImagePath: ID_IMAGE_URL,
      userId: userIdByIndex.get(i) ?? null,
      createdAt: new Date(Date.now() - randInt(0, 90) * 24 * 3_600_000),
    });
  }

  if (applicants.length > 0) {
    await prisma.applicant.createMany({ data: applicants, skipDuplicates: true });
  }
  console.log(`Applicants created: ${applicants.length}`);

  // ── 5. Application drafts ─────────────────────────────────────────────────
  const drafts: ReturnType<typeof makeDraft>[] = [];
  for (let i = 0; i < DRAFT_COUNT; i++) {
    const draft = makeDraft(i, generatedEmails, generatedStudentIds);
    if (draftSessionSet.has(draft.ocrSessionId)) {
      continue;
    }
    draftSessionSet.add(draft.ocrSessionId);
    drafts.push(draft);
  }

  if (drafts.length > 0) {
    await prisma.applicationDraft.createMany({ data: drafts, skipDuplicates: true });
  }
  console.log(`Application drafts created: ${drafts.length}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const [userCount, accountCount, applicantCount, draftCount] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.applicant.count(),
    prisma.applicationDraft.count(),
  ]);

  const roleCounts = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });

  console.log("Seeding complete.");
  console.log(`Totals in DB → users: ${userCount}, accounts: ${accountCount}, applicants: ${applicantCount}, drafts: ${draftCount}`);
  console.log(
    `Roles → ${roleCounts.map((r) => `${r.role}: ${r._count._all}`).join(", ")}`
  );
  console.log(`Bulk user login password: ${USER_PASSWORD}`);
  console.log(`Admin login password: ${ADMIN_PASSWORD}`);
  console.log(`Superadmin login → ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
  console.log(`Admins → ${admins.map((a) => `${a.role}: ${a.email}`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });