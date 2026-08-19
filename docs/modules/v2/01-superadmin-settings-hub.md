# Module 01 — Super Admin Settings Hub

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Super Admin Settings Hub |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Super Admin Settings Hub; Global NFRs § Role Inheritance |
| **Milestone** | M0 — Foundation |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | None — foundational module, ships first |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| `SUPERADMIN` | Everything below + inherits every restricted action in all other modules |
| `ADMIN_HR` | View applicable admin surfaces (no settings access) |
| `ADMIN_LOGISTICS` / `ADMIN_LOGISTICS_HEAD` | No settings access |
| `ADMIN_FINANCE` / `ADMIN_FINANCE_HEAD` | No settings access |

> Heads + `SUPERADMIN` inherit the (removed) `ADMIN_CORE` permissions. `SUPERADMIN` passes every `require*` guard in the system.

## 3. Workflows

### Flow 1 — Role Management

Superadmin opens the protected role-management table, searches any registered user, and mutates their role (e.g., Member → Admin). Changes take effect immediately and are written to the audit log.

### Flow 2 — System Toggles

Superadmin flips global boolean switches that govern subsystem availability:
- Event Registrations Open
- Merch Shop Open
- Maintenance Mode
- Scholarship seats configuration

### Flow 3 — Audit Viewer

Read-only interface listing tamper-evident audit logs of all administrative actions across the system (role changes, toggles, event mutations, order mutations, showcase approvals, scholarship decisions).

## 4. Acceptance Criteria & Edge Cases

- [ ] Role mutation of any registered user (e.g., upgrading a Member to Admin)
- [ ] Global boolean toggles for subsystem availability
- [ ] Read-only audit log viewer
- **Self-Demotion Lock:** backend must strictly prevent a Superadmin from downgrading their own role to avoid permanent system lockouts.

## 5. Data Model Impact

> Proposed — refine during build.

- **Models:**
  - `SystemSetting` — `key` (unique), `value` (JSON/boolean), `description`, `updatedById`, timestamps. Keys: `events_registration_open`, `merch_shop_open`, `maintenance_mode`, `datacamp_max_seats`
  - `AuditLog` — `actorId`, `action` (enum/string), `entityType`, `entityId`, `details` (JSON), `ipAddress`, `createdAt`
- **Enums:** `UserRole` += `SUPERADMIN`, `ADMIN_FINANCE`, `ADMIN_FINANCE_HEAD`, `ADMIN_LOGISTICS_HEAD`, `STARTUP_DEV`
- **Indexes:** `SystemSetting.key` unique; `AuditLog.createdAt` (desc) for viewer pagination

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| GET | `/api/v1/admin/users` | `requireSuperadmin` | — | List/search users (role management table) |
| PATCH | `/api/v1/admin/users/:userId/role` | `requireSuperadmin` | — | Role mutation; self-demotion blocked server-side |
| GET | `/api/v1/admin/settings` | `requireSuperadmin` | — | All toggles |
| PATCH | `/api/v1/admin/settings` | `requireSuperadmin` | — | Update toggles (audit logged) |
| GET | `/api/v1/admin/audit-logs` | `requireSuperadmin` | — | Paginated audit viewer |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Role change notification (optional) | Role changed | Affected user |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** `events_registration_open`, `merch_shop_open`, `maintenance_mode`
- **AuditLog events:** `ROLE_CHANGE`, `SETTING_UPDATE`, `SYSTEM_MAINTENANCE`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Should `ADMIN_FINANCE_HEAD` / `ADMIN_LOGISTICS_HEAD` also manage settings, or strictly `SUPERADMIN`? | TBD | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Self-demotion returns 400/403 and leaves role unchanged
- [ ] SUPERADMIN passes all other modules' guards
- [ ] Toggle PATCH writes an AuditLog entry
- [ ] Docs updated (user.md data model, RBAC guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Super Admin Settings Hub
- Guides: `docs/guides/v2/workflows.md` (RBAC topic)
- API: `docs/api/v2/`
- Data models: `docs/specs/data-models/user.md`