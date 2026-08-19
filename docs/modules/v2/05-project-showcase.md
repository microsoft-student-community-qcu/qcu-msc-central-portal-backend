# Module 05 — Project Incubation Showcase

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Project Incubation Showcase |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Project Incubation Showcase |
| **Milestone** | M3 — Showcase |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Module 01 (guards + audit) |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| Public guest / corporate lead | Views the public showcase gallery to verify student competencies |
| Startup Developer (`STARTUP_DEV`) | Submits live web apps, GitHub repos, data-viz models |
| `MEMBER` | May submit projects (assumed; see Open Questions) |
| Heads + `SUPERADMIN` | Approve/reject submitted projects (inherits removed `ADMIN_CORE` permission) |

## 3. Workflows

### Flow 1 — Developer Submits a Project

Internal form captures: title, description, live deployment URL, repository URL, tech-stack tags, submitter info. **URL validation:** backend checks the HTTP status of submitted URLs and instantly rejects broken or improperly formatted links. Submissions are **quarantined** (hidden) until approved.

### Flow 2 — Core Approval

A head (or SUPERADMIN) reviews quarantined submissions and approves/rejects. Approved projects appear on the public grid.

### Flow 3 — Public Grid

Filterable public gallery of project cards displaying live deployments, repositories, and UI tags for the tech stack.

## 4. Acceptance Criteria & Edge Cases

- [ ] Public grid renders cards: live deployments, repos, tech-stack tags
- [ ] Submission workflow quarantines until manual approval
- **Broken link detection:** reject broken or improperly formatted URLs at submission time.
- Rejected submissions can be edited and resubmitted (re-enter quarantine).

## 5. Data Model Impact

> Proposed — refine during build.

- **Model:** `ShowcaseProject` — title, description, url, repoUrl?, techTags (string[]/JSON), submitterName, submitterEmail?, `submitterUserId`?, `status` (`QUARANTINED`/`APPROVED`/`REJECTED`), `reviewedById`?, `reviewedAt`, timestamps
- **Indexes:** `status` (grid filtering); URL uniqueness for duplicate-submission prevention

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| GET | `/api/v1/showcase` | none | — | Public grid, APPROVED only, tag filter |
| POST | `/api/v1/showcase/submissions` | `requireMemberOrAdmin` (auth) | apply | Submit; URL validation |
| PATCH | `/api/v1/showcase/submissions/:id` | owner or `requireAnyAdmin` | — | Edit (re-quarantine) |
| GET | `/api/v1/admin/showcase` | head/`requireAnyAdmin` | — | Quarantine queue |
| PATCH | `/api/v1/admin/showcase/:id/approve` | head/`requireAnyAdmin` | — | Approve |
| PATCH | `/api/v1/admin/showcase/:id/reject` | head/`requireAnyAdmin` | — | Reject |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Submission received | Quarantined confirmation | Submitter |
| Approved / Rejected | Decision notice | Submitter |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** none required (module is always public)
- **AuditLog events:** `SHOWCASE_SUBMITTED`, `SHOWCASE_APPROVED`, `SHOWCASE_REJECTED`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Submission gated to authenticated `MEMBER`/`STARTUP_DEV`, or open to anyone? PRD says "internal form" → assumed authenticated. | TBD | |
| 2 | Should `STARTUP_DEV` be a role or a flag/office on `MEMBER`? (`Office` enum already has `STARTUP_DEV...` values) | TBD | |
| 3 | URL validation via HTTP status check — which clients/methods (HEAD/GET), timeout, redirect handling? | TBD | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Broken URL rejected at submission
- [ ] Quarantined items hidden from public grid
- [ ] Approve makes it visible; reject notifies submitter
- [ ] Tag filtering works
- [ ] Docs updated (new showcase data model + workflow guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Project Incubation Showcase
- Guides: `docs/guides/v2/workflows.md` (Showcase topic)
- API: `docs/api/v2/`
- Data models: `docs/specs/data-models/` (new showcase doc)