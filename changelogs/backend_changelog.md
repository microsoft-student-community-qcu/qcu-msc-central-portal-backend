# Backend Modification Changelog

## 0. Event Cancellation (Soft Delete) & QR Ticket Re-send (2026-08-18)

Implements V2 Flow 8 (cancel a whole event) and the V2 Flow 7 edge case (attendee lost their QR pass email).

### **A. Database Schema (`prisma/schema.prisma`)**
- Added three fields to the `Event` model: `isCancelled Boolean @default(false)`, `cancellationReason String? @db.Text`, and `cancelledAt DateTime?`.
- Added `@@index([isCancelled, date])` — the public feed filters on `isCancelled` and orders by `date` on every request, so the composite index keeps that hot query cheap.
- Migration: `prisma/migrations/20260818171500_add_event_cancellation_soft_delete`. Existing rows backfill to `isCancelled = false`, so all current events stay visible.

### **B. Validation (`src/schemas/event.schema.ts`)**
- Added `cancelEventSchema` requiring `reason` at 10-1000 characters with custom human-readable messages. The reason is embedded verbatim in the notification email, so blank or throwaway values are rejected with `400` rather than silently mailing an empty explanation.

### **C. Email Senders (`src/services/email.service.ts`)**
- `sendEventCancelledEmail(to, eventTitle, reason)` — cancellation notice including the admin's reason. Follows the house convention of catching its own errors, since one bad address must not abort the fan-out.
- `resendRegistrationTicketEmail(to, eventTitle, qrPayload)` — re-sends an existing QR pass. Deliberately **propagates** errors (like `sendDraftResumeLinkEmail`) so the endpoint can answer `502`; an admin acting on one specific attendee needs to know whether delivery succeeded.

### **D. Cancellation Controller (`src/controllers/eventCancellationController.ts`)**
- New `cancelEvent` handler: validates the reason, `404`s on unknown events, `409`s on already-cancelled ones (idempotent no-op), then flags the `Event` row only — **no `Event` or `Registration` row is ever deleted**, preserving the roster for audit and reporting.
- Notifies every `APPROVED` and `PENDING_REVIEW` registrant via `Promise.allSettled`, so a single failed address cannot block the rest of the batch. `REJECTED` / `CANCELLED` registrants are skipped — they were never (or are no longer) attending.
- Responds with `notifiedRegistrants` so the admin UI can confirm the fan-out size.

### **E. Ticket Re-send Controller (`src/controllers/eventTicketController.ts`)**
- New `resendRegistrationTicket` handler: re-sends the **stored** `qrPayload` as-is and never regenerates it, so any copy the attendee still holds remains valid and check-in behaviour is unchanged.
- Guards: `404` when the registration does not belong to the event in the path (prevents cross-event ID probing), `400` for non-`APPROVED` registrations, `409` when the event is cancelled, `502` on email provider failure.

### **F. Cancelled-Event Exclusion (`eventsFeedController.ts`, `eventController.ts`)**
- Public feed (`GET /api/v1/events`) now filters `isCancelled: false`.
- Detail endpoint returns `404 "This event has been cancelled."` — deliberately not `200` with a flag, so stale links cannot render a dead event as live.
- Registration, QR check-in, manual check-in, and ticket re-send all reject cancelled events with `409`; the admin roster endpoint still serves the record and echoes the cancellation fields.

### **G. Routes (`src/routes/event.routes.ts`)**
- `PATCH /api/v1/events/:eventId/cancel` and `POST /api/v1/events/:eventId/registrations/:registrationId/resend-ticket`, both behind `requireAdminLogistics`.
- **TODO:** V2 Flow 8 restricts cancellation to `ADMIN_LOGISTICS_HEAD` / `SUPERADMIN`. Neither role exists in the `UserRole` enum and `authMiddleware.ts` has no matching guard, so the tighter guard is deferred to the auth/RBAC module and tracked separately.

