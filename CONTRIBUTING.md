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
6. **Generate** — Run `npx prisma generate` if the Prisma schema changed
7. **Test** — Test the endpoint using **POSTMAN**, **HTTPie**, **Thunder Client** (VS Code), or your preferred HTTP client. Request/response payload formats are documented in `docs/api/v{N}/<endpoint>.md`.

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
- [ ] RBAC guards match the 4-role model (no bare `"ADMIN"` or `"STUDENT"` checks)
- [ ] `src/config/env.ts` updated if new environment variables were added
- [ ] Branch is up-to-date with the target branch
- [ ] Endpoint tested with HTTP client (POSTMAN, HTTPie, Thunder Client, etc.) against payloads documented in `docs/api/v{N}/`

---

## Need Help?

Open an issue at https://github.com/microsoft-student-community-qcu/qcu-msc-central-portal-backend/issues
