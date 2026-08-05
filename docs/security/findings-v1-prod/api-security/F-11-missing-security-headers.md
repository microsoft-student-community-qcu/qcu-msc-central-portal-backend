# F-11 — No Security Headers (helmet Absent, No nosniff on File Proxy)

- **Category:** API Security (security misconfiguration)
- **Affected files:** `src/app.ts` (no `helmet()`), `src/controllers/applicant.controller.ts:1040-1041, 1066-1067`
- **Severity:** Medium · **Exploitability:** Low-Medium

---

## Summary

No `helmet` (or manual) security headers are set anywhere: no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS. The file proxy serves user-uploaded content with `Content-Disposition: inline` and no nosniff.

---

## Evidence

`src/app.ts` — only `cors`, `express.json()`, rate limiters:

```ts
app.use(cors({ ... }));
app.use(express.json());
// no helmet, no CSP, no HSTS, no nosniff
```

`src/controllers/applicant.controller.ts:1040-1041`:

```ts
res.setHeader("Content-Type", finalContentType);
res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
```

---

## Why it is vulnerable

- Uploaded files are served **inline**; the magic-byte check (F-10 / file-type) rejects most polyglots, but defense-in-depth is missing — a browser that MIME-sniffs could interpret a crafted file as HTML/script in the API origin.
- HSTS is absent on a cookie/Bearer-auth API; clickjacking protections are absent on a portal API used from embedded contexts.

---

## Attack scenario

An applicant uploads a PDF with an embedded HTML payload (polyglot that passes the magic-byte check). When served inline from the API origin with a permissive content type and no `nosniff`, a user's browser may render the payload in the API origin, enabling cookie-harvesting scripts in the worst case. Low probability, high value.

---

## Severity & Exploitability

| | |
|---|---|
| **Severity** | Medium |
| **Exploitability** | Low-Medium (requires a successful polyglot upload + browser rendering) |

---

## Recommended fix

```ts
import helmet from "helmet";
app.use(helmet()); // CSP, HSTS (prod), X-Frame-Options, nosniff, referrer-policy

// In serveDocument / serveImage (applicant.controller.ts):
res.setHeader("X-Content-Type-Options", "nosniff");
// Serve non-PDF documents as attachment instead of inline:
// res.setHeader("Content-Disposition", `attachment; filename="..."`);
```
