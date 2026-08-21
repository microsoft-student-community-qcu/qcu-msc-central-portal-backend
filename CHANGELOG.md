# Changelog

All notable changes to the QCU MSC Central Portal backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Convention (AGENTS.md → Changelog Obligations):** every completed task must update this
> file — even a single change. Entries go under `[Unreleased]` in the matching category
> (`Added`, `Changed`, `Fixed`, `Security`, `Removed`), and a task is not done until its
> entry exists.

## [Unreleased]

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
- Reject resetting to a password that matches the current one (#150).

### Changed

- Seed process: enhanced data generation and safety checks.
- Seed: admin accounts use `AdminPass123!` (override via `SEED_ADMIN_PASSWORD`).

### Fixed

- Prisma: `adminMessage` field changed to `TEXT` type to prevent truncation (#133).
