# Branch Comparison: `main` ↔ `feature/account-creation-and-authentication`

**23 files changed, 731 insertions, 446 deletions**

---

## 1. Environment & Config

| File | `main` | Branch |
|------|--------|--------|
| `.env.example` | `JWT_SECRET`, `JWT_EXPIRES_IN`, `BETTER_AUTH_SECRET` (generic placeholder) | Removed JWT vars; `BETTER_AUTH_SECRET` has auto-generated hex; added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DOCUMENT_STORAGE_PATH` |
| `src/config/env.ts` | Validates `JWT_SECRET` (min 8), `JWT_EXPIRES_IN` | Removed JWT validation; added `GOOGLE_CLIENT_ID?`, `GOOGLE_CLIENT_SECRET?`, `GITHUB_CLIENT_ID?`, `GITHUB_CLIENT_SECRET?` (all optional) |
| `src/config/database.ts` | *(unchanged)* | — |

---

## 2. Authentication — Complete Rewrite

| File | `main` | Branch |
|------|--------|--------|
| `src/routes/authMiddleware.ts` | **JWT-based:** `jsonwebtoken.verify()` decodes token, extracts `userId`/`role` from payload. 5 comment-heavy guard functions. | **Better Auth:** `auth.api.getSession({ headers })` validates session server-side. Same 5 guards, no comments. Cleaner async flow. |
| `src/config/auth.ts` | **Does not exist** (no Better Auth config) | **New:** `betterAuth()` with Prisma adapter, email/password enabled, Google + GitHub OAuth (optional via env vars), `additionalFields` for `role`, `studentId`, `firstName`, `lastName`, `bearer()` plugin registered |
| `src/app.ts` | `app.use("/api/auth", auth.handler)` — direct passthrough | **Express wrapper:** Manual `Request` creation for Better Auth's Web API handler, Zod pre-validation for sign-up/sign-in (batches ALL errors), `studentId` uniqueness check, rate limiting (5/min sign-up, 10/min sign-in), error translation fallback |

**Key architectural change:**

```
main:     JWT verify → attach userId/role → route checks role
branch:   Better Auth getSession → attach userId/role → route checks role
          + Bearer plugin converts Authorization header to cookie for session lookup
```

---

## 3. Prisma Schema

| Field | `main` | Branch |
|-------|--------|--------|
| `User.lastName` | `String` (required) | `String?` (nullable) |
| `User.firstName` | `String` (required) | `String?` (nullable) |
| `User.name` | *(not present)* | `String?` — Better Auth standard field for full name |
| `User.studentId` | `String? @unique` (nullable) | `String @unique` (required) |
| `User.emailVerified` | *(not present)* | `Boolean @default(false)` — Better Auth requirement |
| `User.password` | *(not present)* | `String?` — managed by Better Auth Account table |
| `ApplicantStatus.APPLIED` | `APPLIED` | Renamed to `APPROVED` |
| `ApplicantStatus.INTERVIEWING` | `INTERVIEWING` | Renamed to `PENDING_REVIEW` |
| `ApplicantStatus.ACCEPTED` | `ACCEPTED` | Renamed to `REJECTED` |
| `ApplicantStatus.REJECTED` | `REJECTED` | Renamed to `CANCELLED` |
| `Applicant.default status` | `APPLIED` | `PENDING_REVIEW` |

**3 new migrations:**

| Migration | Purpose |
|-----------|---------|
| `20260702044552_add_user_name_field` | Adds `name`, `emailVerified`, `password` to User table |
| `20260702044811_rename_applicant_status_values` | Renames enum values in ApplicantStatus |
| `20260702120535_make_first_last_name_optional` | Alters `firstName`/`lastName` to nullable |

---

## 4. Schemas

| File | `main` | Branch |
|------|--------|--------|
| `src/schemas/applicant.schema.ts` | `applicantStatusEnum` = `["APPLIED", "INTERVIEWING", "ACCEPTED", "REJECTED"]` | `["APPROVED", "PENDING_REVIEW", "REJECTED", "CANCELLED"]` (matches Prisma) |

---

## 5. Controllers

### `src/controllers/user.controller.ts` — **New file** (184 lines)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/users/me` | Returns authenticated user profile (id, email, firstName, lastName, studentId, role, image, emailVerified, createdAt) |
| `PATCH /api/v1/users/:userId/role` | Admin-only role update with Zod role validation (APPLICANT/MEMBER/ADMIN_HR/ADMIN_LOGISTICS) |
| `POST /api/v1/users/link-applicant` | Links an Applicant record to the authenticated user by matching email |

**Added in this session:**

- `requireAuth` null-guard at top of `getMe` and `linkApplicant` (returns 401)
- Typo fix: `"Internal server errors"` → `"Internal server error"`

### `src/controllers/applicant.controller.ts`

| Change | Detail |
|--------|--------|
| `createApplicant` email stub | Password-setup link now includes `name` and `studentId` query params |
| `updateApplicantStatus` | When status set to `APPROVED` and applicant has `userId`, auto-upgrades `User.role` to `MEMBER` |

