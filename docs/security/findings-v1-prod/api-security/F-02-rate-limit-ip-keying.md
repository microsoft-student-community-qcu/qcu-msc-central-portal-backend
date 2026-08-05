# F-02 — Rate Limiting & OCR Failure Tracking Keyed on a Single Shared Proxy IP

- **Category:** API Security (rate limiting, availability)
- **Affected files:** `src/app.ts` (no `trust proxy` configured), `src/config/ocrStore.ts:71-89`, all `express-rate-limit` instances, `src/controllers/ocr.controller.ts:115-157`
- **Severity:** High · **Exploitability:** Trivial

---

## Summary

Express is **not** configured with `app.set("trust proxy", ...)`, so `req.ip` is the socket address of the Azure gateway — **identical for every client**. Every rate limiter and the OCR failure counter are keyed on this shared IP, turning per-client abuse controls into global switches.

---

## Evidence

No trust-proxy setting anywhere in `src/app.ts`:

```ts
const app = express();
app.use(cors({ ... }));
app.use(express.json());
// ... no app.set("trust proxy", ...)
```

`src/controllers/ocr.controller.ts:115-157`:

```ts
const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
...
const attemptsRemaining = ocrStore.incrementFailure(clientIp, env.OCR_MAX_FAILURES);
if (attemptsRemaining > 0) { res.status(422) ... }
// otherwise: createSession({ ..., manualRequired: true }) — manual mode for everyone
```

`src/config/ocrStore.ts:75-85`:

```ts
incrementFailure(ip: string, maxFailures: number): number {
  const entry = failureCounters.get(ip) ?? { count: 0, firstAttempt: now };
  entry.count += 1;
  ...
  return Math.max(0, maxFailures - entry.count);
}
```

---

## Why it is vulnerable

- Behind the Azure Functions gateway, all requests present the same socket IP → all clients share one bucket:
  - sign-in 10/min, sign-up 5/min, OCR 10/min, applicant 5/min, draft 10/min → a single client's burst locks out the **whole app** for that window.
  - The OCR failure counter (3 strikes → `manualRequired`) is **global**: 3 garbage uploads by anyone flips every subsequent OCR user into manual-entry mode; one success resets the counter for everyone.
- `express-rate-limit` uses `req.ip` the same way (no `ipKeyGenerator`).

---

## Attack scenario

1. Attacker sends 3 random images to `POST /api/v1/ocr/verify`.
2. `incrementFailure` reaches the global cap → **every** student's ID scan now returns "manual entry required".
3. Attacker repeats a successful scan every time a legit user resets the counter — permanent degradation of the onboarding flow with ~3 requests per cycle.

---

## Severity & Exploitability

| | |
|---|---|
| **Severity** | High (availability/integrity of the core onboarding flow) |
| **Exploitability** | Trivial — 3 requests, no auth |

---

## Recommended fix

1. Configure `trust proxy` correctly for the Azure gateway hop count: `app.set("trust proxy", <hops>)`.
2. Derive the client IP from `X-Forwarded-For` (first untrusted hop) and key rate limits/OCR counters on it.
3. Add per-email buckets for sign-in and per-event buckets for registration.
4. Move counters to shared state (Redis) — see F-03 — so they behave identically across instances.

## Secure example

```ts
// src/app.ts — after env load, before middleware
app.set("trust proxy", 1); // adjust to the actual gateway hop count in Azure

// Custom IP generator for express-rate-limit (honors XFF, validated)
function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0].trim();
    if (first && first !== "unknown") return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

const signInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: clientIp,
  standardHeaders: true,
  legacyHeaders: false,
});
```
