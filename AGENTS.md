# Project Rules (for Agents & Developers)

Engineering standards for all contributors — both human and automated.

---

## Code Style

- Always add comments for non-trivial logic.
- Keep functions small, focused, and reusable.
- Prefer readability over clever or overly compact code.
- Follow existing project structure and naming conventions.
- Avoid duplicating logic; extract reusable utilities instead.
- Check `src/utils/` before writing new shared logic.
- TypeScript throughout; Zod schemas for all input validation.
- All Zod schemas must use custom human-readable error messages via `{ message: "..." }`.
  Generic Zod internals like `"Expected string, received undefined"` must never reach the client.
  Every field must have a clear, actionable error message suitable for frontend display.

## Architecture & File Organization

### Project Structure

```
qcu-msc-central-portal-backend/
├── docs/                       # Documentation
│   ├── api/                    # Versioned API documentation
│   ├── guides/                 # Versioned workflow guides (v1/, v2/)
│   ├── modules/                # Per-module handoff docs (V2) — docs/modules/v2/
│   ├── specs/                  # PRD, data models, DTM
│   └── test-cases/             # Manual test-case checklists (per version)
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # SQL migration history
├── src/
│   ├── config/                 # App configuration (auth.ts, env.ts)
│   ├── controllers/            # Request handlers
│   ├── routes/                 # Express routes + Better Auth middleware
│   ├── schemas/                # Zod validation schemas
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Shared utilities
│   ├── app.ts                  # Express application instantiation
│   └── index.ts                # Server entry point
├── .env.example
├── AGENTS.md
├── CHANGELOG.md                # Release notes — updated on EVERY task (see Changelog Obligations)
├── CONTRIBUTING.md
├── tsconfig.json
└── package.json
```

### Code Structure Rules

- Never allow a single file to become too large or hard to navigate.
- If a file grows beyond a reasonable size, split it into modules.
- Each file should have a single responsibility (one feature or concern only).
- Group related logic into folders (e.g., controllers, routes, schemas, utils).
- Move repeated logic into shared utilities instead of copying it.
- Avoid deeply nested logic; refactor into smaller functions or modules.
- Controller files go in `src/controllers/`, route files in `src/routes/`, schemas in `src/schemas/`.

## API Standards

- Every endpoint must be documented in `/docs/api/`.
- Each API doc must include:
  - clear description
  - request parameters
  - response format
  - example request
  - example response
- Avoid undocumented or "hidden" endpoints.
- Public POST endpoints must use rate limiting via `express-rate-limit`.
- All public APIs must use explicit versioning in their paths (e.g., `/api/v1/...`).
- Versioning strategy: URL path versioning for major versions; query/header versioning may be used for previews where necessary.
- Start with `v1`. Breaking changes increment the major version (v1 -> v2).
- Deprecation policy: document deprecated endpoints in `/docs/api/` with a deprecation timeline and migration notes.
- Maintain backward compatibility within a major version; non-breaking additions may be added under the same major version.

## API Response Format

All endpoints follow a consistent JSON response contract:

### Success
```json
{ "success": true, "data": { ... }, "message": "Human-readable summary (optional)" }
```

### Simple Error (not found, auth failure, business logic, 500)
```json
{ "success": false, "message": "Human-readable error description" }
```

### Validation Error (Zod field-level)
```json
{ "success": false, "message": "Validation error", "errors": { "fieldName": ["Error message"] } }
```

Rules:
- Use `message` (never `error`) for all simple error responses.
- Use `errors` only for field-level Zod validation details under `flatten().fieldErrors`.
- Rate limiter responses from `express-rate-limit` must use `message` (not `errors`).
- Auth guards in `authMiddleware.ts` and the 404 handler must use `message`.

## Role-Based Access Control (RBAC)

