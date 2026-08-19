# Workflows — V2 Index

This index maps V2 workflow topics to their documentation source. Where V2 behavior is unchanged, the V1 guide (`../v1/workflows/`) remains the reference. Where behavior changes, the per-module doc in [`docs/modules/v2/`](../../modules/v2/) is authoritative.

| Topic | Status in V2 | Source |
|-------|--------------|--------|
| Authentication & sessions | Unchanged (V1 behavior; role set expanded) | [v1: auth-workflow](../v1/workflows/auth-workflow.md) |
| Applicant tracking (ADMIN_HR) | Unchanged | [v1: applicant-tracking](../v1/workflows/applicant-tracking.md) |
| Event creation & registration | Changed — 3 event types, PENDING → approve → QR dispatch, office caps, self-cancellation | [Module 02 — Event Registration & Tickets](../../modules/v2/02-event-registration-tickets.md) · [Module 03 — Event Logistics & Check-In](../../modules/v2/03-event-logistics-checkin.md) |
| QR scanner & check-in | Changed — QR image tickets, approval-gated dispatch | [Module 03 — Event Logistics & Check-In](../../modules/v2/03-event-logistics-checkin.md) |
| RBAC & authorization | Changed — SUPERADMIN inheritance, finance/logistics heads, STARTUP_DEV | [Module 01 — Super Admin Settings Hub](../../modules/v2/01-superadmin-settings-hub.md) |
| Email notifications | Changed — new triggers (QR tickets, merch, scholarship, event cancellation) | Per-module "Email Triggers" sections; V1 baseline: [v1: email-notifications](../v1/workflows/email-notifications.md) |
| Merch pre-orders (Finance) | New in V2 | [Module 04 — Merch Pre-Orders](../../modules/v2/04-merch-pre-orders.md) |
| Project showcase | New in V2 | [Module 05 — Project Incubation Showcase](../../modules/v2/05-project-showcase.md) |
| Analytics dashboard | New in V2 | [Module 06 — Executive Data Analytics Dashboard](../../modules/v2/06-analytics-dashboard.md) |
| DataCamp scholarship | New in V2 | [Module 07 — DataCamp Scholarship Gateway](../../modules/v2/07-datacamp-scholarship.md) |
| Seeding | Will change (superadmin seed, system settings) | V1 baseline: [v1: seeding](../v1/workflows/seeding.md) |

## Versioning Notes

- V1 guides live in `docs/guides/v1/workflows/` and are frozen — they document shipped V1 behavior.
- V2 guides are created per module **only when a module is built**; until then, module docs are the single source of truth for planned V2 behavior.
- When a module is implemented, move its workflow description from the module doc into a `docs/guides/v2/workflows/<topic>.md` guide and link it here.