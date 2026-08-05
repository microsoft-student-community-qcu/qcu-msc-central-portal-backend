# F-07 — Single OCR Session Can Mint Multiple Records (Draft + Direct Applicant)

- **Category:** Business Logic (duplicate records, pipeline spam)
- **Affected files:** `src/controllers/application-draft.controller.ts:28-124`, `src/controllers/applicant.controller.ts:196`, `src/controllers/eventController.ts:209-211`, `prisma/schema.prisma:156`
- **Severity:** Medium · **Exploitability:** Easy (2 requests per session)

---

## Summary

The OCR session is consumed (deleted) only in the direct `createApplicant` path and the event-registration path — **not** in `createDraft`. A single scan can therefore create both a draft **and** a direct applicant record, with different emails. `Applicant.studentId` is also not unique, so the same physical student ID can produce several applicant records.

---

## Evidence

Session deletion points — `applicant.controller.ts:196` and `eventController.ts:209-211`:

```ts
// createApplicant
ocrStore.deleteSession(ocrSessionId);

// registerForEvent (guest path)
if (!isMemberPath && ocrSessionId) { ocrStore.deleteSession(ocrSessionId); }
```

`application-draft.controller.ts:80-92` — `createDraft` binds the session but never deletes it:

```ts
const draft = await prisma.applicationDraft.create({
  data: { currentStep: 0, ocrSessionId, ..., studentId: session.studentId, ... },
});
```

`prisma/schema.prisma:156` — studentId is not unique on `Applicant`:

```prisma
studentId String?  // QCU Student ID (YY-NNNN), extracted from Zonal OCR
```

---

## Why it is vulnerable

- After `createDraft` (batch 0), the same `ocrSessionId` can still be passed to `POST /api/v1/applicants` — both succeed with **different emails** (email is unique, studentId is not).
- The "one application per student" guarantee is broken: one person can produce duplicate pipeline entries, spamming the HR review queue and corrupting counts.

---

## Attack scenario

Applicant scans their ID → `createDraft` with email A → immediately `POST /api/v1/applicants` with email B and the same session → two applicant rows exist for one student ID; admin sees a duplicate pipeline entry.

---

## Recommended fix

1. Delete the OCR session in `createDraft` after binding (single-use semantics, matching the other paths).
2. Add `@unique` on `Applicant.studentId` (nullable — MySQL permits multiple NULLs, which is acceptable for manual entries).
3. Optionally gate `createApplicant` against an existing open draft for the same studentId.

## Secure example

```ts
// application-draft.controller.ts — after successful create
await prisma.applicationDraft.create({ data: { ... } });
ocrStore.deleteSession(ocrSessionId);   // session is single-use everywhere now
```

```prisma
model Applicant {
  ...
  studentId String? @unique   // one application per student ID
  ...
}
```
