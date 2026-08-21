# Contributing to QCU MSC Central Portal Backend

This repository is internal to the `microsoft-student-community-qcu` GitHub organization (Quezon City University). The following guidelines apply to all org members contributing to the project. For coding and architecture standards, see [AGENTS.md](AGENTS.md).

---

## Getting Started

1. **Prerequisites:** Node.js v18+, XAMPP (with MySQL started)
2. **Clone & install:**
   ```bash
   git clone https://github.com/microsoft-student-community-qcu/qcu-msc-central-portal-backend.git
   cd qcu-msc-central-portal-backend
   npm install
   ```
3. **Database:** Create a MySQL database named `qcu_msc_central_portal` (collation: `utf8mb4_general_ci`)
4. **Environment:** Copy `.env.example` → `.env` and fill in values
5. **Migrate:** `npx prisma migrate dev --name init`
6. **Run:** `npm run dev`

---

## Branch Strategy & Conventions

We follow a structured branching convention to ensure quality and compliance. The flow from development to production is structured as follows:

```mermaid
graph TD
    feature["feature/* (Contributor)"] -->|PR Approval: FE (BootlegYouki) or BE (mark-ianz)| develop["develop (Development Environment)"]
    develop -->|PR Approval: Software Development Head (CarlOwlTech)| release["release (Staging Environment)"]
    release -->|PR Approval: cloud-team & qa-team & cybersecurity-team| main["main & hotfixes (Production Environment)"]
```

### Branch Roles & Approvals

| Branch | Source Branch | Target Branch | Cloud Environment / Services Used | Approving Code Owners |
| :--- | :--- | :--- | :--- | :--- |
| `main` / `hotfixes` | `release` / Hotfix branch | Production | **Azure Web App (`msc-qcu`)** / MySQL Production Database | `cloud-team` & `qa-team` & `cybersecurity-team` |
| `release` | `develop` | `main` | Staging / QA Environment | Software Development Head (`CarlOwlTech`) |
| `develop` | `feature/*` | `release` | **Azure Web App (`msc-qcu-develop`)** / MySQL Development Database | FE (`BootlegYouki`) or BE (`mark-ianz`) |
| `feature/*` | *Self-contained* | `develop` | Local Development (XAMPP / SQLite / local MySQL) | Contributor (Anyone) — Includes fixes, docs, refactors, chores |

> **V2 Module Development:** V2 work is tracked in `docs/modules/v2/` (one file per module, sourced from `docs/specs/PRD-V2.md`). All V2 modules branch off **`develop`** and follow the same `feature/* → develop` PR flow — there is no separate V2 trunk. See AGENTS.md → **V2 Module Development** for the per-module workflow, and `docs/modules/README.md` → **Development Waves** for the parallel build order (which modules can be assigned in parallel and which must ship first/last).

---

## Commit Conventions