### `src/controllers/eventController.ts`

| Change | Detail |
|--------|--------|
| `registerForEvent` | `lastName`/`firstName` types changed from `string` to `string \| null` (nullable user fields) |
| Registration create | Uses `lastName ?? ""` / `firstName ?? ""` fallback for nullable values |

---

## 6. Routes

### `src/routes/user.routes.ts` — **New file structure**

| `main` | Branch |
|--------|--------|
| *Does not exist* | `GET /me` — `requireAuth`, `getMe` |
| | `POST /link-applicant` — `requireAuth`, `linkApplicant` |
| | `PATCH /:userId/role` — `requireAdminHR`, `updateUserRole` |

---

## 7. Dependencies

| `main` | Branch |
|--------|--------|
| `jsonwebtoken` + `@types/jsonwebtoken` | **Removed** |
| `express-rate-limit@7.4.1` | Bumped to `7.5.1` |
| *(no specific version)* | Better Auth ecosystem: `better-auth`, `@better-auth/prisma-adapter`, `@better-auth/core` |

---

## 8. Documentation

### `docs/api/v1/users.md` — **Rewritten** (316 lines)

| Section | `main` | Branch |
|---------|--------|--------|
| Sign-up example | `{ email, password, name }` (3 fields) | **Minimal** `{ email, password, name, studentId }` + **Full** with optional `firstName`, `lastName`, `role` |
| Session path | `/api/auth/session` | `/api/auth/get-session` |
| Link applicant | *Not documented* | New section with request/response, validation rules |
| Error responses | *Not documented* | Table with 400/401/403/404/500 status codes |

### `docs/guides/workflows/auth-workflow.md`

| `main` | Branch |
|--------|--------|
| Registration + Login only | **Added:** Applicant Account Activation Flow (submit → email → sign-up → link-applicant → admin approve → MEMBER) |
| `/api/auth/session` | `/api/auth/get-session` |
| Missing endpoints | Added `POST /api/v1/users/link-applicant` to table |

### `docs/guides/workflows/applicant-tracking.md`

| `main` | Branch |
|--------|--------|
| "Accepted applicants automatically become MEMBER users" | Clarified: auto-upgrade only happens when `userId` is set (after link-applicant) + must be linked first |

### `docs/specs/data-models/user.md`

| `main` | Branch |
|--------|--------|
| `User` model: 8 fields (cuid, email, password, firstName, lastName, studentId?, role, image) | 12 fields (uuid, email, lastName?, firstName?, middleInitial?, name?, studentId @unique, emailVerified, image, role, password?, timestamps) |
| Enum: `APPLICANT/MEMBER/ADMIN/STUDENT` | `APPLICANT/MEMBER/ADMIN_HR/ADMIN_LOGISTICS` (domain-split admin roles) |

### `README.md`

| `main` | Branch |
|--------|--------|
| Auth: "Better Auth & jsonwebtoken (JWT)" | "Better Auth (email/password + Google/GitHub OAuth)" |
| Env vars table: includes `JWT_SECRET`, `JWT_EXPIRES_IN` | Removed JWT vars; added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| `BETTER_AUTH_SECRET` description | Changed to "(auto-generated)" |

### `AGENTS.md`

| `main` | Branch |
|--------|--------|
| `routes/` description: "Express routes + JWT auth middleware" | "Express routes + Better Auth middleware" |

---

## 9. Summary of What `main` Had That Was Removed

| Feature | Removed |
|---------|---------|
| JWT authentication (`jsonwebtoken`) | Entirely replaced by Better Auth session management |
| `JWT_SECRET` / `JWT_EXPIRES_IN` env vars | Removed from schema, validation, and example |
| `User.password` as managed field | Now handled by Better Auth via Account table |
| CUID-based User IDs | Replaced with UUID |
| Bare `ADMIN` / `STUDENT` roles | Never existed in finalized schema (documentation only) |
| ApplicantStatus: `APPLIED`, `INTERVIEWING`, `ACCEPTED` | Renamed to match RegistrationStatus conventions |

---

## 10. Summary of What Branch Adds

| Feature | Added |
|---------|-------|
| Better Auth (email/password, Google OAuth, GitHub OAuth) | Full auth lifecycle |
| Session management | Sign-up, sign-in, sign-out, get-session |
| Bearer token support | `bearer()` plugin converts `Authorization: Bearer` to session cookie |
| Express wrapper for Better Auth | Web API → Express adapter |
| Rate limiting | 5/min sign-up, 10/min sign-in |
| Zod pre-validation | Batch all errors at once with clean messages |
| `POST /api/v1/users/link-applicant` | Connects applicant → user after sign-up |
| `GET /api/v1/users/me` | Authenticated user profile |
| `PATCH /api/v1/users/:userId/role` | Admin role management |
| Auto MEMBER upgrade | When applicant approved + linked |
| `requireAuth` guard on user routes | Prevents null userId crashes |
| OAuth env vars | Google + GitHub (optional) |
| 3 Prisma migrations | Schema alignment with Better Auth |
