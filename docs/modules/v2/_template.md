# Template — Module Name

> Copy this file when scaffolding a new module. Replace every placeholder; keep the section order.
> Header fields are filled in the module index (`docs/modules/README.md`).

## 1. Header

| Field | Value |
|-------|-------|
| **Module** | Name |
| **PRD Reference** | `docs/specs/PRD-V2.md` — section / module reference |
| **Milestone** | M0–M5 |
| **Status** | Not Started / In Progress / Done |
| **Assignee** | |
| **Dependencies** | Modules that must ship first |

## 2. Actors & Permissions

| Role | What they can do in this module |
|------|--------------------------------|
| | |

> `SUPERADMIN` inherits every restricted action. Guests have no User record (behavioral role only).

## 3. Workflows

### Flow N — Title

Step-by-step behavior, condensed from the PRD with section pointers.

## 4. Acceptance Criteria & Edge Cases

- [ ] Criterion 1
- Edge case behavior notes

## 5. Data Model Impact

> Proposed — refine during build. Update `docs/specs/data-models/` when finalized.

- **Models:** `ModelName` — fields
- **Enums:** `EnumName` — values
- **Indexes / uniques:**

## 6. API Surface

> Proposed — refine during build. Document each endpoint in `docs/api/v2/` when implemented.

| Method | Path | Guard | Rate Limit | Notes |
|--------|------|-------|------------|-------|
| | | | | |

## 7. Email Triggers

| Trigger | Template | Recipient |
|---------|----------|-----------|
| | | |

## 8. Settings / Toggles & Audit Events

- **SystemSetting keys:**
- **AuditLog events:**

## 9. Open Questions

| # | Question | Decision | Date |
|---|----------|----------|------|
| | | | |

## 10. Testing Checklist

- [ ] 200/201 success, 400 validation, 401 auth, 403 forbidden, 404 not found
- [ ] Rate limits verified
- [ ] Audit entries written for admin mutations
- [ ] Docs updated (API doc, data model, workflow guide)

## 11. Related Docs

- PRD: `docs/specs/PRD-V2.md`
- Guides: `docs/guides/v2/workflows.md`
- API: `docs/api/v2/`
- Data models: `docs/specs/data-models/`
