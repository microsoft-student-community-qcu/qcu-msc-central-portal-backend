# OCR Verification API

## Overview
The OCR Verification API handles Student ID image processing for both membership applications and event registrations. It uses **Zonal OCR** to extract student data from predefined regions of the QCU Student ID card. This is a two-step flow: first verify the ID via OCR, then submit the application/registration with the resulting session token.

---

## Endpoints

### 1. Verify Student ID (OCR)

**Description:**  
Accepts a Student ID image, runs Zonal OCR on predefined card zones, and returns extracted data. The backend tracks OCR failure count per client IP (3 failures triggers manual fallback mode). Used by both membership applicants and event registrants.

**Method:** `POST`  
**Path:** `/api/v1/ocr/verify`

**Rate Limit:** 10 requests per minute per IP address

**Authentication:** None (public guest endpoint)

**Request:** Multipart form data
- `image` (file, required): Student ID photo (JPEG/PNG, max 5MB)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "ocrSessionId": string (UUID),
    "studentId": string | null,
    "lastName": string | null,
    "firstName": string | null,
    "universityName": string | null,
    "programCode": string | null,
    "manualRequired": boolean,
    "attemptsRemaining": number
  },
  "message": string
}
```

**Success Response (OCR Extracted):**
```json
{
  "success": true,
  "data": {
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440004",
    "studentId": "23-5678",
    "lastName": "BUSTILLO",
    "firstName": "Mark Ian B.",
    "universityName": "QUEZON CITY UNIVERSITY",
    "programCode": "BSIT",
    "manualRequired": false,
    "attemptsRemaining": 3
  },
  "message": "Student ID verified successfully"
}
```

**Error Response (OCR Failed — Retries Available):**
```json
{
  "success": false,
  "data": {
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440005",
    "studentId": null,
    "lastName": null,
    "firstName": null,
    "universityName": null,
    "programCode": null,
    "manualRequired": false,
    "attemptsRemaining": 1
  },
  "message": "Could not read Student ID. Please retake the photo. (2/3 attempts used)"
}
```

**Error Response (OCR Failed — Manual Fallback Triggered):**
```json
{
  "success": false,
  "data": {
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440006",
    "studentId": null,
    "lastName": null,
    "firstName": null,
    "universityName": null,
    "programCode": null,
    "manualRequired": true,
    "attemptsRemaining": 0
  },
  "message": "Unable to read Student ID after 3 attempts. Please enter your details manually."
}
```

**Status Codes:**
- `200`: OCR succeeded — data extracted
- `400`: Bad request (invalid file, wrong format, exceeds size)
- `422`: OCR failed — malformed or unreadable ID image
- `429`: Rate limit exceeded

---

## Usage Flow

### For Membership Applications
1. Frontend captures Student ID image via camera overlay.
2. Frontend sends image to `POST /api/v1/ocr/verify`.
3. Backend runs Zonal OCR, tracks failures per IP in memory.
4. **Success:** Backend stores session in memory (10-min TTL) with `{ studentId, lastName, firstName, manualRequired: false }`. Frontend pre-fills form with extracted data.
5. **Failure (3 attempts):** Backend stores session with `{ manualRequired: true }`. Frontend shows manual entry form.
6. Frontend submits `POST /api/v1/applicants` with the `ocrSessionId` and any user-filled fields.

### For Event Registrations
1. Frontend captures Student ID image.
2. Frontend sends to `POST /api/v1/ocr/verify` (same endpoint).
3. Same OCR + fallback logic applies.
4. Frontend submits `POST /api/v1/events/:eventId/register` with the `ocrSessionId`.

---

## Understanding the OCR Session

### What is `ocrSessionId`?

`ocrSessionId` is a **server-generated UUID** that represents the result of a single OCR verification attempt. It is the glue between the two-step flow:

```
POST /api/v1/ocr/verify   →   returns ocrSessionId + manualRequired
                                   ↓
POST /api/v1/[submit]     →   forwards ocrSessionId
                                   ↓
                              Backend looks up session:
                              ├── manualRequired=true  → sets flag (manual_application / manual_registration)
                              ├── manualRequired=false → uses extracted studentId
                              └── session expired      → rejects (must re-verify)
