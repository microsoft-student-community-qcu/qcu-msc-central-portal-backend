# F-10 — Vulnerable / Outdated Dependencies

- **Category:** Dependencies (vulnerable components)
- **Affected files:** `package.json`, `package-lock.json` (verified via `npm audit --omit=dev`)
- **Severity:** High (1) / Moderate (2) / Low applicability (rest)

---

## Summary

`npm audit` reports 6 vulnerabilities in the production tree. Two directly affect code paths in this application.

---

## Audit results (2026-08-04)

| Package | Resolved | Advisory | Severity | Applicability |
|---|---|---|---|---|
| `better-auth` | 1.6.18 | [GHSA-qq9h-g4jm-xgf3](https://github.com/advisories/GHSA-qq9h-g4jm-xgf3) — account takeover via pre-account hijacking on magic-link and email-OTP sign-in (CWE-287/345, CVSS 8.3) | **High** | App uses email/password only → the magic-link/OTP flow is not exposed; **upgrade anyway** — the fix bundle includes session-handling changes |
| `file-type` | 16.5.4 | [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) — infinite loop in ASF parser on malformed input (CWE-835) | Moderate | **Directly reachable**: `validateFileMimeType` calls `fromBuffer` on every upload (`src/utils/fileValidation.ts:22`) → crafted file can hang the worker |
| `uuid` | 9.0.1 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — buffer bounds check in v3/v5/v6 | Moderate | Not exploitable here: app uses v4 without a `buf` argument (`src/config/ocrStore.ts:1`) |
| `body-parser` (via express) | 1.20.5 | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) — invalid `limit` value disables size enforcement | Low | Not applicable: app uses default `express.json()` with no custom limit |
| `fast-xml-parser` (transitive) | — | [GHSA-8r6m-32jq-jx6q](https://github.com/advisories/GHSA-8r6m-32jq-jx6q) — DOCTYPE entity expansion | High | Not reachable via public API (Azure storage SDK internals) |
| `postcss` (transitive) | — | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) / GHSA-fxqj-rqcc-2cmp — path traversal in source-map loading | High | Build-time only; not runtime-exposed |

**Verified clean:** Express 4.22.2 (path-to-regexp 0.1.13 — patched), multer 1.4.5-lts.2 (patched), sharp 0.35.3, tesseract.js 5.1.1, zod 4.4.3, express-rate-limit 7.5.1.

---

## Why it is vulnerable

- **better-auth**: the advisory is High; even though this app does not enable magic-link/OTP, staying on a vulnerable minor is a standing risk — the installed `1.6.18` is inside the affected range `<1.6.22`.
- **file-type**: the parser hang is a direct DoS on the upload path — a 2 KB crafted file per request (rate-limited only per F-02's shared IP) can tie up Function App workers.

---

## Recommended fix

```bash
npm install better-auth@^1.6.22 file-type@^22 uuid@^14
npm audit
```

Then:

1. Re-run `npm audit` in CI (fail on high+).
2. Verify Better Auth 1.6.22+ behavior against the tests (`npm test`) — session/CSRF internals changed in the fix bundle.
3. Re-verify the file-type v22 API (`fromBuffer` signature is compatible; confirm import style).
