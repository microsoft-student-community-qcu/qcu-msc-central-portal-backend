# Contributing to QCU MSC Central Portal Backend

This repository is internal to the `microsoft-student-community-qcu` GitHub organization (Quezon City University). The following guidelines apply to all org members contributing to the project. For coding and architecture standards, see [AGENTS.md] (AGENTS.md).

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

## Branch Strategy

Branch off `main` and use these prefixes:

| Prefix | Purpose |
|--------|---------|
| `feature/*` | New functionality |
| `fix/*` | Bug fixes |
| `docs/*` | Documentation only |
| `refactor/*` | Code restructuring |
| `chore/*` | Tooling, deps, config |

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
- [ ] `src/config/env.ts` updated if new environment variables were added
- [ ] Branch is up-to-date with the target branch
- [ ] Endpoint tested with HTTP client (POSTMAN, HTTPie, Thunder Client, etc.) against payloads documented in `docs/api/v{N}/`

---

## Need Help?

Open an issue at https://github.com/microsoft-student-community-qcu/qcu-msc-central-portal-backend/issues