- Auth middleware lives in `src/routes/authMiddleware.ts`.
- Use the role-specific guards instead of checking roles inline:
  - `requireAuth` — any authenticated user (APPLICANT, MEMBER, or admin)
  - `requireAdminHR` — ADMIN_HR only
  - `requireAdminLogistics` — ADMIN_LOGISTICS only
  - `requireAnyAdmin` — ADMIN_HR or ADMIN_LOGISTICS
  - `requireMemberOrAdmin` — MEMBER, ADMIN_HR, or ADMIN_LOGISTICS
- Guest endpoints (no auth required) must not use any `require*` guard.
- APPLICANT-only routes use `requireAuth` alone (no additional guard).
- Never reference bare `"ADMIN"` or `"STUDENT"` in role checks — those roles do not exist.

> **Planned (V2, not yet implemented — Module 01 / M0):** The role model will expand to add `SUPERADMIN`, `ADMIN_FINANCE`, `ADMIN_FINANCE_HEAD`, `ADMIN_LOGISTICS_HEAD`, and `STARTUP_DEV`. `ADMIN_CORE` is intentionally removed — its permissions are folded into all heads + `SUPERADMIN`. `SUPERADMIN` will pass every `require*` guard via a single inheritance helper. New guards (`requireSuperadmin`, `requireAdminFinance`, `requireAdminFinanceHead`, `requireAdminLogisticsHead`) land with M0.

## Database & Schema

- The Prisma schema lives at `prisma/schema.prisma`.
- After modifying the schema, run `npx prisma generate` to regenerate the Prisma Client.
- Create a new migration after schema changes: `npm run prisma:migrate`.
- Environment variables are validated via Zod in `src/config/env.ts` at startup.
- All database connection strings use the `DATABASE_URL` env variable.
- CORS and Better Auth `trustedOrigins` accept both `FRONTEND_URL` (main site) and `ADMIN_FRONTEND_URL` (admin panel).

### UserRole Enum

The system uses a strict 4-role model (no bare `ADMIN` or `STUDENT`):

| Role | Description |
|------|-------------|
| `APPLICANT` | Post-account-creation, pending membership approval |
| `MEMBER` | Active QCU MSC member |
| `ADMIN_HR` | Management & Dev — applicant pipeline only |
| `ADMIN_LOGISTICS` | Logistics — event management only |

Guests have no User record (behavioral role only).

### Registration Model Conventions

- `status` uses the `RegistrationStatus` enum: `APPROVED`, `PENDING_REVIEW`, `REJECTED`, `CANCELLED`
- `studentId` stores the QCU Student ID from Zonal OCR (guest registrations)
- `manual_registration: true` means OCR failed → manual upload → enters Path B (admin review)
- `@@unique([eventId, studentId])` prevents duplicate guest registrations per event

> **Planned (V2, not yet implemented — Modules 02–03 / M1):** Default status changes from `APPROVED` to `PENDING_REVIEW`; the QR payload + QR image are generated **on approval**, not at registration. `EventType` gains a third value (`QCU_STUDENTS_ONLY`) alongside `PUBLIC`/`MEMBERS_ONLY`. Office caps (per-`Office`, `MEMBERS_ONLY` events only) and a per-event manual registration toggle are added. `Event` gains venue, registration deadline, banner image, requires-QR flag, and a soft-delete status.

## Zonal OCR Conventions

- The OCR flow follows a two-step pattern:
  1. `POST /api/v1/ocr/verify` — upload image, backend runs Zonal OCR, returns `ocrSessionId`
  2. Submission endpoint (e.g., `POST /api/v1/applicants`) — forward `ocrSessionId` for server-side verification
- The OCR engine lives in `src/services/ocr.service.ts` using Tesseract.js with predefined QCU ID card zones.
- OCR failures are tracked per client IP in an in-memory store (`src/config/ocrStore.ts`) with a 1-hour TTL.
- After `OCR_MAX_FAILURES` consecutive failures, the endpoint returns `manualRequired: true` and the frontend must show manual entry.
- Uploaded ID images (both success and failure) are saved to Azure Blob Storage (`AZURE_STORAGE_ACCOUNT_NAME` / `ocr` container) for audit purposes.
- Rate limit: 10 requests per minute per IP for the OCR endpoint.
- Public OCR routes are registered BEFORE auth middleware in `src/app.ts`.
- Zone coordinates for Zonal OCR are defined as absolute pixel values in `src/services/ocr.service.ts` — these must be re-calibrated against an actual QCU Student ID template during testing.
- **Planned (V2):** the same OCR session flow will gate non-member registration for `QCU_STUDENTS_ONLY` events (Module 02) and DataCamp scholarship intake (Module 07). Members bypass OCR in both.

