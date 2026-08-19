# Manual Test Cases

Checklist-style manual test suites, organized by version and module.

## Folder layout

```
docs/test-cases/
├── README.md                    # this index + conventions
└── v2/                          # V2 (Events & Logistics Release) suites
    └── 01-superadmin-settings-hub.md   # Module 01 (M0) — Super Admin Settings Hub
```

Each suite is named after its module doc (`docs/modules/v2/<NN>-<slug>.md`) and links back
to the module doc, its API docs (`docs/api/v2/`), and its data-model docs.

## Conventions

- **Priority:** every case is tagged P0 / P1 / P2.
  - **P0 — Security & critical:** auth, RBAC guards, locks, data-leak checks. Must pass first.
  - **P1 — Core functionality:** happy paths and primary error codes for each endpoint.
  - **P2 — Edge & regression:** filters, caps, malformed input, and pre-existing behavior.
- **Tooling:** run via POSTMAN, HTTPie, or Thunder Client (VS Code). Base URL:
  `http://localhost:5000` in development.
- **Auth:** paste the bearer token from the relevant sign-in response into the
  `Authorization: Bearer <token>` header (or the client's auth field).
- **Response contract:** all endpoints return
  `{ "success": true, "data": {...} }` / `{ "success": false, "message": "..." }` /
  validation errors as `{ "success": false, "message": "Validation error", "errors": {...} }`.
- **Status codes to verify:** success (200/201), validation (400), auth (401), forbidden (403),
  not found (404), rate limited (429).
- **Regression gate:** after any manual suite, `npm test` must stay green
  (automated suites live in `src/__tests__/`).

## Suites

| Version | Suite | Module | Status |
|---------|-------|--------|--------|
| v2 | [01-superadmin-settings-hub](v2/01-superadmin-settings-hub.md) | Module 01 (M0) — Super Admin Settings Hub | Not Run |