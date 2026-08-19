# Module 02 — Event Registration & QR Tickets

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Event Registration & QR Tickets |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Event Registration & QR Tickets; PRD Module 2 (Logistics) Flows 1–4 |
| **Milestone** | M1 — Events v2 |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Module 01 (guards + audit); existing V1 OCR + email engine |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| Any student (guest or member) | Browses events, registers, receives QR ticket via email |
| `MEMBER` | Bypasses OCR; priority early-access ticketing; pre-filled frictionless form |
| QCU Student (non-member guest) | Registers for `QCU_STUDENTS_ONLY` events via Zonal OCR; no account required |
| Public guest (outsider) | Registers for `PUBLIC` events; no OCR/auth required |
| `ADMIN_LOGISTICS` / `ADMIN_LOGISTICS_HEAD` | Approves/rejects registrations (see Module 03) |
| `SUPERADMIN` | Full access |

## 3. Workflows

### Event types (3)

| Type | Who can register | Notes |
|------|-----------------|-------|
| `MEMBERS_ONLY` | Authenticated `MEMBER` only | Guests/Applicants blocked with clear message |
| `QCU_STUDENTS_ONLY` | All QCU students | Members bypass OCR; non-members must pass OCR first |
| `PUBLIC` | Anyone | No OCR or auth required; QCU ID optional field |

### Flow 1 — Student Registers

1. Member: fields pre-filled from profile (name, student ID, course, year level, email), read-only, single-confirm.
2. QCU student non-member: completes `POST /api/v1/ocr/verify` first → submits `ocrSessionId` as hidden field with name, course, year level, email. `studentId` resolved server-side from the OCR session.
3. Public: fills name, email, optional QCU ID / course / year / industry / company.

### Flow 2 — Registration goes to PENDING

Checks, in order:
1. Registration open? (deadline passed, capacity full, or manually closed → clear error)
2. Event type access check (table above)
3. Duplicate? (same user account **or** same student ID already registered → blocked)
4. Office cap check (for `MEMBERS_ONLY` events with configured caps)

If all pass → registration created with status `PENDING_REVIEW`. **No QR code issued yet.** Acknowledgment email sent. FCFS priority tracked by `createdAt`.

### Flow 3 — Approval dispatches the QR ticket

On approval (see Module 03): a unique UUID `qrPayload` is generated, a **QR image** is rendered (via `qrcode` lib), and an email with the QR image, event details, date, venue is dispatched.

## 4. Acceptance Criteria & Edge Cases

- [ ] Tiered registration phases: `priorityStartDate` (members) and `generalStartDate` (non-members)
- [ ] Non-members use V1 Zonal OCR; members bypass entirely
- [ ] Unique UUID-based QR payload dispatched via email on approval
- **Duplicate prevention:** cross-reference student number against event roster; block duplicate submissions.
- **Two students submit last slot simultaneously:** both accepted as PENDING (count may exceed capacity); officer approves up to capacity, `createdAt` decides priority.
- **Office cap full but event not:** generic "slots for your office are currently full" — cap number never shown to students.

## 5. Data Model Impact

> Proposed — refine during build.

- **Enums:** `EventType` += `QCU_STUDENTS_ONLY`
- **Registration:** keep `@@unique([eventId, userId])` + `@@unique([eventId, studentId])`; default status `PENDING_REVIEW`
- **New:** `EventOfficeCap` (eventId, office, maxMembers) — used by Module 03 for MEMBERS_ONLY events
- **QR:** `qrPayload` exists (unique); add QR image generation utility (new `qrcode` dependency)

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| POST | `/api/v1/events/:eventId/register` | none (branches internally) | apply | Branch: MEMBER (auth, no OCR) vs guest (OCR session) vs public |
| PATCH | `/api/v1/events/:eventId/registrations/:registrationId/approve` | `requireAdminLogistics` | — | Approve → generate QR + email; capacity guard |
| PATCH | `/api/v1/events/:eventId/registrations/:registrationId` | `requireAuth` (ownership) | — | Student self-cancellation |
| POST | `/api/v1/ocr/verify` | none | 10/min | Existing V1 OCR gate |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Registration received (PENDING) | Acknowledgment | Registrant |
| Registration APPROVED | QR ticket image + event details | Registrant |
| Registration REJECTED | General rejection message | Registrant |
| Event cancelled | Cancellation + reason | All PENDING/APPROVED registrants |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** `events_registration_open` (global kill-switch)
- **AuditLog events:** `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `REGISTRATION_CANCELLED`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Re-send QR email endpoint for lost tickets? (PRD mentions manual re-send via admin panel) | TBD | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Duplicate registration (account + studentId) blocked
- [ ] OCR gate enforced for QCU_STUDENTS_ONLY guests; bypassed for members
- [ ] QR image renders in email and scans at check-in
- [ ] Capacity guard blocks approval beyond `maxCapacity`
- [ ] Docs updated (registration.md data model, event-management guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Event Registration & QR Tickets; Module 2 (Logistics) Flows 1–4
- Guides: `docs/guides/v2/workflows.md` (Event topic) · V1 baseline `docs/guides/v1/workflows/event-management.md`
- API: `docs/api/v1/events.md` (baseline), `docs/api/v1/ocr.md`, `docs/api/v2/`
- Data models: `docs/specs/data-models/registration.md`, `docs/specs/data-models/event.md`