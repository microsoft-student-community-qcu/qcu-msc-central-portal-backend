# F-16 — Generic Better Auth Proxy Exposes Unvetted Endpoints; OAuth Bypasses the Setup-Token Gate

- **Category:** Authentication / Session Management (account-creation gate bypass)
- **Affected files:** `src/app.ts:102-296`, `src/config/auth.ts:14-27`
- **Severity:** Medium (conditional on provider configuration) · **Exploitability:** Low-Medium

---

## Summary

The `/api/auth` Express proxy forwards **every** Better Auth operation. Gating exists only for `/sign-up/email` and `/sign-in/email`; everything else — including OAuth sign-in/sign-up, session endpoints, and future library endpoints — passes through unchecked. Google/GitHub social providers are enabled whenever their env vars are set.

---

## Evidence

`src/app.ts:102-296` — gating is per-path, everything else is forwarded blindly:

```ts
app.use("/api/auth", async (req, res, next) => {
  if (req.method === "POST" && req.path === "/sign-in/email") { /* blocked */ }
  if (req.method === "POST" && req.path === "/sign-up/email") { /* gated: setup token + email match */ }
  // ... any other path (sign-in/social, sign-up/social, oauth2/callback, get-session, ...) → forwarded
  const webResponse = await auth.handler(webRequest);
});
```

`src/config/auth.ts:14-27`:

```ts
socialProviders: {
  google: env.GOOGLE_CLIENT_ID ? { clientId: ..., clientSecret: ... } : undefined,
  github: env.GITHUB_CLIENT_ID ? { clientId: ..., clientSecret: ... } : undefined,
},
```

---

## Why it is vulnerable

- If a social provider is configured, anyone can create a User account via OAuth **without** an OCR-scan or a setup token — bypassing the account-creation control designed to prevent fabricated accounts (the VUL-004 hardening).
- OAuth accounts get `role: APPLICANT` by default and a real session cookie, with no linkage requirement to an Applicant record.
- The blanket proxy also exposes whatever the library ships (and will ship in future updates) — an ever-growing attack surface beyond the app's documented endpoints.

---

## Attack scenario

OAuth enabled (e.g., Google). Attacker signs in with a throwaway Google account → instant valid User session + cookie. If any future endpoint trusts "any authenticated APPLICANT" or the library adds a privileged flow, the gate is already broken.

---

## Recommended fix

1. Whitelist exactly the Better Auth paths the app needs (e.g., `get-session` for the middleware, the two dedicated sign-in handlers already proxied at `/api/v1/auth/*`).
2. Keep social providers disabled (`undefined`) in production until they are deliberately supported with the same gating as email sign-up.
3. If OAuth is required later, force a linkage step (link OAuth account to an existing applicant-owned User only after email verification).

## Secure example

```ts
const ALLOWED_AUTH_PATHS = new Set([
  "/get-session",
  "/sign-in/email",   // already gated above
  "/sign-up/email",   // already gated above
]);

app.use("/api/auth", async (req, res, next) => {
  if (!ALLOWED_AUTH_PATHS.has(req.path)) {
    res.status(404).json({ success: false, message: "Endpoint not found" });
    return;
  }
  // ... existing gating + forwarding
});
```
