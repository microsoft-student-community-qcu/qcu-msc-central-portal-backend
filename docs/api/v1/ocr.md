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
    "fullName": "Alex Johnson",
    "manualRequired": false,
    "attemptsRemaining": 2
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
    "fullName": null,
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
4. **Success:** Backend stores session in memory (10-min TTL) with `{ studentId, fullName, manualRequired: false }`. Frontend pre-fills form with extracted data.
5. **Failure (3 attempts):** Backend stores session with `{ manualRequired: true }`. Frontend shows manual entry form.
6. Frontend submits `POST /api/v1/applicants` with the `ocrSessionId` and any user-filled fields.

### For Event Registrations
1. Frontend captures Student ID image.
2. Frontend sends to `POST /api/v1/ocr/verify` (same endpoint).
3. Same OCR + fallback logic applies.
4. Frontend submits `POST /api/v1/events/:eventId/register` with the `ocrSessionId`.

---

## OCR Failure Tracking

- Failure count is tracked server-side per client IP using an in-memory store with a 1-hour TTL.
- After 3 consecutive failures within the window, `manualRequired` is set to `true` and the counter freezes.
- On successful OCR, the counter resets to zero.
- The `ocrSessionId` links the OCR result to the subsequent submission for server-side verification.

> **Note:** In-memory tracking is sufficient for development. A production deployment should use Redis or a database-backed store for persistence across restarts and instances.

---

## Zonal OCR Details

The Zonal OCR engine extracts data from predefined rectangular zones on the QCU Student ID card:

| Field | Zone | Expected Format |
|-------|------|-----------------|
| `studentId` | Configurable (placeholder TBD) | `YY-NNNN` (e.g., `23-5678`) |
| `fullName` | Configurable (placeholder TBD) | Full name as printed on card |

Zone coordinates are expressed as percentages relative to image dimensions (x%, y%, width%, height%) for resolution independence. Actual zone coordinates will be configured once a reference QCU Student ID template is available.

---

## Error Responses

All OCR endpoints return appropriate HTTP status codes:

- `400`: Bad request (invalid file type, exceeds size limit)
- `422`: Unprocessable (OCR extraction failed)
- `429`: Too many requests (rate limit exceeded)
- `500`: Internal server error (OCR engine failure)

## Integration Notes

- **Frontend:** Must capture the image using the guided camera overlay before calling this endpoint. Do not run any OCR client-side.
- **Image Storage:** Both successful and failed OCR images are saved to the configured storage path (placeholder — TBD) for audit and admin review purposes.
- **OCR Session TTL:** Sessions expire after 10 minutes. If the user does not submit the application/registration within that window, they must re-verify.
