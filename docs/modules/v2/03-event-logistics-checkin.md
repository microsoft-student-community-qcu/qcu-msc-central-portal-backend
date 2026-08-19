# Module 03 — Event Logistics & Check-In

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Event Logistics & Check-In |
| **PRD Reference** | `docs/specs/PRD-V2.md` — Module Specs § Event Logistics & Check-In; PRD Module 2 (Logistics) Flows 1–8 |
| **Milestone** | M1 — Events v2 |
| **Status** | Not Started |
| **Assignee** | |
| **Dependencies** | Module 01 (guards + audit), Module 02 (registration/QR flows) |

## 2. Actors & Permissions

| Role | What they can do |
|------|------------------|
| `ADMIN_LOGISTICS` | Creates events, edits event details, manages registrations, uses QR scanner, manual registration toggle |
| `ADMIN_LOGISTICS_HEAD` | Everything a Logistics officer can do, plus: cancels/deletes events, views analytics |
| `SUPERADMIN` | Full access |

> Heads + `SUPERADMIN` inherit the (removed) `ADMIN_CORE` permissions.

## 3. Workflows

### Flow 1 — Logistics Officer Creates an Event

Fields: event name, description, date & time, venue, event type (`MEMBERS_ONLY` / `QCU_STUDENTS_ONLY` / `PUBLIC`), max capacity, registration deadline, banner image (Azure Blob), requires-QR-ticket flag, per-office caps (MEMBERS_ONLY only). Event goes live immediately.

**Edit rules:** any detail editable anytime, **except** reducing capacity below the current confirmed registration count is blocked.

### Flow 2 — Officer Reviews & Approves Registrations

Roster of PENDING registrations sorted by submission time (FCFS). Approve/reject per row. Approving beyond `maxCapacity` is blocked. On approve → QR generated + emailed (Module 02). On reject → general rejection email (no reason exposed).

### Flow 3 — Officer Configures Office Caps (MEMBERS_ONLY only)

Optional per-office maximum member counts (e.g., Secretariat 20, Finance 15, Logistics 15, Relations 10, Creatives 10, M&D 10, Startup Devs 10). Tied to the member's **MSC office** in their profile, not academic course. Hidden from students. Overall capacity remains the hard ceiling. No cap set = no per-office limit.

### Flow 4 — Officer Manually Toggles Registration

On/off switch per event from the admin panel — closes registration before capacity/deadline (venue downgrade, headcount freeze, review pause). Reversible.

### Flow 5 — QR Scanner at the Door

Mobile-optimized route `/admin/events/scan`. Scans QR → validates: payload belongs to this event, status APPROVED, `hasAttended = false` → flips `hasAttended = true`, green screen with student name (<2s). Failures render red screen: "Already checked in" / "Invalid QR code" / "Wrong event" / "Not approved".

### Flow 6 — Manual Override

Search roster by name or student ID to check in students with lost/undisplayable QR codes.

### Flow 7 — Logistics Head Cancels an Event

Soft delete (data preserved); event disappears from public feed immediately; every APPROVED/PENDING registrant emailed with the cancellation reason (entered before confirm).

## 4. Acceptance Criteria & Edge Cases

- [ ] Event creation form with all fields
- [ ] QR scanner route validates + flips `hasAttended`
- [ ] Manual check-in search
- [ ] Capacity reduction below confirmed count blocked
- [ ] Registration toggle works both directions
- [ ] Cancel event notifies all affected registrants
- **Scanner rejection:** foreign/duplicate/already-scanned QR → prominent red error "Invalid Ticket or Already Scanned."
- **Officer approves over capacity:** system prevents; approve disabled at capacity.

## 5. Data Model Impact

> Proposed — refine during build.

- **Event model additions:** `venue`, `registrationDeadline`, `bannerImage`, `requiresQrTicket` (bool), `status` (`EventStatus` enum: `ACTIVE` / `CANCELLED`), `registrationOpen` (manual toggle), `type` extended to 3 values
- **New model:** `EventOfficeCap` — `eventId` FK, `office`, `maxMembers`
- **Registration:** `hasAttended` (exists), `qrPayload` (exists)
- **V1 fixes:** event edit endpoint currently dead code (`updateEventSchema` unused); no event cancel; no student self-cancellation; QR sent as plain text (needs `qrcode` image)

## 6. API Surface

> Proposed — refine during build.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| GET | `/api/v1/events` | none | — | Public feed (filtered by status ACTIVE) |
| POST | `/api/v1/events` | `requireAdminLogistics` | — | Exists (V1) |
| PATCH | `/api/v1/events/:eventId` | `requireAdminLogistics` | — | Edit; capacity guard |
| DELETE | `/api/v1/events/:eventId` | `requireAdminLogisticsHead` | — | Soft delete + notify all |
| PATCH | `/api/v1/events/:eventId/registration-toggle` | `requireAdminLogistics` | — | Manual open/close |
| GET | `/api/v1/events/:eventId/registrations` | `requireAdminLogistics` | — | Exists (V1) |
| PATCH | `/api/v1/events/:eventId/registrations/:registrationId/approve` | `requireAdminLogistics` | — | Exists (V1) — add capacity guard |
| PATCH | `/api/v1/events/:eventId/registrations/checkin` | `requireAdminLogistics` | — | Exists (V1) — QR scan |
| PATCH | `/api/v1/events/:eventId/registrations/:registrationId/checkin` | `requireAdminLogistics` | — | Exists (V1) — manual override |
| POST | `/api/v1/events/:eventId/registrations/:registrationId/resend-ticket` | `requireAdminLogistics` | — | Re-send QR email |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| Event cancelled | Cancellation + reason | All PENDING/APPROVED registrants |
| Ticket re-sent | QR ticket image | Registrant |
| Registration approved / rejected | See Module 02 | Registrant |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:** `events_registration_open` (global), per-event `registrationOpen` toggle
- **AuditLog events:** `EVENT_CREATED`, `EVENT_UPDATED`, `EVENT_CANCELLED`, `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `CHECK_IN_QR`, `CHECK_IN_MANUAL`

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Where is `ADMIN_CORE`'s "views analytics" permission scoped — heads only or all officers? | Heads + SUPERADMIN | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Capacity-below-confirmed-count edit blocked
- [ ] Approve beyond capacity blocked
- [ ] QR scanner rejects foreign/duplicate/already-scanned
- [ ] Cancel notifies all PENDING/APPROVED registrants and hides from feed
- [ ] Office caps enforced only for MEMBERS_ONLY events
- [ ] Docs updated (event.md, registration.md, event-management guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md` — Module Specs § Event Logistics & Check-In; Module 2 (Logistics) Flows 1–8
- Guides: `docs/guides/v2/workflows.md` (Event + QR topics) · V1 baseline `docs/guides/v1/workflows/event-management.md`
- API: `docs/api/v1/events.md` (baseline), `docs/api/v2/`
- Data models: `docs/specs/data-models/event.md`, `docs/specs/data-models/registration.md`