# Changelog

All notable changes to the QCU MSC Central Portal backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Convention (AGENTS.md → Changelog Obligations):** every completed task must update this
> file — even a single change. Entries go under `[Unreleased]` in the matching category
> (`Added`, `Changed`, `Fixed`, `Security`, `Removed`), and a task is not done until its
> entry exists.

## [Unreleased]

### Added

- **V2 Module 04 (M2) — Self-service oversell resolution + per-variant pricing (§8d, Option A, #176):**
  - Per-variant price override (`MerchVariant.price`) — a size can cost more/less than the base item
    (e.g. XL surcharge); order amount + resolution deltas use the effective `variant.price ?? item.price`.
    Migration `20260822140000_v2_merch_variant_price_resolution`.
  - Self-service resolution links for `AWAITING_RESOLUTION` orders: `MerchOrderResolutionToken`
    (SHA-256-hashed, single-use, 14-day TTL, regenerable) + public token-gated endpoints
    `GET /api/v2/merch/resolve/:token`, `POST …/swap`, `POST …/refund`. The sold-out email now carries
    **Choose Another Size** and **Request a refund** CTAs.
  - Swap price settlement: same → `CONFIRMED`; cheaper → `CONFIRMED` + `refundOwed` (100% of the
    difference, settled by a `PRICE_DIFFERENCE` refund via the refund endpoint); pricier → student
    acknowledges, stock is held, order waits in `AWAITING_PAYMENT` for a top-up of just the difference.
  - `MerchOrder.refundRequestedAt`; `?overdueTopUp=true` finance-queue filter for pricier-swap
    top-ups unpaid after 7 days; new emails (`sendMerchSwapConfirmedEmail`, `sendMerchSwapTopUpEmail`,
    `sendMerchRefundRequestedEmail`); audit actions `MERCH_ORDER_SWAPPED`, `MERCH_ORDER_REFUND_REQUESTED`.
  - **Deferred:** the day-7 pre-expiry reminder is a scheduled job — tracked in #181 (no
    in-process scheduler exists yet). Expiry is non-terminal, so this is safe to defer.

