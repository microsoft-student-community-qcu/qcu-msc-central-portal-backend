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
│   ├── guides/                 # Workflow guides
│   └── specs/                  # PRD, data models, DTM
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # SQL migration history
├── src/
│   ├── config/                 # App configuration (auth.ts, env.ts)
│   ├── controllers/            # Request handlers
│   ├── routes/                 # Express routes + JWT auth middleware
│   ├── schemas/                # Zod validation schemas
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Shared utilities
│   ├── app.ts                  # Express application instantiation
│   └── index.ts                # Server entry point
├── .env.example
├── AGENTS.md
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

## Database & Schema

- The Prisma schema lives at `prisma/schema.prisma`.
- After modifying the schema, run `npx prisma generate` to regenerate the Prisma Client.
- Create a new migration after schema changes: `npm run prisma:migrate`.
- Environment variables are validated via Zod in `src/config/env.ts` at startup.
- All database connection strings use the `DATABASE_URL` env variable.

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

## Zonal OCR Conventions

- The OCR flow follows a two-step pattern:
  1. `POST /api/v1/ocr/verify` — upload image, backend runs Zonal OCR, returns `ocrSessionId`
  2. Submission endpoint (e.g., `POST /api/v1/applicants`) — forward `ocrSessionId` for server-side verification
- The OCR engine lives in `src/services/ocr.service.ts` using Tesseract.js with predefined QCU ID card zones.
- OCR failures are tracked per client IP in an in-memory store (`src/config/ocrStore.ts`) with a 1-hour TTL.
- After `OCR_MAX_FAILURES` consecutive failures, the endpoint returns `manualRequired: true` and the frontend must show manual entry.
- Uploaded ID images (both success and failure) are saved to `IMAGE_STORAGE_PATH` for audit purposes.
- Rate limit: 10 requests per minute per IP for the OCR endpoint.
- Public OCR routes are registered BEFORE auth middleware in `src/app.ts`.
- Zone coordinates for Zonal OCR are defined as absolute pixel values in `src/services/ocr.service.ts` — these must be re-calibrated against an actual QCU Student ID template during testing.

## Documentation Obligations

- Update `/docs` whenever code changes affect:
  - API behavior
  - data models
  - endpoints
  - workflows
- If a new feature is added, create a corresponding doc file.
- Keep documentation consistent with actual implementation (no outdated docs allowed).
- Workflow documentation lives in `docs/guides/workflows/` — update these when registration, membership, or cancellation logic changes.

## Testing Expectations

- Test each endpoint using **POSTMAN**, **HTTPie**, **Thunder Client** (VS Code), or your preferred HTTP client.
- Request/response payload formats are defined in `docs/api/v{N}/<endpoint>.md` — always reference these when testing.
- Verify all status codes: success (200/201), validation error (400), auth error (401), forbidden (403), not found (404).

## Git Rules

- Use meaningful and descriptive commit messages (conventional commits).
- Do not commit undocumented breaking changes.
- Keep commits focused on a single logical change (avoid mixed-purpose commits).

## Agent Workflow Requirements

- Before writing code, check existing docs and project structure.
- Prefer extending existing modules instead of creating new scattered logic.
- After modifying logic, update all related documentation immediately.
- If unsure whether docs are affected, assume they are and update them.
- When adding new features, design them in a modular way from the start (avoid monolithic files).
- Check `src/utils/` before duplicating any utility logic.
- Run `npx prisma generate` immediately after any Prisma schema change.