### **H. Tests (`src/__tests__/event.routes.test.ts`)**
- 14 new cases covering the reason requirement, soft-delete assertions (`update` called, no `delete`), the `APPROVED` + `PENDING_REVIEW` email fan-out, exclusion from the public feed and detail endpoint, and every re-send guard.
- New blocks call `vi.clearAllMocks()` alongside the suite's existing `vi.restoreAllMocks()`: the prisma/email mocks are defined in `setup.ts`, so `restoreAllMocks` leaves their call history intact and the `not.toHaveBeenCalled()` assertions would otherwise see calls leaked from earlier tests.

---

## 3. Security Fixes

### **VUL-016 — Mass Assignment Privilege Escalation on User Sign-Up** (2026-07-30)
- **Root Cause:** The sign-up handler at `src/app.ts` forwarded raw `req.body` to Better Auth, allowing a malicious client to inject `role: "ADMIN_HR"` and escalate privileges at account creation.
- **Fix:** Replaced `req.body.name = ...` with a full clean body reconstruction from Zod-validated `result.data`, omitting the `role` field entirely. Only `email`, `password`, `name`, `studentId`, and `middleInitial` are now forwarded to Better Auth.

### **VUL-004 — Account Pre-Hijacking via Unenforced Setup Token Validation** (2026-07-30)
- **Root Cause:** `POST /api/auth/sign-up/email` accepted account registrations without requiring a setup token. An attacker who knew a victim's email could pre-register before the victim used their setup link.
- **Fix:** Added `setupToken` to the Zod `signUpSchema`. Before forwarding to Better Auth, the handler verifies the JWT via `verifySetupToken()`, checks that the email matches the token payload, and confirms the applicant exists with `userId: null` (not already linked).

---

The following is a comprehensive and detailed breakdown of **all** the backend modifications made in this session, covering both the Applicant Resubmission feature and the Azure Storage private blob streaming fixes.

## 1. Applicant Resubmission & Self-Service Features

### **A. Database Schema Update (`prisma/schema.prisma`)**
- Added a new `resubmitFields String?` column to the `Applicant` model. This field stores a JSON array (or comma-separated list) of exactly which fields the admin has unlocked for the applicant to edit during a `RESUBMIT` status.

### **B. Schema Validation (`src/schemas/applicant.schema.ts`)**
- Updated `updateApplicantStatusSchema` to include an optional `resubmitFields` array. This allows the admin frontend to securely dictate which fields the applicant is allowed to fix.

### **C. Resubmission File Uploads (`src/routes/applicant.routes.ts` & `applicant.controller.ts`)**
- Overhauled the `POST /api/v1/applicants/:applicantId/resubmit` route to properly accept `multipart/form-data`.
- Attached the `upload.fields()` middleware to the resubmit route to process `certificateOfRegistration` and `curriculumVitae` file uploads.
- Updated the `resubmitApplication` controller logic to check the `unlocked` fields array. If documents were unlocked, it saves the new files via `saveDocument` and updates their paths in the database.

### **D. Applicant 'Me' Endpoint (`src/routes/applicant.routes.ts` & `applicant.controller.ts`)**
- Created a new `getApplicantMe` controller and registered the `GET /api/v1/applicants/me` route.
- This endpoint allows an authenticated applicant to securely fetch their own live applicant profile, status, and admin messages directly, powering the frontend tracking portal.

---

## 2. Azure Storage Streaming & Content-Type Fixes

The following is a comprehensive and detailed breakdown of all the backend modifications made to securely resolve the Azure Storage private blob access blocks and the document format rendering issues.

## 1. Storage Utility Modifications (`src/utils/imageStorage.ts`)

### **A. Added Stream Helpers**
Since public access is disabled on the Azure Storage Account, the backend must now securely download the blobs on behalf of the client.
- Implemented `getDocumentStream(filename: string)` and `getImageStream(filename: string)`.
- These functions utilize the Azure `getBlockBlobClient().download(0)` method.
- They return an object containing the `readableStreamBody`, `contentType`, and `contentLength` to allow the backend to stream the data to the client efficiently without loading it fully into RAM.

