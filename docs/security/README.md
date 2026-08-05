# Backend Security Audit — QCU MSC Central Portal

- **Audit date:** 2026-08-04
- **Scope:** `src/` (app, routes, middleware, controllers, services, utils, config, schemas), `prisma/schema.prisma`, `prisma/seed.ts`, `src/functions/app.ts`, `host.json`, `.env.example`, `.gitignore`, `package.json` / lockfile, tests
- **Methodology:** OWASP Top 10 review, threat-modeled request tracing, `npm audit`, secret-hygiene verification

---

## Contents

| Section | Location |
|---|---|
| Executive Summary | [Below](#executive-summary) |
| Findings by Category | [`findings/`](./findings/) |
| Security Score | [Below](#security-score) |
| Risk Matrix | [Below](#risk-matrix) |
| Prioritized Remediation Plan | [Below](#prioritized-remediation-plan) |
| Positive Security Practices | [Below](#positive-security-practices) |
| Remaining Unknowns | [Below](#remaining-unknowns) |

---

## Executive Summary

The backend is a Node.js/Express + Better Auth + Prisma (MySQL) API deployed on Azure Functions, with public OCR (Tesseract) flows, public application/event registration flows, and dual admin roles (`ADMIN_HR`, `ADMIN_LOGISTICS`). The codebase shows clear evidence of prior security hardening (setup-token gating of account creation, magic-byte file validation, ownership checks on cancel/resubmit, allowlist-based body reconstruction, consistent RBAC guards).

**The most serious issues are architectural:**

1. **Rate limiting and OCR abuse tracking are keyed on `req.ip` without `trust proxy`** — behind Azure's gateway every client shares one IP, so all rate-limit buckets are effectively *global*, and the OCR failure counter (3 strikes → manual mode) can be triggered for the **entire user base** by one attacker. Combined with in-memory per-instance state on a horizontally scaled Function App, every abuse control is both globally shared AND bypassable across instances. (`F-02`, `F-03`)
2. **The public event-registration endpoint is unauthenticated and unrate-limited**, and manual-mode registrations (nullable `studentId`) evade the unique constraint — enabling capacity exhaustion and email flooding with trivial effort. (`F-04`)
3. **CORS allows any `*.azurestaticapps.net` origin with credentials** — a free, attacker-controllable hosting platform — permitting credentialed cross-origin reads (e.g., of admin data) against any victim with an active session. (`F-01`)
4. **`better-auth` 1.6.18 is pinned to a version with a High-severity advisory** (GHSA-qq9h-g4jm-xgf3), and `file-type` 16.5.4 has a moderate DoS advisory on the direct upload path. (`F-10`)
5. **Account-creation gates can be bypassed via the generic Better Auth proxy** (OAuth endpoints) if social providers are ever configured, and setup tokens are returned in HTTP response bodies where they can leak into logs/extensions. (`F-16`, `F-05`)

There are **no critical (RCE-class) findings**, no SQL injection, no plaintext secrets in production env files, and file uploads are properly magic-byte validated.

---

## Findings Index

Findings are categorized under `docs/security/findings/`. Each file follows the same template: summary → code evidence → why it is vulnerable → attack scenario → severity/exploitability → recommended fix (with example code).

### Access Control
| ID | Finding | Severity |
|---|---|---|
| [F-06](./findings/access-control/F-06-protected-file-proxy-idor.md) | Latent IDOR + traversal-shaped file proxy (currently shadowed by route order) | Medium (latent) |

### API Security
| ID | Finding | Severity |
|---|---|---|
| [F-01](./findings/api-security/F-01-cors-origin-allowlist.md) | CORS allowlist permits attacker-controlled origins with credentials | High |
| [F-02](./findings/api-security/F-02-rate-limit-ip-keying.md) | Rate limiting & OCR failure tracking keyed on a single shared proxy IP | High |
| [F-04](./findings/api-security/F-04-event-registration-abuse.md) | Public event registration: no auth/limits, capacity race, NULL-studentId duplicates | High |
| [F-11](./findings/api-security/F-11-missing-security-headers.md) | No security headers (helmet absent), no nosniff on file proxy | Medium |
| [F-12](./findings/api-security/F-12-health-endpoint-leak.md) | `/health` leaks internal error details | Low |
| [F-13](./findings/api-security/F-13-admin-account-enumeration.md) | Admin-account enumeration via student sign-in endpoint | Low |
| [F-14](./findings/api-security/F-14-unbounded-pagination-filters.md) | Unbounded / unvalidated pagination and filters | Low |
| [F-15](./findings/api-security/F-15-ocr-endpoint-abuse.md) | OCR endpoint: CPU-heavy, storage-cost abuse, per-IP only | Medium |

### Authentication & Session Management
| ID | Finding | Severity |
|---|---|---|
| [F-03](./findings/authentication/F-03-inmemory-ocr-state-scaleout.md) | In-memory OCR sessions/failure counters don't survive scale-out | Medium-High |
| [F-05](./findings/authentication/F-05-setup-token-response-leak.md) | Setup tokens returned in HTTP responses; OCR re-scan mints fresh tokens | Medium |
| [F-16](./findings/authentication/F-16-oauth-signup-gate-bypass.md) | Generic Better Auth proxy exposes unvetted endpoints; OAuth bypasses the setup-token gate | Medium |
| [F-17](./findings/authentication/F-17-per-account-brute-force.md) | Per-account brute-force protection limited | Low-Medium |

### Business Logic
| ID | Finding | Severity |
|---|---|---|
| [F-07](./findings/business-logic/F-07-ocr-session-multi-use.md) | Single OCR session can mint multiple records (draft + direct applicant) | Medium |

### Configuration & Secrets
| ID | Finding | Severity |
|---|---|---|
| [F-08](./findings/configuration-secrets/F-08-committed-example-secret.md) | Committed fixed `BETTER_AUTH_SECRET` in `.env.example` | Medium |
| [F-09](./findings/configuration-secrets/F-09-seed-default-credentials.md) | Seed script installs known-credential admin accounts outside production | Medium |

### Dependencies
| ID | Finding | Severity |
|---|---|---|
| [F-10](./findings/dependencies/F-10-vulnerable-dependencies.md) | Vulnerable / outdated dependencies (`better-auth`, `file-type`, `uuid`, ...) | High (1) / Moderate |

### Logging & Error Handling
| ID | Finding | Severity |
|---|---|---|
| [F-18](./findings/logging-error-handling/F-18-pii-and-error-logging.md) | Logging of PII (recipient emails) and raw error objects | Low |

---

## Security Score

**Overall: 69 / 100**

| Category | Score | Notes |
|---|---|---|
| Authentication | 7.5/10 | Setup-token gating solid; OAuth bypass risk, enumeration, weak lockout, advisory pending |
| Authorization | 7.5/10 | Guards consistent; latent file-proxy IDOR (shadowed), admin promotion allowed by design |
| Validation | 9/10 | Zod everywhere + magic-byte files; minor NaN/limit gaps |
| API Security | 5.5/10 | CORS over-permissive; rate limits keyed to shared IP; unbounded pagination; no headers |
| Cryptography | 8/10 | HS256 JWTs, 24h expiry, purpose claims; shared secret with sessions; no rotation policy |
| Configuration | 6/10 | No helmet/HSTS; health leaks; example secret; `staging` excluded from seed guard |
| Secrets | 7.5/10 | Env files ignored; committed example secret; seed fallback creds |
| Logging | 6/10 | PII emails logged; raw error objects |
| Error Handling | 8/10 | Generic client errors; `/health` exception |
| Infrastructure Readiness | 5.5/10 | In-memory state under scale-out; trust-proxy misconfiguration; cookie flags unverified |

---

## Risk Matrix

| Risk | Likelihood | Impact | Exposure |
|---|---|---|---|
| Global rate-limit/OCR-failure poisoning (F-02) | High | High | All public flows |
| Event-registration spam/capacity DoS (F-04) | High | Medium-High | Public endpoint |
| CORS credentialed cross-origin reads (F-01) | Medium | High (admin PII) | Admin/member sessions |
| Scale-out state loss (F-03) | High | Medium | Availability |
| Setup-token leakage (F-05) | Medium | Medium-High | Account creation |
| better-auth advisory (F-10) | Low (feature off) | High | — |
| Route-shadow IDOR activation (F-06) | Low | High | Refactors |
| Seed default admins (F-09) | Low | Critical | Staging DBs |
| OAuth gate bypass (F-16) | Low-Medium | Medium-High | If providers enabled |

---

## Prioritized Remediation Plan

Ordered from highest risk to lowest.

| Priority | Issue | Severity | Est. Fix Time |
|---|---|---|---|
| P0 | Fix `trust proxy` + per-client IP for rate limits & OCR failures; add per-email buckets ([F-02](./findings/api-security/F-02-rate-limit-ip-keying.md)) | High | 2–4 h |
| P0 | Harden event registration: limiter, atomic capacity (count APPROVED only), email verification for guests, manual caps ([F-04](./findings/api-security/F-04-event-registration-abuse.md)) | High | 4–8 h |
| P0 | Tighten CORS to exact origins; remove regex arms; dev-only localhost ([F-01](./findings/api-security/F-01-cors-origin-allowlist.md)) | High | 30 min |
| P1 | Upgrade `better-auth` ≥1.6.22, `file-type` ≥21.3.1/22, `uuid` ≥11 ([F-10](./findings/dependencies/F-10-vulnerable-dependencies.md)) | High | 1–2 h |
| P1 | Redis-backed OCR sessions/failure store ([F-03](./findings/authentication/F-03-inmemory-ocr-state-scaleout.md)) | Medium-High | 4–8 h |
| P1 | Stop returning setup tokens in responses; email-only delivery; align OCR re-scan branch ([F-05](./findings/authentication/F-05-setup-token-response-leak.md)) | Medium | 2 h |
| P1 | Fix file-proxy route order + ownership checks + filename sanitization ([F-06](./findings/access-control/F-06-protected-file-proxy-idor.md)) | Medium | 2–3 h |
| P1 | Consume OCR session on `createDraft`; unique `Applicant.studentId` ([F-07](./findings/business-logic/F-07-ocr-session-multi-use.md)) | Medium | 1–2 h |
| P2 | Rotate/placeholder the example `BETTER_AUTH_SECRET`; add gitleaks CI ([F-08](./findings/configuration-secrets/F-08-committed-example-secret.md)) | Medium | 30 min |
| P2 | Seed: refuse fallback creds unless DB is localhost; include staging ([F-09](./findings/configuration-secrets/F-09-seed-default-credentials.md)) | Medium | 30 min |
| P2 | Add helmet; nosniff on file proxy ([F-11](./findings/api-security/F-11-missing-security-headers.md)) | Medium | 30 min |
| P2 | Whitelist Better Auth proxy paths; disable social providers until gated ([F-16](./findings/authentication/F-16-oauth-signup-gate-bypass.md)) | Medium | 2 h |
| P3 | Pagination caps + filter validation ([F-14](./findings/api-security/F-14-unbounded-pagination-filters.md)); health sanitization ([F-12](./findings/api-security/F-12-health-endpoint-leak.md)); enumeration fix ([F-13](./findings/api-security/F-13-admin-account-enumeration.md)); OCR cost caps ([F-15](./findings/api-security/F-15-ocr-endpoint-abuse.md)); per-account lockout ([F-17](./findings/authentication/F-17-per-account-brute-force.md)); log redaction ([F-18](./findings/logging-error-handling/F-18-pii-and-error-logging.md)) | Low | 3–4 h total |

---

## Positive Security Practices

- **Setup-token gating of account creation** (`src/app.ts:139-197`): email + applicant binding, one-time use via `userId === null`, clean allowlisted body reconstruction (no mass assignment of `role`).
- **Magic-byte file validation** on every upload (`src/utils/fileValidation.ts`) with size limits (5 MB OCR, 10 MB docs) and an OCR upload timeout (`src/routes/ocr.routes.ts:51-71`).
- **Consistent RBAC guards** (`src/routes/authMiddleware.ts`): role-specific guards, no bare `ADMIN`/`STUDENT` checks; ownership checks in `cancelApplication` / `resubmitApplication` / `linkApplicant`.
- **Parameterized ORM only** — no raw SQL (only `SELECT 1` in health); Prisma enums + unique constraints (`email`, `eventId+studentId`, `eventId+userId`, `qrPayload`).
- **Zod validation everywhere** with human-readable messages; enum filters on the applicants list; `https://` URL constraints on portfolio/github/facebook links.
- **OCR sessions deleted after use** in the direct applicant and event-registration paths; session IDs are UUIDv4.
- **Anti-enumeration on `resendSetupLink`** (identical response whether or not an account exists).
- **Email HTML escaping** (`src/utils/emailTemplate.ts` `esc()` / `escapeAttribute`) for all dynamic values.
- **Consistent API response contract**; generic 500s without stack traces to clients; Sentry error handler.
- **Env hygiene**: `.env` / `.env.production` gitignored; production secret differs from the committed example (verified without disclosure).
- **401/403 messages use `message`**, and the 404 handler is uniform.
- **Patched Express 4.22.2 / multer 1.4.5-lts.2** (no path-to-regexp or multer CVEs in the tree).

---

## Remaining Unknowns (cannot be verified from the codebase alone)

- **Session cookie flags in production** (Secure/HttpOnly/SameSite) — Better Auth derives them from the base URL; must verify via `Set-Cookie` on the live deployment.
- **Production `BETTER_AUTH_SECRET` strength/rotation** and whether the example value was ever deployed (verified: currently differs locally).
- **Azure Function App instance count / affinity** — determines the real-world impact of F-03.
- **Whether Google/GitHub OAuth is actually enabled in production** — determines F-16 exploitability.
- **Blob container access level** (`ocr` / `documents`) — if created public via the portal, stored URLs are directly downloadable, bypassing the proxy entirely. Default is private; verify in the Azure portal.
- **Azure gateway behavior for `X-Forwarded-For`** — needed to pick the right `trust proxy` setting.
- **Better Auth's built-in sign-in attempt rate limiting** (library default) — whether per-account throttling already applies.
- **MySQL server hardening** (TLS for `DATABASE_URL`, least-privilege user, network restrictions) — not visible in code.
- **Resend / `msc-qcu.tech` domain SPF, DKIM, DMARC** — affects email deliverability and spoofing of the org's emails (out of repo scope).
