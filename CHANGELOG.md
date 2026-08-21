# Changelog

All notable changes to the QCU MSC Central Portal backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Convention (AGENTS.md → Changelog Obligations):** every completed task must update this
> file — even a single change. Entries go under `[Unreleased]` in the matching category
> (`Added`, `Changed`, `Fixed`, `Security`, `Removed`), and a task is not done until its
> entry exists.

## [Unreleased]

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
- Seed data counts reduced for local testing (#154, closes #153) — superseded by #147.

### Changed

- App modularized: extracted auth controller, rate limiters, CORS config from `app.ts` (#152).
- Base routes scoped under `/api` prefix (#152).
- CORS allowlist extended for Vercel preview deployments (#152).
- V2 module docs scaffold (M0–M7), versioned guides, and development wave plan (#169).
- Changelog obligation established in AGENTS.md — every task logs its changes.

### Removed

- Retracted the seed-credential documentation notes (seeding guide + M0 test-case setup)
  — they were based on a misdiagnosis: the reported sign-in failures came from testing
  against the production endpoint (`msc-qcu.tech`), not local. No behavior change.
