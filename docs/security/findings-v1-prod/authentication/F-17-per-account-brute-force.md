# F-17 — Per-Account Brute-Force Protection Is Limited

- **Category:** Authentication / Session Management (credential attacks)
- **Affected files:** `src/app.ts:68-74, 318-332`, `src/config/auth.ts`
- **Severity:** Low-Medium · **Exploitability:** Medium (IP-dependent, see F-02)

---

## Summary

Sign-in protection is limited to per-IP limiter instances (10/min). There is no per-account attempt lockout or exponential backoff in application code. Whether Better Auth's built-in attempt rate limiting applies **cannot be fully verified from the codebase** (library internals; depends on configuration defaults and the shared-IP behavior of F-02).

---

## Evidence

`src/app.ts:68-74`:

```ts
const signInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many sign-in attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/sign-in/email", signInLimiter);
```

No per-account throttling anywhere in `src/`, `src/config/auth.ts`:

```ts
export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  // no explicit rateLimit / attempts configuration
});
```

---

## Why it is vulnerable

- 10 attempts/min per IP is weak for credential stuffing, and because of F-02 the bucket is shared (global lockout) rather than binding the attacker.
- Without per-account throttling, an attacker rotating IPs can try unlimited passwords against a single admin account.

---

## Attack scenario

Attacker runs a credential-stuffing list against `hr_admin@...` from a botnet; each IP stays under 10/min while the aggregate attack proceeds uninterrupted.

---

## Recommended fix

1. Enable Better Auth's built-in sign-in attempt limiting (documented `rateLimit`/attempts options) with per-account keying (email + IP).
2. Add exponential backoff on failed attempts per account.
3. After the F-02 fix, per-IP limiters actually bind per client.

## Secure example

```ts
// src/config/auth.ts
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    // Better Auth attempt limiting (verify exact option names for your version)
    rateLimit: {
      enabled: true,
      window: 60 * 1000,
      max: 5,
      onRateLimit: async ({ request, email }) => {
        console.warn(`[AUTH] rate-limited sign-in attempt for ${email}`);
      },
    },
  },
  ...
});
```
