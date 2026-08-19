# Module Documentation

This folder contains **per-module handoff docs** for the QCU MSC Central Portal. Each module gets a single self-contained Markdown file so an assignee can own one module end-to-end without reading the full PRD.

## Layout

- `v2/` — V2 (Events & Logistics Release) modules, sourced from `docs/specs/PRD-V2.md`
- `_template.md` — the skeleton every module doc follows (copy it when starting a new module)

## V2 Module Index

| # | Module | Milestone | PRD Reference | Status | Assignee |
|---|--------|-----------|---------------|--------|----------|
| 01 | [Super Admin Settings Hub](v2/01-superadmin-settings-hub.md) | M0 — Foundation | Module Specs § Super Admin Settings Hub | Not Started | |
| 02 | [Event Registration & QR Tickets](v2/02-event-registration-tickets.md) | M1 — Events v2 | Module Specs § Event Registration & QR Tickets · PRD Module 2 (Logistics) | Not Started | |
| 03 | [Event Logistics & Check-In](v2/03-event-logistics-checkin.md) | M1 — Events v2 | Module Specs § Event Logistics & Check-In · PRD Module 2 (Logistics) | Not Started | |
| 04 | [Org Merch Pre-Orders](v2/04-merch-pre-orders.md) | M2 — Merch | Module Specs § Org Merch Pre-Orders · PRD Module 1 (Finance) | Not Started | |
| 05 | [Project Incubation Showcase](v2/05-project-showcase.md) | M3 — Showcase | Module Specs § Project Incubation Showcase | Not Started | |
| 06 | [Executive Data Analytics Dashboard](v2/06-analytics-dashboard.md) | M4 — Analytics | Module Specs § Executive Data Analytics Dashboard | Not Started | |
| 07 | [DataCamp Scholarship Gateway](v2/07-datacamp-scholarship.md) | M5 — DataCamp | Module Specs § DataCamp Scholarship Gateway | Not Started | |

## Milestones

| Milestone | Modules | Scope |
|-----------|---------|-------|
| M0 — Foundation | 01 | Role model redesign, superadmin inheritance, system toggles, audit logs |
| M1 — Events v2 | 02, 03 | Event model extension, approval-gated QR tickets, 3 event types, office caps |
| M2 — Merch | 04 | Merch catalog, pre-orders, GCash payment verification |
| M3 — Showcase | 05 | Public project gallery + approval workflow |
| M4 — Analytics | 06 | Aggregation endpoints across events/merch/members |
| M5 — DataCamp | 07 | Scholarship intake, evaluation, automated provisioning |

## Workflow

1. Assign yourself a module (fill the **Assignee** column).
2. Open the module file — it contains everything: roles, workflows, edge cases, proposed data model + API surface, testing checklist.
3. Build on a branch off `v2-issue-169` (the V2 source-of-truth trunk).
4. When the module ships, promote its workflow content into `docs/guides/v2/workflows/` and update `docs/guides/v2/workflows.md`.