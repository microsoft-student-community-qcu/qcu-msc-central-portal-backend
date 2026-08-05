# F-04 — Public Event Registration: Unauthenticated, Unrate-Limited, Capacity Race, NULL-studentId Duplicates

- **Category:** API Security / Business Logic (DoS, spam)
- **Affected files:** `src/routes/event.routes.ts:24`, `src/controllers/eventController.ts:83-92, 126-206`, `src/controllers/ocr.controller.ts:177-201`, `prisma/schema.prisma:216`
- **Severity:** High · **Exploitability:** Trivial, fully scriptable

---

## Summary

`POST /api/v1/events/:eventId/register` is public, has **no rate limiter**, and its duplicate/capacity protections fail for manual-mode registrations: guest registrations created from a failed-OCR session carry `studentId: null`, and MySQL treats NULLs as distinct in `@@unique([eventId, studentId])`.

---

## Evidence

`src/routes/event.routes.ts:24` — no limiter, no auth guard:

```ts
router.post("/:eventId/register", registerForEvent);
```

`src/controllers/eventController.ts:83-92` — count-then-insert capacity check (racy):

```ts
const currentRegistrationCount = await prisma.registration.count({
  where: { eventId, status: { not: "REJECTED" } },
});
if (currentRegistrationCount >= event.maxCapacity) { res.status(409) ... }
```

`src/controllers/eventController.ts:162-163, 203-204` — NULL studentId from manual sessions:

```ts
studentId = session.studentId;              // null when manualRequired: true
manualRegistration = session.manualRequired;
...
status: manualRegistration ? "PENDING_REVIEW" : "APPROVED",
```

`prisma/schema.prisma:216`:

```prisma
@@unique([eventId, studentId]) // MySQL: multiple rows with NULL studentId allowed
```

---

## Why it is vulnerable

1. **No rate limit / no auth** on the registration endpoint at all.
2. **Unlimited manual registrations**: 3 garbage image uploads → `manualRequired: true` session (`ocr.controller.ts:177-201`) → register with arbitrary name + email + `studentId: null` → unique constraint does **not** apply → repeat indefinitely.
3. **Capacity counts `PENDING_REVIEW`** (`status != REJECTED`) → fake registrations exhaust `maxCapacity` for real attendees.
4. **Email flooding**: every registration triggers `sendRegistrationPendingReviewEmail` (`eventController.ts:216-217`) → inbox and review-queue flooding for the org.
5. **Race**: concurrent requests can all pass the count check and oversubscribe the event.

---

## Attack scenario

Bot loop: `garbage-upload ×3 → POST /register with fake name + victim@email.com → repeat with different emails`. The event fills with fake pending-review entries, admins' inboxes are spammed, and real students can no longer register.

---

## Severity & Exploitability

| | |
|---|---|
| **Severity** | High (availability; email abuse; admin workload) |
| **Exploitability** | Trivial — no auth, no limits, scriptable |

---

## Recommended fix

1. Add a limiter: per-IP **and** per-email (e.g., 5/min/IP, 3 per event per email).
2. Count only `APPROVED` registrations toward capacity.
3. Make capacity enforcement atomic (transaction with row lock, or `UPDATE events SET ... WHERE spots_left > 0`).
4. Verify email ownership for guest registrations (send a one-time code) before creating PENDING_REVIEW entries.
5. Cap manual (PENDING_REVIEW) registrations per event.

## Secure example

```ts
const eventRegisterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: clientIp, // see F-02
  standardHeaders: true,
  legacyHeaders: false,
});
router.post("/:eventId/register", eventRegisterLimiter, registerForEvent);
```

```ts
// Capacity check — transactional and APPROVED-only
await prisma.$transaction(async (tx) => {
  const event = await tx.$queryRaw`SELECT maxCapacity FROM Event WHERE id = ${eventId} FOR UPDATE`;
  const approved = await tx.registration.count({
    where: { eventId, status: "APPROVED" },
  });
  if (approved >= event.maxCapacity) throw new CapacityExceededError();
  await tx.registration.create({ data: { ... } });
});
```
