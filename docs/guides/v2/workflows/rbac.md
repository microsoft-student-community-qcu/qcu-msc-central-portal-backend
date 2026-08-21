# RBAC & Authorization — V2

> **Module 01 (M0)** — role model expansion, SUPERADMIN inheritance, portal boundaries.
> Supersedes the V1 RBAC guide (`docs/guides/v1/workflows/rbac.md`) for role behavior.

## Role Model

Nine roles, split into student-facing and admin-facing surfaces:

| Role | Surface | Notes |
|------|---------|-------|
| `APPLICANT` | Student portal | Post-account-creation, pending membership approval (V1) |
| `MEMBER` | Student portal | Active QCU MSC member (V1) |
| `STARTUP_DEV` | Student portal | Technical talent — showcase submissions (Module 05) |
| `ADMIN_HR` | Admin portal | Applicant pipeline (V1) |
| `ADMIN_LOGISTICS` | Admin portal | Event logistics & check-in (V1, Modules 02–03) |
| `ADMIN_LOGISTICS_HEAD` | Admin portal | Logistics head — inherits logistics + former `ADMIN_CORE` perms |
| `ADMIN_FINANCE` | Admin portal | Merch catalog, pre-orders, payment status (Module 04) |
| `ADMIN_FINANCE_HEAD` | Admin portal | Finance head — inherits finance + former `ADMIN_CORE` perms |
| `SUPERADMIN` | Admin portal | System lead — **inherits every restricted action** |

> `ADMIN_CORE` was intentionally removed — its permissions are folded into the heads and SUPERADMIN.
> Guests (QCU student, outsider) have no User record — behavioral role only.

## Role Inheritance

`SUPERADMIN` automatically passes **every** `require*` guard in the system (PRD-V2 Global NFR).

All guards are built on a single `requireRole(...allowedRoles)` factory in
`src/routes/authMiddleware.ts`: a request passes when the session role is in `allowedRoles`
**or** equals `SUPERADMIN`. Available guards:

| Guard | Passes for |
|-------|-----------|
| `requireAuth` | Any authenticated user |
| `requireAdminHR` | `ADMIN_HR` (+ SUPERADMIN) |
| `requireAdminLogistics` | `ADMIN_LOGISTICS` (+ SUPERADMIN) |
| `requireAnyAdmin` | `ADMIN_HR`, `ADMIN_LOGISTICS` (+ SUPERADMIN) |
| `requireMemberOrAdmin` | `MEMBER`, `ADMIN_HR`, `ADMIN_LOGISTICS` (+ SUPERADMIN) |
| `requireSuperadmin` | `SUPERADMIN` only |
| `requireAdminFinance` | `ADMIN_FINANCE` (+ SUPERADMIN) |
| `requireAdminFinanceHead` | `ADMIN_FINANCE_HEAD` (+ SUPERADMIN) |
| `requireAdminLogisticsHead` | `ADMIN_LOGISTICS_HEAD` (+ SUPERADMIN) |

Role sets (`V1_ROLES`, `ADMIN_ROLES`, `ALL_ROLES`) live in `src/config/roles.ts` — **never**
hardcode role arrays in controllers or schemas.

## Portal Boundaries

| Portal | Allowed roles | Enforced in |
|--------|---------------|-------------|
| Student sign-in (`POST /api/v1/auth/student/sign-in`) | All non-admin roles | `auth.controller.ts` — blocks `ADMIN_ROLES` |
| Admin sign-in (`POST /api/v1/auth/admin/sign-in`) | All `ADMIN_ROLES` | `auth.controller.ts` — allowlist |
| Password reset (student/admin portals) | Same sets | `passwordReset.controller.ts` |

V2 roles log in through the **Admin Portal**; `STARTUP_DEV` uses the Student Portal.

## Role Management (SUPERADMIN only)

- **V2 surface:** `GET /api/v2/admin/users` (search/paginate) and
  `PATCH /api/v2/admin/users/:userId/role` — full 9-role control.
- **Locks:** self-demotion (403) and last-superadmin demotion (403) are enforced server-side.
- **V1 surface:** `PATCH /api/v1/users/:userId/role` stays `ADMIN_HR`-guarded but is **locked to
  the V1 role set** — it can never grant V2 roles.
- Every role change writes an `AuditLog` entry (`ROLE_CHANGE`).

## Related

- API: [`docs/api/v2/admin.md`](../../api/v2/admin.md)
- Data model: [`docs/specs/data-models/user.md`](../../specs/data-models/user.md)
- Module doc: [`docs/modules/v2/01-superadmin-settings-hub.md`](../../modules/v2/01-superadmin-settings-hub.md)