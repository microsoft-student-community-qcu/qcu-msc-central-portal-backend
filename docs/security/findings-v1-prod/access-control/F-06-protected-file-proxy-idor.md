# F-06 — Latent IDOR + Path-Traversal-Shaped File Proxy (currently shadowed by route order)

- **Category:** Access Control (IDOR / broken object-level authorization)
- **Affected files:** `src/routes/applicant.routes.ts:152-153`, `src/controllers/applicant.controller.ts:1026-1075`, `src/utils/imageStorage.ts:138-178`
- **Severity:** Medium (latent) · **Exploitability:** None today; High if routes are reordered

---

## Summary

The "protected" file proxy endpoints (`GET /api/v1/applicants/documents/:filename` and `GET /api/v1/applicants/images/:filename`) require only authentication — **no ownership check** — and pass the raw `filename` from `req.params` straight into storage lookup. They are currently **unreachable** because the admin-only route `GET /:applicantId` is registered earlier and shadows them. This is fragile: any route reorder turns these into a full IDOR exposing every applicant's CoR/CV/Student-ID image, plus local path traversal in development.

---

## Evidence

`src/routes/applicant.routes.ts` (registration order matters):

```ts
router.get("/:applicantId", requireAdminHR, getApplicant);   // line 103 — matches first
...
router.get("/documents/:filename", requireAuth, serveDocument);  // line 152 — shadowed
router.get("/images/:filename", requireAuth, serveImage);        // line 153 — shadowed
```

`src/controllers/applicant.controller.ts:1026-1044`:

```ts
export async function serveDocument(req: Request, res: Response): Promise<void> {
  const { filename } = req.params;
  const { stream, contentType, contentLength } = await getDocumentStream(filename);
  ...
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
  stream.pipe(res);
}
```

`src/utils/imageStorage.ts:138-157`:

```ts
export async function getDocumentStream(filename: string) {
  const localFile = path.join(UPLOADS_DIR, DOCUMENTS_CONTAINER, filename); // dev-local: traversal read
  if (isLocalFallbackAllowed() && fs.existsSync(localFile)) {
    return { stream: fs.createReadStream(localFile), ... };
  }
  const blockBlobClient = containerClient.getBlockBlobClient(filename);   // prod: arbitrary blob fetch
  ...
}
```

---

## Why it is vulnerable

1. **No authorization check** — `requireAuth` only verifies *some* valid session. It never verifies that the requested file belongs to the requesting user (or that the user has any right to it).
2. **No filename sanitization** — `filename` comes verbatim from the URL. In the dev-local fallback, `path.join(UPLOADS_DIR, DOCUMENTS_CONTAINER, filename)` with `filename = ..\..\...` normalizes outside the uploads directory (path traversal read). In production it becomes an arbitrary blob fetch by name.
3. **Route shadowing masks the bug today** — `GET /documents/foo` matches `/:applicantId` first and returns 403 (non-admin) / 404 (admin). The intended feature is dead; any refactor that moves these two routes above `/:applicantId` (e.g., to "fix" the feature) silently activates the IDOR.

---

## Attack scenario

After a route reorder (or if the team "fixes" the 404s by reordering): a member with a valid session enumerates filenames of the form `cor_<timestamp>_<originalname>.pdf` (timestamps + original filenames are predictable, and the create-applicant response echoes them) and downloads other applicants' Certificates of Registration, CVs, and Student-ID images — full PII disclosure.

---

## Severity & Exploitability

| | |
|---|---|
| **Severity** | Medium today (dead route) — **High** if the routes are reordered |
| **Exploitability** | Requires authenticated session + filename guessing; trivial once reachable |

---

## Recommended fix

1. Register the file-proxy routes **before** `/:applicantId`.
2. Resolve ownership: load the caller's applicant record via `where: { userId: req.userId }` and only serve files whose stored path matches the requested filename.
3. Sanitize the filename: reject any value containing `/`, `\`, or `..`; serve via `res.sendFile` with an explicit `root` (dev) or a stored blob-name lookup (prod).
4. Add `X-Content-Type-Options: nosniff` on the response.

## Secure example

```ts
// routes/applicant.routes.ts — order matters
router.get("/documents/:filename", requireAuth, serveDocument);  // BEFORE "/:applicantId"
router.get("/images/:filename", requireAuth, serveImage);        // BEFORE "/:applicantId"

// controllers/applicant.controller.ts
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;   // no path separators, no ".."

export async function serveDocument(req: Request, res: Response): Promise<void> {
  const { filename } = req.params;
  if (!SAFE_FILENAME.test(filename)) {
    res.status(400).json({ success: false, message: "Invalid file name" });
    return;
  }
  const applicant = await prisma.applicant.findUnique({
    where: { userId: (req as any).userId },
    select: { certificateOfRegistration: true, curriculumVitae: true },
  });
  const owned = applicant && [applicant.certificateOfRegistration, applicant.curriculumVitae]
    .some((stored) => stored?.endsWith(filename));
  if (!owned) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  // ... proceed with stream; add: res.setHeader("X-Content-Type-Options", "nosniff");
}
```
