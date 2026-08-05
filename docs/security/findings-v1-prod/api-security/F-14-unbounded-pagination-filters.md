# F-14 — Unbounded / Unvalidated Pagination and Filters

- **Category:** API Security (DoS / resource abuse)
- **Affected files:** `src/controllers/eventController.ts:321-372`, `src/controllers/applicant.controller.ts:362-431`
- **Severity:** Low · **Exploitability:** Easy (admin-authenticated)

---

## Summary

Two admin endpoints accept unbounded or unvalidated query parameters: the event roster endpoint returns **all** registrations with no `take`/`skip`, and its `status` filter is passed raw into Prisma; the applicants list accepts `limit`/`offset` with no validation or cap.

---

## Evidence

`src/controllers/eventController.ts:335-347`:

```ts
const where: any = { eventId };
if (status) where.status = status;      // arbitrary string → Prisma enum validation error → 500
...
prisma.registration.findMany({ where, orderBy: { createdAt: "desc" } }); // no take/skip
```

`src/controllers/applicant.controller.ts:406-414`:

```ts
skip: parseInt(offset, 10),
take: parseInt(limit, 10),              // limit=999999999 or NaN accepted
```

---

## Why it is vulnerable

- A large event returns the entire registrations table in one response — memory/bandwidth exhaustion for the admin panel.
- `limit=NaN` throws a Prisma runtime error → 500 (noisy); `limit=999999999` dumps everything.
- `status=GARBAGE` on the roster endpoint → unhandled 500.

---

## Attack scenario

A compromised/buggy admin client (or a member who obtained an admin token) requests `GET /api/v1/events/:id/registrations?status=x` to cause errors, or pulls the whole roster without pagination — resource strain on a shared Function App.

---

## Recommended fix

```ts
const limit = z.coerce.number().int().min(1).max(100).default(50);
const offset = z.coerce.number().int().min(0).default(0);
const status = registrationStatusEnum.optional();  // validated enum

const [total, registrations] = await Promise.all([
  prisma.registration.count({ where }),
  prisma.registration.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: "desc" } }),
]);
```