- **V2 Module 04 (M2) — Merch oversell resolution groundwork (§8a–§8c, §8e, #176):**
  - Renamed the oversell order state `REFUND_PENDING` → `AWAITING_RESOLUTION` (a student can swap
    OUT of it, so "refund pending" overstated it) — migration
    `20260822130000_v2_merch_resolution_prep` (safe in-place enum rename).
  - Top-up support: `MerchOrder.shortfallAmount` + `PaymentProofSubmission.isTopUp` /
    `shortfallAmount`. Rejecting with `AMOUNT_MISMATCH` now requires the exact shortfall, and the
    student is emailed the precise amount to send (with the GCash QR) — they top up the difference,
    not the whole order.
  - Refund rework: `MerchRefundType` (`FULL` / `PRICE_DIFFERENCE`), `MerchRefund` now keyed
    `@@unique([orderId, type])` (a full refund and a swap-difference refund can coexist);
    `MerchRefundMethod` gains `MAYA` and `MARIBANK`; `MerchOrder.refundOwed` tracks money owed after
    a cheaper swap, with a `?refundOwed=true` finance-queue filter.
  - `MerchOrder.stockHeld` — authoritative "this order holds stock" flag; cancel now restores stock
    from it rather than inferring from status (correct once stock can be held in `AWAITING_PAYMENT`).

- **V2 Module 04 (M2) — Merch refunds + operability (§7a/§7b, #176; oversell tracked in #178):**
  - Refund flow: new `AWAITING_RESOLUTION` / `REFUNDED` order states, `MerchRefund` record
    (amount, method, reference, note, processor), and head-only
    `POST /api/v2/admin/merch/orders/:orderId/refund` — migration
    `20260822120000_v2_merch_refunds_notifications`.
  - Payment-proof attempt history: per-submission officer decision fields
    (`officerDecision`, `rejectionReason`, `financeNote`, `reviewedById`, `reviewedAt`) +
    `GET /api/v2/admin/merch/orders/:orderId` returning the full attempt timeline.
  - Notification tracking: `lastNotifiedAt` / `lastNotificationOk` / `notificationCount` on
    `MerchOrder` (merch email senders now return a boolean); admin order list surfaces these +
    `attemptCount` and accepts the `AWAITING_RESOLUTION` status filter.
  - `POST /api/v2/admin/merch/orders/:orderId/resend-email` — manual re-notify for orders whose
    status email may have silently failed.
  - Public catalog photo proxy `GET /api/v2/merch/photos/:filename` (serves catalog images from
    the private blob container; restricted to the `item-` prefix so it can never serve a payment
    screenshot); catalog `photos` now store filenames, not blob URLs.
  - Two new emails: `sendMerchOutOfStockEmail`, `sendMerchRefundProcessedEmail`.

- **V2 Module 04 (M2) — Org Merch Pre-Orders (#176):**
  - `MerchItem`, `MerchVariant`, `MerchOrder`, `PaymentProofSubmission` models +
    `MerchItemStatus`/`MerchOrderStatus`/`MerchRejectionReason`/`PaymentProofResult` enums —
    migration `20260821130000_v2_add_merch_models`.
  - Public catalog + order flow (`/api/v2/merch`): browse, pre-order, order tracking
    (orderRef + email anti-enumeration), and payment-proof submission with an instant
    cross-order duplicate-reference auto-reject.
  - Finance admin (`/api/v2/admin/merch`): item CRUD, head-only archive/cancel, order
    verification queue, confirm (atomic conditional stock decrement), reject (preset reasons),
    claim, and a protected payment-screenshot proxy.
  - 7 branded email triggers + a reusable `image` block in `renderBrandedEmail` for hosted QR
    images; `qrcode` dependency + `src/utils/qr.ts` (shared QR image helper for Module 02).
  - `merch` Azure Blob container + `saveMerchImage`/`getMerchImageStream`; image-only
    `validateImageMimeType`; `GCASH_NUMBER` / `GCASH_QR_IMAGE_URL` env vars (static org GCash QR).
  - Docs: `docs/api/v2/merch.md`, `docs/specs/data-models/merch.md`,
    `docs/guides/v2/workflows/merch.md`, `docs/test-cases/v2/04-merch-pre-orders.md`;
    tests in `src/__tests__/merch.routes.test.ts`.
  - Type-safety: global Express `Request` augmentation (`src/types/express.d.ts`) exposes
    `req.userId` / `req.userRole` without `any`; merch controllers now use Prisma enum types
    (`MerchItemStatus`/`MerchOrderStatus`/`MerchRejectionReason`) and a `MerchItemGetPayload`
    serializer type in place of `any` casts.

### Fixed

- **Merch `/reject` with `OUT_OF_STOCK` told paid students to "resubmit payment" (#176):** rejecting
  an order with `OUT_OF_STOCK` now auto-reroutes it to `AWAITING_RESOLUTION` (never `REJECTED`) and
  sends the sold-out email (no resubmit button) — the same safe path confirm already used. Closes
  the second half of the oversell "stealing" bug (the reject endpoint was still vulnerable).
- **Merch rejection emails were static and mislabelled (#176):** the rejection email now adapts its
  subject/headline/body/CTA to the reason (§8a) and renders the system reason in a distinct
  **Reason** block, separate from the officer's own **Note from the admin** — previously the
  system's text was shown as if the admin had written it, and every rejection said "We couldn't
  verify your payment". The officer's `financeNote` is now included for every reason, not just
  `OTHER`.
- **Merch refund email leaked the raw method enum (#176):** the refund receipt renders human labels
  (`GCash`, `cash`, `Maya`, `Maribank`) instead of the enum; `OTHER` now requires a note and the
  email points the student to it ("see the note below") instead of printing "via OTHER".
- **Merch image-proxy errors were ambiguous (#176):** the public photo proxy and finance screenshot
  proxy now distinguish a malformed filename ("Invalid … filename") from a valid-but-wrong-class
  one ("This file is not a catalog photo." / "… not a payment screenshot."), so requesting a
  `proof-*` file from the public photo proxy explains itself.
- **Merch oversell told paid students to "resubmit payment" (#176):** confirming an oversold
  order now routes it to `AWAITING_RESOLUTION` (never `REJECTED`) and sends a dedicated out-of-stock
  email with no resubmit button; payment-proof resubmission is blocked for `AWAITING_RESOLUTION` and
  for non-fixable rejections (`OUT_OF_STOCK`) so a paid student can no longer be led into paying
  twice. Structural oversell prevention (soft-hold) is deferred to #178.
- **Merch >6-photo upload closed the connection (#176):** shared `multerErrorHandler`
  (`src/utils/multerError.ts`) drains the request before responding, so exceeding the photo cap
  returns a clean `400 "You can upload at most 6 photos"` instead of a dropped connection; also
  applied to `applicant.routes.ts`. Removed the now-unreachable in-controller photo-count check.
- **Merch screenshot proxy path traversal (#176):** `serveMerchScreenshot` now validates the
  filename (basename + allowlist + `proof-` prefix), closing a local-fallback traversal vector.
- **RBAC — `ADMIN_FINANCE_HEAD` blocked from finance endpoints (#176):** `requireAdminFinance`
  now admits both `ADMIN_FINANCE` and `ADMIN_FINANCE_HEAD` (the head inherits every finance
  capability per module 04 §2); updated `authMiddleware.guards.test.ts` accordingly.
- **Schema drift fix — ApplicationDraft TEXT columns (#000):**
  - Added `@db.Text` to `interestsSkillsHobbies`, `organizationHistory`, and `previousWorksAchievements`
    in `ApplicationDraft` model to match actual DB column types and prevent `prisma migrate dev`
    from generating spurious `VARCHAR(191)` downgrades on every run.
  - Cleaned up leftover `_applicant_legacy_office_backup` table and `AuditLog` index casing via
    migration `20260821120000_cleanup_schema_drift`.
  - Updated `prisma:migrate` npm script to accept `--name` argument — run
    `npm run prisma:migrate -- <name>` to avoid interactive prompt.
- **Docs — Changelog obligation made more prominent:**
  - Added changelog step (step 6) to `CONTRIBUTING.md` Development Workflow.
  - Added changelog checkbox to PR Review Checklist in `CONTRIBUTING.md`.

## [1.1.0] - 2026-08-21

### Added

- **V2 Module 01 (M0) — Super Admin Settings Hub (#171, closes #170):**
  - `SUPERADMIN`, `ADMIN_FINANCE`, `ADMIN_FINANCE_HEAD`, `ADMIN_LOGISTICS_HEAD`, `STARTUP_DEV`
    role values (`UserRole`).
  - `SystemSetting` + `AuditLog` models — migration
    `20260819120000_v2_add_superadmin_roles_settings_audit`.
  - `/api/v2/admin` endpoints: users (list/search + role mutation), settings (GET/PATCH),
    audit-logs (GET) — see `docs/api/v2/admin.md`.
  - Tamper-evident audit logging via HMAC-SHA256 hash chain (`src/utils/audit.ts`).
  - New guards: `requireSuperadmin`, `requireAdminFinance`, `requireAdminFinanceHead`,
    `requireAdminLogisticsHead`.
  - SUPERADMIN seed account + 3 default `SystemSetting` rows.
  - `/api/v2/` API namespace opened; V1 frozen to bugfixes (`docs/api/versioning.md`).
  - RBAC workflow guide (`docs/guides/v2/workflows/rbac.md`) and data-model docs
    (`system-setting.md`, `audit-log.md`).
  - Manual test suite: `docs/test-cases/v2/01-superadmin-settings-hub.md`.

### Changed

- Auth guards refactored onto a `requireRole()` factory with SUPERADMIN inheritance (PRD-V2 NFR).
- Portal sign-in / password-reset boundaries now use shared role sets
  (`src/config/roles.ts`) instead of hardcoded checks.
- `PATCH /api/v1/users/:userId/role` locked to V1 roles and Zod-validated.
- Seed extended (SUPERADMIN + settings); rate limiting added to admin mutation endpoints.

### Fixed

- New V2 admin roles could not sign in through the Admin Portal (hardcoded 2-role check).

## [1.0.2] - 2026-08-20

### Added

- DB reset script with safety guards: refuses production DB, requires confirmation (#134).
- Seed dataset sizes configurable via env vars (`SEED_USER_COUNT`, `SEED_MEMBER_USER_COUNT`, etc.)
  with fail-fast validation (#147, closes #146).

### Changed

- App modularized: extracted auth controller, rate limiters, CORS config from `app.ts` (#152).
- Base routes scoped under `/api` prefix (#152).
- CORS allowlist extended for Vercel preview deployments (#152).
- V2 module docs scaffold (M0–M7), versioned guides, and development wave plan (#169).
- Seed data counts reduced for local testing (#154, closes #153) — superseded by #147.
- Changelog obligation established in AGENTS.md — every task logs its changes.

### Removed

- Retracted the seed-credential documentation notes (seeding guide + M0 test-case setup)
  — they were based on a misdiagnosis: the reported sign-in failures came from testing
  against the production endpoint (`msc-qcu.tech`), not local. No behavior change.

## [1.0.1] - 2026-08-21

### Added

- Sentry: `SENTRY_ENV` override for environment scoping (#129).
- Applicant listing: search, office/campus/college/program/section filters (#138, #140).
- Dashboard-stats aggregation endpoints for applicant management (#141).
- Password reset flow: forgot-password email link (single-use JWT, TTL), validate-reset-token,
  and reset-password endpoints per portal (student/admin) with role boundaries and
  anti-enumeration responses (#139).
- Change-password endpoint (`requireAuth`): verifies current password, keeps current session,
  deletes all others.

### Changed

- Seed process: enhanced data generation and safety checks.
- Seed: admin accounts use `AdminPass123!` (override via `SEED_ADMIN_PASSWORD`).

### Fixed

- Reject resetting to a password that matches the current one (#150).
- Prisma: `adminMessage` field changed to `TEXT` type to prevent truncation (#133).

## [1.0.0] - 2026-08-07

Initial release.

### Added

- Express + Prisma + Better Auth backend scaffold (`feat: initialize backend project`).
- Student and Admin portal sign-in/sign-up flows (email + password, Google OAuth).
- Applicant management: registration, listing with search/filters, approval workflow.
- Event management: CRUD, tiered registration (early-bird / regular / walk-in), sponsorship inquiry.
- Dashboard-stats aggregation endpoints.
- User role management (`APPLICANT`, `MEMBER`, `ADMIN_HR`, `ADMIN_LOGISTICS`).
- Sentry error tracking with `SENTRY_ENV` scoping.
- Comprehensive API documentation (`docs/api/v1/`).
- Data models, workflow guides, and PRD specs (`docs/specs/`).
