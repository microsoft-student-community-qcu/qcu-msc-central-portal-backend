# F-03 — In-Memory OCR Sessions and Failure Counters Don't Survive Scale-Out

- **Category:** Authentication / Session Management (availability)
- **Affected files:** `src/config/ocrStore.ts:21-41`, deployment `src/functions/app.ts` (Azure Function App, multiple instances)
- **Severity:** Medium-High · **Exploitability:** Easy in a scaled deployment

---

## Summary

OCR sessions and failure counters live in a module-level in-memory `Map` with a `setInterval` pruner. An Azure Function App scales horizontally, so state created on one instance is invisible to the others.

---

## Evidence

`src/config/ocrStore.ts:21-41`:

```ts
const sessions = new Map<string, OcrSession>();
const failureCounters = new Map<string, FailureEntry>();
const SESSION_TTL = 10 * 60 * 1000;
const FAILURE_TTL = 60 * 60 * 1000;

function prune(): void { /* delete expired entries */ }
setInterval(prune, 60_000);
```

`src/functions/app.ts` — stateless HTTP trigger; no affinity guarantee:

```ts
azureApp.http("express-api", { authLevel: "anonymous", route: "{*segments}", handler: handleRequest });
```

---

## Why it is vulnerable

- A session created on instance A is not found on instance B → random "OCR session expired or invalid" errors for legitimate users.
- The 10-minute session TTL and 30-minute resume-link cooldown can be bypassed by alternating requests across instances.
- Rate-limit counters (F-02) are also per-instance → limits multiply by instance count for an attacker with distributed sources.

---

## Attack scenario

With ≥2 instances and a load balancer: a user completes OCR (instance A) and immediately submits the application (instance B) → 400 "OCR session expired" — a flaky-by-design flow. An attacker rotates requests across instances to exceed every quota without ever being throttled.

---

## Recommended fix

Back the store with shared state:

- **Azure Cache for Redis** (preferred): TTL-native, atomic `INCR` for failure counters.
- Or persist OCR sessions to the DB with expiry.
- Remove the module-level `setInterval` (Redis TTL replaces it).

```ts
// Example shape with Redis (@azure/redis or ioredis)
const key = `ocr:session:${sessionId}`;
await redis.set(key, JSON.stringify(session), "EX", 600);     // 10-min TTL
const fails = await redis.incr(`ocr:fails:${clientIp}`);
await redis.expire(`ocr:fails:${clientIp}`, 3600);            // 1-hour window
```