### **B. Fixed Upload Content Types**
When files were previously uploaded, Azure defaulted them to `application/octet-stream` because no explicit MIME type was provided, causing browsers to handle PDFs and images as generic downloads.
- Updated `saveDocument` and `saveImage` to accept an optional `mimetype?: string` parameter.
- When calling `blockBlobClient.upload()`, we now explicitly map `blobHTTPHeaders: { blobContentType: mimetype }`. This ensures any future uploads strictly preserve their exact file format type (e.g., `application/pdf`).

---

## 2. Controller Additions (`src/controllers/applicant.controller.ts`)

### **A. Added Proxy Controllers**
Added the logic necessary to intercept the Azure streams and pipe them out as HTTP responses back to the frontend.
- Created `serveDocument` and `serveImage` endpoints.
- Each endpoint extracts the `filename` from `req.params` and requests the stream from `imageStorage.ts`.
- The Azure blob read stream is then piped directly into the Express `res` object (`stream.pipe(res)`).

### **B. Added Header Overrides (Backward Compatibility)**
Because legacy documents in the database were already uploaded as generic `application/octet-stream`, passing this straight to the frontend caused browsers to download them as corrupt/blank binary files.
- Added a `getContentTypeFromFilename` utility.
- If the Azure stream reports a MIME type of `application/octet-stream`, the controller guesses the true type from the file extension (e.g., mapping `.pdf` to `application/pdf`, `.jpg` to `image/jpeg`, and `.docx` to `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- Set `res.setHeader('Content-Type', finalContentType)` before piping.
- Set `res.setHeader('Content-Disposition', 'inline; filename="..."')` so the browser preserves the original filename, and renders the PDF directly in a new tab instead of treating it as a raw download.

### **C. Explicit MIME Type Preservation**
Updated the `createApplicant` and `resubmitApplication` endpoints to automatically preserve the true file type of uploaded documents:
- When calling `saveDocument` for COR and CV files, the exact `file.mimetype` parsed by multer is passed down to the Azure storage utility.
- This guarantees that new `.pdf`, `.docx`, `.jpg`, and `.png` files are forever stored correctly in Azure, completely eliminating the need for the fallback header workaround on newly uploaded files.

### **D. Date of Birth Object Conversion Fix**
- In `resubmitApplication`, the incoming text parameters are parsed from `req.body`. 
- Previously, the `dateOfBirth` string (e.g. `"2005-03-24"`) was merged directly into `updateData` and passed to Prisma's update query as a raw string. Since the `dateOfBirth` database column is defined as `DateTime`, Prisma threw a type mismatch validation error, resulting in a **`500 Internal Server Error`**.
- Added a conversion step `bodyData.dateOfBirth = new Date(bodyData.dateOfBirth)` to transform the parsed date string into a valid JavaScript `Date` object before updating the database, resolving the 500 error.

---

## 3. Router Configuration (`src/routes/applicant.routes.ts`)

### **A. Registered Secure Proxy Routes**
Wired up the new proxy controllers to explicit, authorized API paths.
- Imported the `serveDocument` and `serveImage` controllers.
- Defined two new GET routes:
  - `GET /api/v1/applicants/documents/:filename`
  - `GET /api/v1/applicants/images/:filename`
- Both routes are guarded by the `requireAuth` middleware. This enforces that only logged-in members (or the authenticated admin frontend) with valid Session Bearer tokens can access these document and image streams, ensuring complete security.

### **B. Route Shadowing & 403 Forbidden Fix**
- Reordered route definitions to move the static `/me` path (`GET /api/v1/applicants/me`) **above** the dynamic `:applicantId` path (`GET /api/v1/applicants/:applicantId`).
- Previously, because the dynamic param route was defined first, a request to `/applicants/me` matched `/:applicantId` (binding `req.params.applicantId = "me"`). Because the admin routes are guarded by `requireAdminHR`, this blocked all regular applicants with a `403 Forbidden` error, causing the student dashboard tracking to default to a stale "Under review" fallback. Moving it above resolves the issue.
