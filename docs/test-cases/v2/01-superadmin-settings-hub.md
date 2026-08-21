# Module 01 (M0) — Super Admin Settings Hub — Manual Test Cases

- **Module doc:** `docs/modules/v2/01-superadmin-settings-hub.md`
- **API docs:** `docs/api/v2/admin.md`
- **Data models:** `docs/specs/data-models/user.md`, `docs/specs/data-models/system-setting.md`, `docs/specs/data-models/audit-log.md`
- **Branch:** `feat/v2-superadmin`
- **Automated coverage:** `src/__tests__/admin.routes.test.ts`, `src/__tests__/authMiddleware.guards.test.ts`

## Setup

1. Ensure the M0 migration is applied: `npx prisma migrate deploy`
2. Seed: `npx prisma db seed`
3. Start the server (`npm run dev`).
4. Superadmin login for auth: `superadmin@msc-qcu.tech` / `SuperAdminPass123!`
   (override via `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`).
5. Base URL: `http://localhost:5000`

## Priority legend

- **P0** — Security & critical: auth, RBAC, locks, data leaks. Must pass first.
- **P1** — Core functionality: happy paths + primary error codes.
- **P2** — Edge & regression: filters, caps, malformed input, pre-existing behavior.

---

## P0 — Security & critical

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-01 | `POST /api/v1/auth/admin/sign-in` | superadmin creds (`superadmin@msc-qcu.tech` / `SuperAdminPass123!`) | **200** + token (was 403 before M0) | - [x] |
| TC-02 | `POST /api/v1/auth/student/sign-in` | superadmin creds | **403** | - [x] |
| TC-03 | `POST /api/v1/auth/admin/sign-in` | MEMBER creds (e.g. a seeded `*@gmail.com` user) | **403** | - [x] |
| TC-05 | `GET /api/v2/admin/users` | no token | **401** + `message` | - [x] |
| TC-06 | `GET /api/v2/admin/users` | MEMBER bearer token | **403** + `message` | - [x] |
| TC-07 | `GET /api/v2/admin/users` | ADMIN_HR bearer token | **403** + `message` | - [x] |
| TC-13 | `GET /api/v2/admin/users` | superadmin token — inspect response | every row has **no `password` / `createdAt`-only** fields (safe select) | - [x] |
| TC-18 | `PATCH /api/v2/admin/users/:me/role` | change **own** role away from SUPERADMIN | **403** self-demotion message; role unchanged | - [x] |
| TC-19 | `PATCH /api/v2/admin/users/:id/role` | demote the **last** remaining SUPERADMIN (only 1 in DB) | **403** last-superadmin message; role unchanged | - [x] |
| TC-21 | `PATCH /api/v1/users/:id/role` | `{ "role": "SUPERADMIN" }` with ADMIN_HR token | **400** `errors.role` (V1 endpoint locked to V1 roles) | - [x] |
| TC-25 | `PATCH /api/v2/admin/settings` | `{ "bogus_key": true }` | **400** `errors.bogus_key` | - [x] |
| TC-26 | `PATCH /api/v2/admin/settings` | `{ "merch_shop_open": "yes" }` (non-boolean) | **400** `errors.merch_shop_open` | - [x] |
| TC-33 | *(tamper test)* edit a row's `hash` in `audit_logs` via SQL | then `GET /api/v2/admin/audit-logs` | **200** but `integrityOk: false` + `breakIndex` set; restore the row afterwards | - [x] |
| TC-34 | `PATCH /api/v2/admin/settings` | 21 rapid requests in < 1 min | **429** with `message` (no `errors` key) | - [x] |

## P1 — Core functionality

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-08 | `GET /api/v2/admin/users` | superadmin token | **200**, pagination object with users | - [x] |
| TC-09 | `GET /api/v2/admin/users?search=juan` | partial name/email match | **200**, only matching users | - [x] |
| TC-10 | `GET /api/v2/admin/users?role=MEMBER` | role filter | **200**, only MEMBERs | - [x] |
| TC-14 | `PATCH /api/v2/admin/users/:id/role` | MEMBER → ADMIN_HR (different user) | **200** + a `ROLE_CHANGE` audit entry | - [x] |
| TC-15 | `PATCH /api/v2/admin/users/:id/role` | promote another user to SUPERADMIN | **200** | - [x] |
| TC-16 | `PATCH /api/v2/admin/users/:id/role` | `{ "role": "INVALID" }` | **400** `errors.role` | - [x] |
| TC-17 | `PATCH /api/v2/admin/users/:id/role` | nonexistent `:id` | **404** | - [x] |
| TC-20 | `PATCH /api/v2/admin/users/:id/role` | demote a SUPERADMIN while **2 exist** | **200** | - [x] |
| TC-23 | `GET /api/v2/admin/settings` | superadmin token | **200**, the 3 seeded keys (`events_registration_open`, `merch_shop_open`, `maintenance_mode`) | - [x] |
| TC-24 | `PATCH /api/v2/admin/settings` | `{ "merch_shop_open": true }` | **200**, value persisted + `SETTING_UPDATE` audit entry | - [x] |
| TC-28 | `PATCH /api/v2/admin/settings` | `{ "maintenance_mode": true }` | **200** + `SYSTEM_MAINTENANCE` audit entry | - [x] |
| TC-29 | `GET /api/v2/admin/audit-logs` | after the mutations above | **200**, `integrityOk: true`, ROLE_CHANGE / SETTING_UPDATE rows present | - [x] |
| TC-30 | `GET /api/v2/admin/audit-logs?action=SETTING_UPDATE` | action filter | **200**, only SETTING_UPDATE rows | - [x] |

## P2 — Edge & regression

| # | Endpoint / Action | Scenario | Expected | Result |
|----|-------------------|----------|----------|--------|
| TC-04 | `POST /api/v1/auth/admin/sign-in` | ADMIN_HR creds (V1 admin) | **200** (V1 admin path unchanged) | - [x] |
| TC-11 | `GET /api/v2/admin/users?role=INVALID` | invalid role filter | **400** | - [x] |
| TC-12 | `GET /api/v2/admin/users?pageSize=999` | pageSize cap | **200**, `pageSize` ≤ 50 | - [x] |
| TC-22 | `PATCH /api/v1/users/:id/role` | `{ "role": "MEMBER" }` with ADMIN_HR token | **200** (V1 behavior unchanged) | - [x] |
| TC-27 | `PATCH /api/v2/admin/settings` | `{}` empty body | **400** | - [x] |
| TC-31 | `GET /api/v2/admin/audit-logs?from=not-a-date` | malformed date | **400** | - [x] |
| TC-32 | `GET /api/v2/admin/audit-logs?from=2026-08-01&to=2026-08-31` | date range | **200**, rows within range | - [x] |
| TC-35 | `GET /api/v1/users/me` | superadmin token | **200** (regression) | - [x] |
| TC-36 | `npm test` + `npm run build` | full regression | 158/158 tests pass; tsc clean | - [x] |

## After the suite

- [x] All P0 cases pass before signing off.
- [x] `npm test` still green (158/158).
- [x] Update the suite status in `docs/test-cases/README.md`.
- [x] Any behavior changes found → update `CHANGELOG.md` under `[Unreleased]` (Changelog Obligations).