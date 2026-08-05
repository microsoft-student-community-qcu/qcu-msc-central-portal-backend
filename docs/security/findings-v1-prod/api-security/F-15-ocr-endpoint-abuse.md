# F-15 — OCR Endpoint: CPU-Heavy, Storage-Cost Abuse, Per-IP Only

- **Category:** API Security (resource exhaustion, cost abuse)
- **Affected files:** `src/controllers/ocr.controller.ts:109-113`, `src/services/ocr.service.ts` (Tesseract + sharp multi-pass), `src/routes/ocr.routes.ts:10-19`
- **Severity:** Medium · **Exploitability:** Easy

---

## Summary

The public `POST /api/v1/ocr/verify` endpoint runs expensive OCR (Tesseract + sharp preprocessing, up to 4 passes per image) and **always** uploads the image to Azure Blob — success or failure — yet its only protection is a per-(shared)-IP limiter (see F-02).

---

## Evidence

`src/controllers/ocr.controller.ts:109-113` — every attempt persists the image:

```ts
const imagePath = await saveImage(
  file.buffer,
  `ocr_${Date.now()}_${file.originalname}`,
  file.mimetype
);
```

`src/routes/ocr.routes.ts:10-19` — the only control:

```ts
const ocrLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, ... });
router.post("/verify", ocrLimiter, uploadImage, verifyOcr);
```

---

## Why it is vulnerable

- Each request spins up Tesseract workers and runs multiple sharp transforms — high CPU per request.
- Because of F-02 (shared `req.ip`), the 10/min bucket is effectively global behind the Azure gateway, so it neither protects the backend nor binds any single attacker.
- Every image (including garbage) is stored forever in the `ocr` blob container → storage cost abuse.

---

## Attack scenario

Distributed botnet sends OCR requests with random images → CPU exhaustion of the Function App instances (billing spike, latency for legitimate users) and unbounded blob storage growth.

---

## Recommended fix

1. Fix per-client IP keying (F-02), then add a **daily per-IP cap** (e.g., 50/day) and per-email caps.
2. Short-circuit obviously invalid images (tiny dimensions, non-photo content) before OCR.
3. Consider queueing OCR work off the request path, and/or rate-limit per CPU budget on the Function App.
4. Add a retention/cleanup job for OCR audit blobs (e.g., 30 days) to bound storage cost.
