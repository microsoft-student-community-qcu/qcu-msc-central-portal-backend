# F-05 — Setup Tokens Returned in HTTP Responses; OCR Re-Scan Mints Fresh Tokens

- **Category:** Authentication / Session Management (account pre-hijacking surface)
- **Affected files:** `src/controllers/applicant.controller.ts:213-214`, `src/controllers/ocr.controller.ts:36-59`
- **Severity:** Medium · **Exploitability:** Requires physical ID card + knowledge of the victim's email

---

## Summary

The setup token — the sole credential that authorizes account creation (`src/app.ts:142-157`) — is returned in HTTP response bodies and, worse, minted fresh for **unauthenticated** OCR re-scans of an existing student ID.

---

## Evidence

`src/controllers/applicant.controller.ts:210-217` — token in the 201 response:

```ts
res.status(201).json({
  success: true,
  data: { id: applicant.id, setupToken, ... },
  message: "Application submitted successfully",
});
```

`src/controllers/ocr.controller.ts:36-57` — unauthenticated re-scan returns a fresh token for the **existing** applicant:

```ts
if (existingApplicant) {
  if (existingApplicant.userId) { ... "already exists" ... }
  else {
    const setupToken = await signSetupToken(existingApplicant.id, existingApplicant.email);
    res.status(200).json({ success: true, data: { alreadySubmitted: true, setupToken }, ... });
  }
}
```

---

## Why it is vulnerable

- Tokens in response bodies are exposed to proxy logs, browser extensions, network inspection, and Sentry/breadcrumb capture — and over `http` in development, to MITM.
- The OCR branch hands a fresh account-creation token to an **unauthenticated** caller. An attacker holding a victim's physical ID (lost/stolen card) who also knows the victim's email can complete the victim's password setup and take over the account before the victim acts (account pre-hijacking).

---

## Attack scenario

1. Attacker finds a lost QCU student ID card.
2. Attacker uploads a photo to `POST /api/v1/ocr/verify` → response contains a valid `setupToken` for the victim's existing applicant record.
3. Attacker submits `POST /api/auth/sign-up/email` with the victim's email + attacker-chosen password + the token → account created under the attacker's control.

---

## Recommended fix

1. **Never** return tokens in response bodies — always deliver by email (the `resendSetupLink` path at `applicant.controller.ts:709-744` is the correct pattern).
2. In `verifyOcr`, mirror `resendSetupLink`: send the token to the applicant's registered email only; return `{ alreadySubmitted: true }` without a token.
3. Consider binding the setup token to the browser fingerprint or requiring the email address in the request for re-scan flows.

## Secure example

```ts
// ocr.controller.ts — re-scan branch
if (existingApplicant) {
  if (existingApplicant.userId) { /* 400 already exists */ }
  else {
    const setupToken = await signSetupToken(existingApplicant.id, existingApplicant.email);
    await sendSetupLinkEmail(existingApplicant.email, setupToken);  // email-only delivery
    res.status(200).json({
      success: true,
      data: { alreadySubmitted: true, setupToken: null },
      message: "You have already submitted an application. Check your email for the setup link.",
    });
  }
}
```
