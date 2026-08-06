import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { expand } from "dotenv-expand";

// Load environment variables from .env file and expand variables
// (same pattern as src/config/env.ts)
const rawEnv = loadEnv();
expand(rawEnv);

// ── Layer 1: NODE_ENV guard ─────────────────────────────────────────────────
// Strict safety check: the reset script may ONLY run in development or
// staging. It refuses to run in production or in any other environment.
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOWED_ENVIRONMENTS = ["development", "staging"];

if (!ALLOWED_ENVIRONMENTS.includes(NODE_ENV)) {
  console.error(
    `Refusing to run: NODE_ENV="${NODE_ENV}" is not an allowed environment. ` +
      `This script may only be run with NODE_ENV set to one of: ${ALLOWED_ENVIRONMENTS.join(", ")}.`
  );
  process.exit(1);
}

// ── Layer 2: database-name guard ────────────────────────────────────────────
// The ONLY database that must never be truncated is the production database,
// regardless of which host it lives on. Every other database (dev, release,
// staging, local XAMPP) is a valid reset target.
let dbName = "";
try {
  const dbUrl = new URL(process.env.DATABASE_URL ?? "");
  dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, "")).split("?")[0];
} catch {
  console.error("Refusing to run: DATABASE_URL is missing or invalid.");
  process.exit(1);
}

if (dbName === "qcu_msc_central_portal") {
  console.error(
    `Refusing to run: database "${dbName}" is the production database and is never an allowed reset target. ` +
      `Point DATABASE_URL at a non-production database before running this script.`
  );
  process.exit(1);
}

// ── Layer 3: explicit confirmation guard ────────────────────────────────────
// Require an explicit opt-in so a stray run can never truncate the database
// by accident. Confirmation via CLI flag or environment variable.
const hasConfirmFlag = process.argv.includes("--confirm");
const hasConfirmEnv = process.env.RESET_DB_CONFIRM === "1" || process.env.RESET_DB_CONFIRM === "true";

if (!hasConfirmFlag && !hasConfirmEnv) {
  console.error(
    "Refusing to run: no confirmation given. " +
      `Run with "npm run db:reset -- --confirm" or set RESET_DB_CONFIRM=1.`
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// All application tables, listed in dependency-independent order since
// TRUNCATE is performed with foreign key checks disabled.
const TABLES = [
  "User",
  "Session",
  "Account",
  "Verification",
  "Applicant",
  "Event",
  "Registration",
  "SponsorshipInquiry",
  "ApplicationDraft",
];

async function resetDatabase(): Promise<void> {
  // Disable FK checks so TRUNCATE can run in any order
  // (tables reference each other via User/Event relations).
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
    console.log(`Truncated ${table}`);
  }

  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

  console.log(`Database reset complete — ${TABLES.length} tables emptied (migration history preserved).`);
}

resetDatabase()
  .catch((e) => {
    console.error("Database reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