Use [conventional commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Examples:

- `feat(db): add student_id field to User model`
- `fix(auth): handle expired JWT gracefully`
- `docs(api): add rate-limit docs to applicants endpoint`
- `refactor(routes): split auth middleware into separate file`

Keep commits focused on a single logical change.

---

## Development Workflow

When adding a new endpoint:

1. **Schema** — Define or update a Zod validation schema in `src/schemas/`
2. **Controller** — Create a controller function in `src/controllers/`
3. **Route** — Create a route file in `src/routes/` with rate limiting on public POST routes
4. **App** — Register the route in `src/app.ts` at `/api/v{N}/...`
5. **Docs** — Document the endpoint in `docs/api/v{N}/` (see AGENTS.md for documentation obligations)
6. **Changelog** — Update `CHANGELOG.md` under `[Unreleased]` in the matching category (`Added`, `Changed`, `Fixed`, `Security`, `Removed`). A task is not done until its changelog entry exists. See AGENTS.md → Changelog Obligations.
7. **Generate** — Run `npx prisma generate` if the Prisma schema changed
8. **Test** — Test the endpoint using **POSTMAN**, **HTTPie**, **Thunder Client** (VS Code), or your preferred HTTP client. Request/response payload formats are documented in `docs/api/v{N}/<endpoint>.md`.

---

## Pull Request Process

1. Ensure your branch is up-to-date with the target branch.
2. Self-review your diff before opening the PR.
3. Fill in the PR description explaining **what** and **why**.
4. Verify the checklist below before requesting review.
5. Address all review feedback; re-request review after changes.

### Review Checklist

- [ ] Code follows [AGENTS.md](AGENTS.md) style and architecture rules
- [ ] Zod schemas created or updated for new/modified endpoints
- [ ] API documentation updated in `docs/api/`
- [ ] Data model docs updated if the Prisma schema changed
- [ ] **`CHANGELOG.md` updated under `[Unreleased]`** (see AGENTS.md → Changelog Obligations)
- [ ] RBAC guards match the role model for the version being developed (V1: 4 roles; V2: extended set per `docs/modules/v2/01-superadmin-settings-hub.md`) — no bare `"ADMIN"` or `"STUDENT"` checks
- [ ] `src/config/env.ts` updated if new environment variables were added
- [ ] Branch is up-to-date with the target branch
- [ ] Endpoint tested with HTTP client (POSTMAN, HTTPie, Thunder Client, etc.) against payloads documented in `docs/api/v{N}/`

---

## Release Process

Releases happen when you're ready to ship accumulated changes. The flow is: **develop → release → main** (per the branch strategy above).

### When to release

There's no fixed schedule — release when it makes sense:

- **Feature milestone complete** (e.g. M0 merged → `v1.1.0`)
- **Ready to deploy** to staging or production
- **Natural stopping point** (end of sprint, before next module)

### How to cut a release

After your feature PRs have merged to `develop`:

1. **Update the changelog** — make sure all entries under `[Unreleased]` are accurate.

2. **Rename `[Unreleased]`** to the version number with today's date:
   ```markdown
   ## [1.2.0] - 2026-08-21
   ```

3. **Add a fresh empty `[Unreleased]`** above it:
   ```markdown
   ## [Unreleased]

   ## [1.2.0] - 2026-08-21
   ```

4. **Commit and tag:**
   ```bash
   git add CHANGELOG.md
   git commit -m "chore: release v1.2.0"
   git tag v1.2.0
   ```

5. **Push:**
   ```bash
   git push origin develop
   git push origin v1.2.0
   ```

6. **Create a GitHub Release** from the tag (optional but recommended).

### Versioning (semver)

We follow [Semantic Versioning](https://semver.org): **`MAJOR.MINOR.PATCH`**

```
MAJOR . MINOR . PATCH
  │       │      └── 1.0.1 → 1.0.2  (bugfixes, internal cleanup, docs)
  │       └────────  1.0.x → 1.1.0  (new features, backwards compatible)
  └───────────────── 1.x.x → 2.0.0  (breaking changes — existing clients will fail)
```

| Type | When | Example |
|---|---|---|
| **PATCH** | Bugfix, internal cleanup, docs, tooling | Fix validation bug, add DB reset script, seed improvements |
| **MINOR** | New feature, backwards compatible | Add password-reset endpoints, new admin API |
| **MAJOR** | Breaking change — existing clients fail | Change all API paths from `/api/v1/...` to `/v1/...` |

**Rule of thumb:** if a user/consumer of the API has to change their code, it's MAJOR.
If you're adding something they can ignore, it's MINOR. If you're fixing something
they didn't even know was broken, it's PATCH.

**V2 module releases:** each module gets a MINOR bump (no breaking changes to V1):

| Version | When |
|---|---|
| `1.0.0` | Initial release |
| `1.0.1` | Post-release fixes (password reset, applicant filters, prisma hotfix) |
| `1.0.2` | Internal cleanup (app refactor, scaffolding, seed improvements) |
| `1.1.0` | M0 (Super Admin Settings Hub) |
| `1.2.0` | M1 (Events v2) |
| `1.3.0` | M2 (Merch) |
| ... | Each subsequent module |

---

## Need Help?

Open an issue at https://github.com/microsoft-student-community-qcu/qcu-msc-central-portal-backend/issues
