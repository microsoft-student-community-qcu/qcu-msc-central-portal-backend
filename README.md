# QCU MSC Central Portal Backend
> The core API backend for the QCU Microsoft Student Community digital hub. Built with Node.js, Express, TypeScript, Prisma ORM, and Better Auth.

---

## 🚀 Tech Stack

* **Runtime:** Node.js (Latest LTS)
* **Language:** TypeScript
* **Web Framework:** Express
* **Database & ORM:** MySQL (XAMPP local dev) with Prisma ORM
* **Authentication:** Better Auth & jsonwebtoken (JWT)
* **Validation:** Zod
* **State Management:** Zustand

---

## 🛠️ Project Setup

### Prerequisites
* **Node.js** (v18.x or later)
* **XAMPP** (with Apache and MySQL modules started)

### 1. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 2. Database Creation (XAMPP MySQL)
1. Open the **XAMPP Control Panel** and start **MySQL**.
2. Go to phpMyAdmin (`http://localhost/phpmyadmin`).
3. Create a new database named `qcu_msc_central_portal` (recommended collation: `utf8mb4_general_ci`).

### 3. Environment Configuration
Create a `.env` file in the root of the project:
```bash
cp .env.example .env
```
Open `.env` and fill in the values. See [Environment Documentation](#-environment-documentation) below for details.

### 4. Database Migrations
Run the initial Prisma migration to generate database tables in your XAMPP MySQL instance:
```bash
npx prisma migrate dev --name init
```

---

## 💻 Running the Server

### Development Mode
Start the development server with live reload enabled:
```bash
npm run dev
```
The server will boot on the port specified in your `.env` (default is `5000`).

### Production Mode
To build and run the compiled JavaScript:
```bash
npm run build
npm start
```

---

## 📋 Environment Documentation

The project uses Zod in [env.ts](file:///c:/Users/busti/Desktop/Node/x/qcu-msc-central-portal-backend/src/config/env.ts) to parse, type-check, and validate configuration at startup. If any required variables are missing or incorrectly formatted, the server will output a detailed validation schema error and halt.

### Environment Variables (.env.example)

| Key | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | The port the Express application server will listen on. | `5000` |
| `NODE_ENV` | Environment state (`development`, `production`, `test`). | `development` |
| `DATABASE_URL` | Prisma MySQL connection string. | `mysql://:`DB_PASSWORD`@`DB_HOST`:`DB_PORT`/`DB_NAME` |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens (min 8 chars). | `super-secret-jwt-key-change-in-production` |
| `JWT_EXPIRES_IN` | Token lifespan. | `7d` |
| `BETTER_AUTH_SECRET` | Secret key for Better Auth operations (min 8 chars). | `better-auth-secret-change-in-production` |
| `BETTER_AUTH_URL` | Base URL routing for your auth service. | `http://localhost:5000` |

---

## 📂 Directory Structure

```
qcu-msc-central-portal-backend/
├── prisma/
│   ├── schema.prisma          # Prisma database schema definition
│   └── migrations/            # Generated SQL migration history
├── src/
│   ├── config/                # App configuration (auth.ts, env.ts)
│   ├── controllers/           # Request controllers / handlers
│   ├── middleware/            # JWT authentication & route protectors
│   ├── routes/                # Express router endpoints
│   ├── schemas/               # Zod validation schemas
│   ├── store/                 # Zustand store setups
│   ├── app.ts                 # Express application instantiation
│   └── index.ts               # Server entry point and database connection logic
├── .env                       # Local environment secrets (ignored by Git)
├── .env.example               # Environment variables template
├── tsconfig.json              # TypeScript compiler settings
└── package.json               # Dependencies and scripts
```
