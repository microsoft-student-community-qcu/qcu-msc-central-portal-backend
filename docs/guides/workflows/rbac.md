# Workflow — RBAC & Authorization

## Role Hierarchy

```
ADMIN_HR / ADMIN_LOGISTICS (highest privilege)
  ├─ ADMIN_HR: HR & Recruitment Pipeline
  │   ├─ View/export applicant lists (GET /api/v1/applicants)
  │   ├─ View applicant details (GET /api/v1/applicants/:id)
  │   ├─ Update applicant fields (PATCH /api/v1/applicants/:id)
  │   ├─ Mutate application statuses (PATCH /api/v1/applicants/:id/status)
  │   ├─ Approve ID verification (unlock quarantined)
  │   ├─ Accept → update User role to MEMBER
  │   └─ Trigger branded emails to candidates
  │
  └─ ADMIN_LOGISTICS: Event Logistics & Check-In
      ├─ Create/Edit/Delete events
      ├─ View attendee rosters
      ├─ Use QR scanner (/admin/events/scan)
      ├─ Manual check-in override
      └─ Approve manual registrations

MEMBER (authenticated member)
  ├─ All APPLICANT permissions
  ├─ Priority window registration for Members-Only events
  ├─ Bypass Zonal OCR (auto-pull credentials)
  └─ Access member dashboard (static "Coming Soon")

APPLICANT (post-account-creation)
  ├─ View public events
  ├─ Register for Public events
  ├─ Track own application status (/portal/tracking)
  └─ View own profile

——— (no User record) ———

GUEST (unauthenticated)
  ├─ View landing page
  ├─ Register for Public events via Zonal OCR (account-free)
  ├─ Submit sponsorship inquiries ("Collaborate With Us")
  └─ Cancel own registration via unique link
```

## Auth Middleware Guards

Defined in `src/routes/authMiddleware.ts`:

| Guard | Roles |
|-------|-------|
| `requireAuth` | APPLICANT, MEMBER, ADMIN_HR, ADMIN_LOGISTICS |
| `requireAdminHR` | ADMIN_HR only |
| `requireAdminLogistics` | ADMIN_LOGISTICS only |
| `requireAnyAdmin` | ADMIN_HR or ADMIN_LOGISTICS |
| `requireMemberOrAdmin` | MEMBER, ADMIN_HR, or ADMIN_LOGISTICS |

---

## Endpoint Protection

| Endpoint | Method | Auth | Guard | Allowed Roles |
|----------|--------|------|-------|---------------|
| `/api/v1/users/me` | GET | Required | `requireAuth` | APPLICANT, MEMBER, ADMIN_HR, ADMIN_LOGISTICS |
| `/api/v1/applicants` | POST | Public | None | Guest (unauthenticated) |
| `/api/v1/applicants` | GET | Required | `requireAdminHR` | ADMIN_HR |
| `/api/v1/applicants/:id` | GET | Required | `requireAdminHR` | ADMIN_HR |
| `/api/v1/applicants/:id` | PATCH | Required | `requireAdminHR` | ADMIN_HR |
| `/api/v1/applicants/:id/status` | PATCH | Required | `requireAdminHR` | ADMIN_HR |
| `/api/v1/ocr/verify` | POST | Public | None | Guest (unauthenticated) |
| `/api/v1/events/:eventId/register` | POST | Mixed | None / `requireAuth` | Guest or any authenticated |
| `/api/v1/events` | POST | Required | `requireAdminLogistics` | ADMIN_LOGISTICS |
| `/api/v1/events/:eventId/attendance` | POST | Required | `requireAdminLogistics` | ADMIN_LOGISTICS |

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | No auth token provided (required) |
| 403 | Token provided but role not permitted |
| 404 | Resource not found (or inaccessible) |

---

## Role Guards Convention

- Never reference bare `"ADMIN"` or `"STUDENT"` in role checks — those roles do not exist
- APPLICANT-only routes use `requireAuth` alone (no additional guard)
- Guest endpoints (no auth required) must not use any `require*` guard
