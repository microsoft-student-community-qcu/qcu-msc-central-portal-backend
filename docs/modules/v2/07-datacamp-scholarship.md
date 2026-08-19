# Module 07 — DataCamp Scholarship Gateway

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | DataCamp Scholarship Gateway |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § DataCamp Scholarship Gateway |
| **Milestone** | M5 — DataCamp |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Module 01 (guards + audit), Module 02 (OCR session + email patterns) |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| QCU student (non-member) | Applies via Zonal OCR ID scan — no account required |
| `MEMBER` | Applies bypassing OCR entirely |
| Heads + `SUPERADMIN` | Evaluates applications, distributes seats (inherits removed `ADMIN_CORE` permission) |

## 3. Workflows

### Flow 1 — Student Applies

Non-members first complete `POST /api/v1/ocr/verify` (Zonal OCR on QCU Student ID), then submit the application with the `ocrSessionId` (server resolves `studentId`). Members bypass OCR. Form captures: student credentials, brief motivation statement, current proficiency in data science & analytics tools.

**Gate checks:** seats not exhausted, no duplicate application for the same student (by scanned student number or user account).

### Flow 2 — Core Team Evaluates

Protected data table for heads + SUPERADMIN: review submissions side-by-side, toggle status APPROVED/REJECTED.

### Flow 3 — Automated Provisioning

Mutating status to APPROVED triggers the email engine to dispatch the official DataCamp invitation link.

## 4. Acceptance Criteria & Edge Cases

- [ ] Non-members use V1 Zonal OCR; members bypass
- [ ] Application form: credentials + motivation + data-science proficiency
- [ ] Evaluation dashboard with side-by-side review + status toggle
- [ ] Approve triggers automated invitation email
- **Allocation cap:** frontend locks the form and renders "Seats Exhausted" once the maximum allocation is reached (backend must enforce too).
- **Duplicate applications:** cross-reference scanned student number against the database to prevent multiple submissions.

## 5. Data Model Impact

> Proposed — refine during build.

- **Model:** `ScholarshipApplication` — studentId (from OCR or member profile), name, email, course, yearLevel, motivation (Text), proficiency (Text), `status` (`PENDING_REVIEW`/`APPROVED`/`REJECTED`), `seatAllocated` bool, `reviewedById`?, timestamps
- **Uniques:** `studentId` (one application per student) or application window + studentId
- **Setting:** `datacamp_max_seats` in `SystemSetting` for the allocation cap

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| POST | `/api/v1/scholarships/datacamp` | none (branches auth) | apply | Apply; OCR session for non-members; dup + cap checks |
| GET | `/api/v1/scholarships/datacamp/status` | none | apply | Seats available / exhausted |
| GET | `/api/v1/admin/scholarships/datacamp` | `requireHead` | — | Evaluation table |
| PATCH | `/api/v1/admin/scholarships/datacamp/:id` | `requireHead` | — | Approve → invite email / reject |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Application received | Acknowledgment | Applicant |
| Approved | Official DataCamp invitation link | Applicant |
| Rejected | Rejection notice | Applicant |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** `datacamp_max_seats`
- **AuditLog events:** `SCHOLARSHIP_APPLIED`, `SCHOLARSHIP_APPROVED`, `SCHOLARSHIP_REJECTED`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Is the max-seats cap global (one season) or per application window with a reset mechanism? | TBD | |
| 2 | Invitation link provisioning — generated per seat (unique) or a shared link? | TBD | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] OCR gate enforced for non-members; members bypass
- [ ] Duplicate application blocked (studentId)
- [ ] Seats exhausted → submission blocked (backend, not just frontend)
- [ ] Approve dispatches invitation email
- [ ] Docs updated (new scholarship data model + workflow guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § DataCamp Scholarship Gateway
- Guides: `docs/guides/v2/workflows.md` (DataCamp topic) · OCR baseline `docs/guides/v1/workflows/auth-workflow.md` (OCR reuse)
- API: `docs/api/v1/ocr.md` (baseline), `docs/api/v2/`
- Data models: `docs/specs/data-models/` (new scholarship doc)