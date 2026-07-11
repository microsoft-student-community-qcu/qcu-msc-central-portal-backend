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
    "fullName": string | null,
    "lastName": string | null,
    "firstName": string | null,
    "middleInitial": string | null,
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
    "fullName": "BUSTILLO, Mark Ian B.",
    "lastName": "Bustillo",
    "firstName": "Mark Ian",
    "middleInitial": "B",
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
    "ocrSessionId": null,
    "studentId": null,
    "fullName": null,
    "lastName": null,
    "firstName": null,
    "middleInitial": null,
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
    "fullName": null,
    "lastName": null,
    "firstName": null,
    "middleInitial": null,
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

1. **Capture:** User takes a photo of their Student ID via the guided camera overlay. The overlay should frame the card and minimize glare/angle.
2. **Send to OCR:** Frontend sends the captured image to `POST /api/v1/ocr/verify` as multipart/form-data.
3. **Backend processes:** Runs Zonal OCR on the predefined card zones and tracks failures per client IP.
4. **On success (200):**
   - Session stored with `manualRequired: false` and all extracted fields.
   - **Frontend behavior:** Pre-fill the form with `lastName`, `firstName`, and `middleInitial`. Keep these fields **editable** so the user can correct any OCR mistakes. Set the `studentId` field as **read-only** — it is authoritative from the server. Show the raw `fullName` text nearby as a reference.
   - Proceed to step 6.
5. **On failure:**
   - **Retries remaining (422, `attemptsRemaining > 0`):** No session is created. `ocrSessionId` is `null`. Show the error message and a retry prompt. Allow the user to retake the photo. Do **not** show the submit form yet — the user must succeed OCR or exhaust retries first.
   - **Exhausted (422, `attemptsRemaining = 0`):** Session stored with `manualRequired: true` and all fields `null`. Show the manual entry form with **all fields editable**, including `studentId`. The user fills everything by hand.
6. **Submit:** Frontend sends `POST /api/v1/applicants` with the `ocrSessionId` and the form fields. The backend resolves `manual_application` from the session.

### For Event Registrations

1. Same capture and OCR verification flow as above.
2. On success → pre-fill as described.
3. On failure with retries → prompt retake.
4. On exhausted → show full manual entry form.
5. Frontend submits `POST /api/v1/events/:eventId/register` with the `ocrSessionId`.

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
 | **Data stored** | `{ studentId, lastName, firstName, middleInitial, manualRequired, imagePath }` — nothing sensitive |
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
| `studentNumber` | 15%, 58%, 40%, 8% | `YY-NNNN` (e.g., `23-5678`) |
| `fullNameBlock` | 15%, 75%, 50%, 12% | Full name as printed on card (e.g., `BUSTILLO, Mark Ian B.`) |

The `fullNameBlock` is parsed server-side:
- If a comma is present, the left side becomes `lastName` and the right side becomes `firstName`.
- If no comma, the first word is treated as the last name and the rest is the first name.
- If the last word of the first name is a single letter (optionally followed by a dot, e.g. `B.`), it is extracted into `middleInitial` with the dot stripped.
- `lastName` is formatted in Title Case (e.g. `DELA CRUZ` → `Dela Cruz`).
- The original combined text is returned as `fullName` for frontend display.

> **Note:** These zones were calibrated against a physical QCU Student ID card scan (355×550px reference). If the card design changes or a different orientation is used, zone coordinates must be re-calibrated in `src/services/ocr.service.ts`.

---

## Extraction Limitations & Accuracy

Zonal OCR operates on fixed-position rectangles over the ID card image. Real-world conditions can reduce extraction accuracy:

| Factor | Impact |
|--------|--------|
| **Signature overlap** | The cardholder's printed signature sits close to the name block and can bleed into the `fullNameBlock` zone, adding stray marks or partial letter fragments to the OCR output. |
| **Name format variance** | Some QCU ID card issuances may use slightly different typography, letter spacing, or name ordering (e.g., missing comma, all-caps only, mixed case). |
| **Image quality** | Blurry photos, lens glare, harsh shadows, or skewed angles reduce Tesseract.js recognition confidence. |
| **Zone drift** | If the card is not centered, is rotated, or is cropped differently than expected, the fixed percentage-based zones may miss their targets. |

### Frontend Recommendations

- **Pre-fill but keep editable** — Populate `lastName`, `firstName`, and `middleInitial` from the OCR response, but allow the user to correct any field before submission. The raw `fullName` field is provided as a reference to help the user spot OCR errors.
- **Student ID is read-only** — The `studentNumber` zone targets numeric text with a clear `YY-NNNN` pattern, making it significantly more reliable than the name zone. Once extracted, display `studentId` as read-only. It will be validated server-side against the OCR session anyway.
- **Fallback to `fullName`** — If the parsed fields (`lastName`/`firstName`/`middleInitial`) look wrong, display the `fullName` value so the user can see exactly what the OCR engine read and correct accordingly.
- **Manual entry unlocks everything** — When `manualRequired: true`, all fields including `studentId` become editable. The user enters their details by hand.

---

## Error Responses

All OCR endpoints return appropriate HTTP status codes:

- `400`: Bad request (invalid file type, exceeds size limit)
- `422`: Unprocessable (OCR extraction failed)
- `429`: Too many requests (rate limit exceeded)
- `500`: Internal server error (OCR engine failure)

## Integration Notes

### Camera & Image Requirements

- Use a **guided camera overlay** that frames the ID card and prompts the user to keep the card flat, centered, and glare-free.
- Supported formats: JPEG, PNG. Maximum file size: 5 MB.
- Do **not** run OCR client-side. Always send the raw image to the server for processing.

### Submitting with an OCR Session

- The `ocrSessionId` returned by a successful or exhausted-attempt response **must** be forwarded to the submission endpoint (`POST /api/v1/applicants` or `POST /api/v1/events/:eventId/register`). Without it, the backend cannot determine whether the ID was verified or manual entry was used, and the submission will be rejected.
- The `ocrSessionId` is a UUID. The frontend should store it in-memory (not localStorage) and attach it to the submission payload. If the page is refreshed before submission, the user must re-verify.

### Retry UX

- When `attemptsRemaining > 0` but OCR failed (422), no session is created (`ocrSessionId: null`). The form/submit button should **not** be shown. Instead, display the error message and a "Retake Photo" button.
- After 3 consecutive failures, `attemptsRemaining: 0` and the session will have `manualRequired: true`. At this point, show the manual entry form. The frontend does not need to call `/ocr/verify` again for this session.

### Session Expiry

- OCR sessions expire after **10 minutes**. If the user takes too long to fill out the form, the submission will be rejected with "OCR session expired or invalid". The user must call `/ocr/verify` again to get a fresh session.
- The failure counter resets on **successful** OCR. A successful read wipes the previous failure count for that IP.

### Image Storage

- Both successful and failed OCR images are saved to the configured storage path (placeholder — TBD) for audit and admin review purposes. No action is needed from the frontend regarding image handling.
