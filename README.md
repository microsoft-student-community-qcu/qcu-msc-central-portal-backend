# QCU MSC Central Portal Backend

The core API backend for the QCU Microsoft Student Community digital hub. Built with Node.js, Express, TypeScript, Prisma ORM, Better Auth, and URL-path API versioning (`/api/v1/...`).

---

## Tech Stack

- **Runtime:** Node.js (Latest LTS)
- **Language:** TypeScript
- **Web Framework:** Express
- **Database & ORM:** MySQL (XAMPP local dev) with Prisma ORM
- **Authentication:** Better Auth (email/password + Google/GitHub OAuth)
- **Validation:** Zod

---

## Quick Start

### Prerequisites

- Node.js v18+
- XAMPP (with MySQL started)

### Setup

```bash
git clone https://github.com/microsoft-student-community-qcu/qcu-msc-central-portal-backend.git
cd qcu-msc-central-portal-backend
npm install
```

### Database

1. Start MySQL via XAMPP Control Panel.
2. Create a database named `qcu_msc_central_portal` (collation: `utf8mb4_general_ci`).
3. Copy `.env.example` → `.env` and fill in values (see [Environment](#environment) below).
4. Run migrations: `npx prisma migrate dev --name init`

### Run

```bash
npm run dev        # Development (live reload)
npm run build      # Production build
npm start          # Production server
```

The server starts on the port specified in `.env` (default `5000`).

---

## Environment

All environment variables are validated via Zod in `src/config/env.ts` at startup. Missing or malformed values halt the server with a validation error.

| Key | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Express server port | `5000` |
| `NODE_ENV` | Environment state | `development` |
| `DATABASE_URL` | Prisma MySQL connection string | `mysql://root:password@localhost:3306/qcu_msc_central_portal` |
| `BETTER_AUTH_SECRET` | Better Auth secret (min 8 chars) | (auto-generated) |
| `BETTER_AUTH_URL` | Auth service base URL | `http://localhost:5000` |
| `IMAGE_STORAGE_PATH` | OCR ID card image storage directory | `./uploads/images` |
| `DOCUMENT_STORAGE_PATH` | Applicant document (CoR, CV) storage directory | `./uploads/documents` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | *(optional)* |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | *(optional)* |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | *(optional)* |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | *(optional)* |

---

## Project Structure

```
qcu-msc-central-portal-backend/
├── docs/           # API docs, guides, specs
├── prisma/         # Schema + migrations
├── src/            # Application source
├── uploads/        # Uploaded files (images, documents)
├── .env.example
├── AGENTS.md
├── CONTRIBUTING.md
└── package.json
```

---

## Documentation Map

| Resource | Description |
| :--- | :--- |
| [docs/](docs/) | API documentation, data models, workflow guides, flow diagrams, PRD |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow, branch strategy, PR process |
| [AGENTS.md](AGENTS.md) | Engineering standards: code style, architecture, API rules, database, testing |

---

## Testing

Test endpoints using **POSTMAN**, **HTTPie**, **Thunder Client** (VS Code), or your preferred HTTP client. Request/response payload formats are documented in `docs/api/v{N}/<endpoint>.md`. See [AGENTS.md](AGENTS.md) for testing expectations.