## Documentation Obligations

- Update `/docs` whenever code changes affect:
  - API behavior
  - data models
  - endpoints
  - workflows
- If a new feature is added, create a corresponding doc file.
- Keep documentation consistent with actual implementation (no outdated docs allowed).
- Workflow documentation is versioned under `docs/guides/`: V1 guides live in `docs/guides/v1/workflows/`, V2 in `docs/guides/v2/workflows/`. Update them when registration, membership, or cancellation logic changes.
- V2 module handoff docs live in `docs/modules/v2/` — each module gets a single self-contained file; index in `docs/modules/README.md`.
- Manual test cases live in `docs/test-cases/{version}/` — add or update a suite whenever endpoint behavior, auth rules, or workflows change.

## Changelog Obligations

- The project keeps a `CHANGELOG.md` at the repository root (Keep a Changelog format, categories: `Added`, `Changed`, `Fixed`, `Security`, `Removed`).
- **Every completed task must update `CHANGELOG.md` — even a single change.** Entries go under `[Unreleased]` in the matching category.
- A task is not considered done until its changelog entry exists.
- Reference the issue/PR number in the entry when available.
- **Releases:** when cutting a release, rename `[Unreleased]` to `## [X.Y.Z] - <date>` and add a fresh empty `[Unreleased]` above it. See CONTRIBUTING.md → Release Process.

## Testing Expectations

- Test each endpoint using **POSTMAN**, **HTTPie**, **Thunder Client** (VS Code), or your preferred HTTP client.
- Request/response payload formats are defined in `docs/api/v{N}/<endpoint>.md` — always reference these when testing.
- Verify all status codes: success (200/201), validation error (400), auth error (401), forbidden (403), not found (404).

## Git Rules

- Use meaningful and descriptive commit messages (conventional commits).
- Do not commit undocumented breaking changes.
- Keep commits focused on a single logical change (avoid mixed-purpose commits).

## V2 Module Development

V2 (Events & Logistics Release) work is tracked in `docs/modules/v2/` — one file per module. PRD: `docs/specs/PRD-V2.md`.

- **Base branch:** `develop`. All V2 module work uses the standard `feature/* → develop` PR flow (see CONTRIBUTING.md). No separate V2 trunk.
- **Per-module flow:**
  1. Assign yourself a module (fill the **Assignee** column in `docs/modules/README.md`).
  2. Read the module doc — it is the single source of truth for that module (roles, workflows, edge cases, proposed data model/API surface).
  3. Implement on a branch off `develop`; update `docs/api/v2/` and data-model docs as you go.
  4. When the module ships, promote its workflow content into `docs/guides/v2/workflows/` and update `docs/guides/v2/workflows.md`.
- **Shared utilities for V2:** QR image generation (`qrcode`) and audit-log middleware will be added to `src/utils/` in M0/M1 — check `src/utils/` before reimplementing.
- **Milestone order:** M0 Foundation → M1 Events v2 → M2 Merch → M3 Showcase → M4 Analytics → M5 DataCamp. Build dependencies are listed in each module doc.

## Agent Workflow Requirements

- Before writing code, check existing docs and project structure.
- Prefer extending existing modules instead of creating new scattered logic.
- After modifying logic, update all related documentation immediately.
- If unsure whether docs are affected, assume they are and update them.
- When adding new features, design them in a modular way from the start (avoid monolithic files).
- Check `src/utils/` before duplicating any utility logic.
- Run `npx prisma generate` immediately after any Prisma schema change.
