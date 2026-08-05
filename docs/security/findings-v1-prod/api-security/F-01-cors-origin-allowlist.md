# F-01 — CORS Allowlist Permits Attacker-Controlled Origins, with `credentials: true`

- **Category:** API Security (security misconfiguration)
- **Affected file:** `src/app.ts:35-56`
- **Severity:** High · **Exploitability:** Easy (origin header is fully attacker-controlled)

---

## Summary

The CORS configuration combines `credentials: true` with a regex-based allowlist that includes **any subdomain of `azurestaticapps.net`** — a free, publicly-hostable platform — plus unconditional localhost origins in every environment.

---

## Evidence

```ts
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      env.FRONTEND_URL,
      env.ADMIN_FRONTEND_URL,
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:8081",
    ];
    if (
      allowed.includes(origin) ||
      /\.z23\.web\.core\.windows\.net$/.test(origin) ||
      /\.azurestaticapps\.net$/.test(origin) ||        // <-- anyone can host here
      /^https:\/\/([a-z0-9-]+\.)?msc-qcu\.tech$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
```

---

## Why it is vulnerable

- `*.azurestaticapps.net` matches **any** subdomain — Azure Static Web Apps is a free public hosting service, so an attacker can publish `evil.azurestaticapps.net` in minutes.
- `credentials: true` means the victim's cookies/Bearer token are included on cross-origin requests.
- `localhost:5173/5174/8081` are allowed in **production** too (malicious local processes, compromised extensions).
- The API is JSON — the attacker's page can read responses, not just send requests.

---

## Attack scenario

1. Attacker publishes a page at `evil.azurestaticapps.net`.
2. Victim (e.g., an `ADMIN_HR` user) visits the page (social-engineering link).
3. Page JS runs `fetch("https://api.../api/v1/applicants", { credentials: "include" })`.
4. Attacker reads the full applicant roster (PII: addresses, phone numbers, DOB, documents) or performs state-changing actions (`PATCH /status`, `cancel`) with the victim's session.

---

## Severity & Exploitability

| | |
|---|---|
| **Severity** | High (confidentiality of admin data, integrity of admin actions) |
| **Exploitability** | Easy — origin header is arbitrary; requires victim interaction |

---

## Recommended fix

- Use an **exact-match** allowlist built only from env vars.
- Drop the regex arms entirely.
- Allow localhost origins only when `NODE_ENV !== "production"`.
- Restrict `methods` and `allowedHeaders`; keep `credentials: true` only with exact origins.

## Secure example

```ts
const origins = [env.FRONTEND_URL, env.ADMIN_FRONTEND_URL];
if (env.NODE_ENV !== "production") {
  origins.push("http://localhost:5173", "http://localhost:5174", "http://localhost:8081");
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);               // non-browser clients (curl, health checks)
    if (origins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```
