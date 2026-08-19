# Module 06 — Executive Data Analytics Dashboard

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Executive Data Analytics Dashboard |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Executive Data Analytics Dashboard |
| **Milestone** | M4 — Analytics |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Modules 01–05 (needs HR, Events, Finance pipelines producing data) |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| Heads (`ADMIN_HR`, `ADMIN_LOGISTICS_HEAD`, `ADMIN_FINANCE_HEAD`) | View the executive analytics dashboard (inherits removed `ADMIN_CORE` permission) |
| `SUPERADMIN` | Full access |

> Per the confirmed role model, `ADMIN_CORE` was removed and its "views analytics" permission fused into all heads + SUPERADMIN.

## 3. Workflows

### Flow 1 — Executive Views Health Metrics

Protected dashboard aggregates data from the HR (applicant/member), Events (registrations/attendance), and Finance (merch orders) pipelines to compute automated health metrics.

### Flow 2 — Interactive Charts

- Member growth trajectories (applicant pipeline)
- Event attendance ratios (registrations vs. `hasAttended`)
- Merchandise conversion rates (order funnel: AWAITING_PAYMENT → PENDING_VERIFICATION → CONFIRMED → PAID_AND_CLAIMED)

### Flow 3 — PDF Export

Client-side utility captures the dashboard state and exports a formatted PDF for executive meetings. **Backend serves the data only; PDF rendering is frontend responsibility.**

## 4. Acceptance Criteria & Edge Cases

- [ ] Data aggregation across HR, Events, Finance pipelines
- [ ] Interactive charts for member growth, event attendance, merch conversion
- [ ] Client-side PDF export utility
- Empty/fresh data must render gracefully (no division-by-zero on ratios).

## 5. Data Model Impact

> Proposed — refine during build. Read-only aggregation — likely no new tables.

- **V1 baseline (existing):** `GET /api/v1/applicants/counts`, `GET /api/v1/applicants/dashboard-stats`
- **New queries:** event funnel + attendance ratio, member growth over time, merch conversion funnel
- Aggregate via SQL counts/group-bys on existing models; add indexes if needed for dashboard queries.

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| GET | `/api/v1/admin/analytics/overview` | `requireHead` (any head or SUPERADMIN) | — | Single aggregate payload |
| GET | `/api/v1/admin/analytics/events` | `requireHead` | — | Event funnel + attendance ratios |
| GET | `/api/v1/admin/analytics/members` | `requireHead` | — | Member growth over time |
| GET | `/api/v1/admin/analytics/merch` | `requireHead` | — | Merch conversion funnel |

## 7. Email Triggers

None — dashboard is pull-only.

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** none
- **AuditLog events:** none (read-only surface)

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Should any individual officer (non-head) see a scoped view? | No — heads + SUPERADMIN only | |

## 10. Testing Checklist

- [ ] 200 success, 401 auth, 403 forbidden for non-heads
- [ ] Ratios handle empty datasets without errors
- [ ] Aggregates match raw table counts in a seeded DB
- [ ] Docs updated (analytics guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Executive Data Analytics Dashboard
- Guides: `docs/guides/v2/workflows.md` (Analytics topic)
- API: `docs/api/v2/`
- Data models: `docs/specs/data-models/`