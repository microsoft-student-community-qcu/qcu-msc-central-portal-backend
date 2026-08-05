# F-08 — Committed Fixed `BETTER_AUTH_SECRET` in `.env.example`

- **Category:** Configuration & Secrets
- **Affected file:** `.env.example:11`
- **Severity:** Medium · **Exploitability:** Depends on reuse (verified: currently differs from local production env)

---

## Summary

`.env.example` ships a fixed, real-looking 64-hex `BETTER_AUTH_SECRET`. This secret signs sessions and the setup/resume JWTs (`src/config/auth.ts:51`, `src/utils/token.ts:4`). If any environment ever deploys with the example value, session tokens become forgeable.

---

## Evidence

`.env.example:11`:

```env
BETTER_AUTH_SECRET="0fdf8f33cee214997ff9fe5d3179d0a90883c7fed0958a250328cdf52a015a80"
```

Used as the signing key:

```ts
// src/config/auth.ts
secret: env.BETTER_AUTH_SECRET,

// src/utils/token.ts
const SECRET = new TextEncoder().encode(env.BETTER_AUTH_SECRET);
```

**Verification performed during audit:** the local `.env.production` value differs from the example (compared without disclosing values) — production is not currently affected. Risk is for clones, CI, and teammates who copy the example verbatim.

---

## Why it is vulnerable

The repo is shared (and the org is on GitHub). Anyone who can read the repo (including former members, forks, leaked archives) knows the secret. If any deployed environment uses it, an attacker can:
- forge valid session tokens for any user (`Session.token` is HMAC-derived by Better Auth),
- forge setup tokens (`verifySetupToken`, `token.ts:30-46`) to create accounts,
- forge draft-resume tokens.

---

## Attack scenario

A developer copies `.env.example` → `.env` (or a CI pipeline uses it) and deploys to staging. An attacker who knows the public secret forges a session token for the HR admin account and reads the applicant pipeline.

---

## Recommended fix

1. Replace the value with a placeholder:
   ```env
   BETTER_AUTH_SECRET=<generate with: openssl rand -hex 32>
   ```
2. Rotate the secret if it was ever deployed with the example value (Better Auth: rotate and invalidate sessions).
3. Add secret scanning (gitleaks / trufflehog / GitHub secret scanning) to CI and pre-commit.