```

### Why is it needed?

Without `ocrSessionId`, a client could bypass OCR entirely by calling `POST /api/v1/applicants` directly with a fake `studentId` and claim OCR passed. The session token ensures the `manualRequired` flag is **authoritative from the backend** — the client cannot lie about whether OCR succeeded or failed.

### Where is it stored?

**In memory only** — not in the database. The backend holds all active sessions in a simple JavaScript `Map<string, OcrSession>` inside the running Node.js process (`src/config/ocrStore.ts`). This means:

| Characteristic | Behavior |
|----------------|----------|
| **Persistence** | Lost when the Node.js process stops (crash, restart, deploy) |
| **TTL** | 10 minutes — expired sessions are pruned automatically |
| **Data stored** | `{ studentId, lastName, firstName, manualRequired, imagePath }` — nothing sensitive |
| **Scaling** | Single-process only. Multiple server instances cannot share sessions |

### Why in-memory is fine for development

- Sessions are **extremely short-lived** (10 min). If the server restarts, the user just sees "Session expired, please re-verify" — no data loss or crash.
- No sensitive information is held — just extracted ID fields and an image path.
- Avoids database writes for a transient token that lives only minutes.
- Simple to replace with Redis later when needed.

### When to upgrade to a persistent store (Redis)

| Requirement | Solution |
|-------------|----------|
| Multiple Node.js instances (load balancing) | Shared Redis instance so sessions survive across servers |
| Crash resilience in production | Redis persistence so OCR results survive a restart |
| High-traffic metric tracking | Redis with TTL for accurate failure rate analytics |

The architecture is designed so that swapping the in-memory `Map` for a Redis client requires no changes to the controller or route — only `src/config/ocrStore.ts`.

---

## OCR Failure Tracking

- Failure count is tracked server-side per client IP using an in-memory store with a 1-hour TTL.
- After 3 consecutive failures within the window, `manualRequired` is set to `true` and the counter freezes.
- On successful OCR, the counter resets to zero.
- The `ocrSessionId` links the OCR result to the subsequent submission for server-side verification.

> **Note:** In-memory tracking is sufficient for development. A production deployment should use Redis or a database-backed store for persistence across restarts and instances.

---

## Zonal OCR Details

The Zonal OCR engine extracts data from predefined rectangular zones on the QCU Student ID card. Zones are defined as percentages of the image dimensions (x%, y%, width%, height%) for resolution independence.

| Field | Zone (x%, y%, w%, h%) | Expected Format |
|-------|----------------------|-----------------|
| `universityName` | 38%, 3.5%, 46%, 6.5% | Full institution name (e.g., `QUEZON CITY UNIVERSITY`) |
| `studentNumber` | 15%, 58%, 40%, 8% | `YY-NNNN` (e.g., `23-5678`) |
| `lastName` | 15%, 75%, 50%, 5% | Bold uppercase surname (e.g., `BUSTILLO`) |
| `firstName` | 15%, 80%, 50%, 7% | Given name + middle initial (e.g., `Mark Ian B.`) |
| `programCode` | 30%, 92.5%, 40%, 4.5% | Course/degree code (e.g., `BSIT`) |

> **Note:** These zones were calibrated against a physical QCU Student ID card scan (355×550px reference). If the card design changes or a different orientation is used, zone coordinates must be re-calibrated in `src/services/ocr.service.ts`.

---

## Error Responses

All OCR endpoints return appropriate HTTP status codes:

- `400`: Bad request (invalid file type, exceeds size limit)
- `422`: Unprocessable (OCR extraction failed)
- `429`: Too many requests (rate limit exceeded)
- `500`: Internal server error (OCR engine failure)

## Integration Notes

- **Frontend:** Must capture the image using the guided camera overlay before calling this endpoint. Do not run any OCR client-side.
- **ocrSessionId is required for submission:** The `ocrSessionId` returned by this endpoint must be forwarded to the submission endpoint (`POST /api/v1/applicants` or `POST /api/v1/events/:eventId/register`). Without it, the backend cannot determine whether the ID was verified or if manual entry was required, and the submission will be rejected.
- **Image Storage:** Both successful and failed OCR images are saved to the configured storage path (placeholder — TBD) for audit and admin review purposes.
- **OCR Session TTL:** Sessions expire after 10 minutes. If the user does not submit the application/registration within that window, they must re-verify.
