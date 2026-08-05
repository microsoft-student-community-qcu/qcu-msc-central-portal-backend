# F-09 — Seed Script Installs Known-Credential Admin Accounts Outside Production

- **Category:** Configuration & Secrets (default credentials)
- **Affected file:** `prisma/seed.ts:7-56`
- **Severity:** Medium · **Exploitability:** Trivial if the seed is ever run against a shared DB

---

## Summary

The seed script falls back to **public, hardcoded admin passwords** whenever `NODE_ENV` is not `production`/`release` and `BRANCH_NAME !== "main"`. Note that `staging` is a valid `NODE_ENV` (`src/config/env.ts:11`) and is **not** covered by the strict branch.

---

## Evidence

`prisma/seed.ts:7-56`:

```ts
const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "release" || process.env.BRANCH_NAME === "main";

// Fallback to local defaults if not in production
const finalHREmail = hrAdminEmail || "hr_admin@gmail.com";
const finalHRPassword = hrAdminPassword || "AdminPassHR123!";
const finalLogisticsPassword = logisticsAdminPassword || "AdminPassLogistics123!";
...
await auth.api.signUpEmail({ body: { email: finalHREmail, password: finalHRPassword, ... } });
await prisma.user.update({ where: { email: finalHREmail }, data: { role: "ADMIN_HR" } });
```

---

## Why it is vulnerable

- `staging` environments share real-ish data and are often internet-reachable — running the seed there installs `hr_admin@gmail.com / AdminPassHR123!` and `logistics_admin@gmail.com / AdminPassLogistics123!` as live admin accounts.
- The credentials are in the repository (publicly known).

---

## Attack scenario

Someone runs `prisma:seed` against a staging DB with default env → any person who has read the repo tries `hr_admin@gmail.com / AdminPassHR123!` on the staging login → full admin access to applicant PII.

---

## Recommended fix

Refuse fallback credentials unless the database is explicitly local:

```ts
const isLocal = /localhost|127\.0\.0\.1|::1/.test(process.env.DATABASE_URL ?? "");
if (!isProd || !isLocal) {
  const required = [SEED_HR_ADMIN_EMAIL, SEED_HR_ADMIN_PASSWORD, ...];
  if (required.some((v) => !v)) {
    throw new Error("Seeding admin accounts requires all SEED_* variables outside local development.");
  }
}
// and drop the hardcoded fallbacks entirely; throw when missing
```
