# F-18 — Logging of PII and Raw Error Objects

- **Category:** Logging & Error Handling
- **Affected files:** `src/services/email.service.ts:14-20`, all controllers (`console.error("Failed to ...", error)`), `src/config/env.ts:59-61`
- **Severity:** Low · **Exploitability:** Indirect (log/observability compromise)

---

## Summary

Recipient email addresses are logged at info level on every send, raw error objects (which can embed DB connection details) are logged in every controller, and env validation failures dump the whole schema-shaped object.

---

## Evidence

`src/services/email.service.ts:14-20`:

```ts
function logSent(type: string, to: string): void {
  console.log(`[EMAIL] ${type} sent to ${to}`);   // recipient email → application logs
}
function logFailed(type: string, to: string, err: unknown): void {
  console.error(`[EMAIL] Failed to send ${type} to ${to}:`, err);
}
```

Controllers (representative — pattern is everywhere):

```ts
console.error("Failed to create applicant:", error);
```

`src/config/env.ts:59-61`:

```ts
if (!parsedEnv.success) {
  console.error("Invalid environment variables:", JSON.stringify(parsedEnv.error.format(), null, 2));
}
```

---

## Why it is vulnerable

- Logs go to Azure Application Insights / console — anyone with log access sees applicant/attendee email addresses (personal data; also relevant to privacy regulations).
- Raw `error` objects may include Prisma/MySQL messages embedding hostnames, database names, and query fragments.
- The env dump lists which variables failed validation (informational for attackers probing configuration).

---

## Attack scenario

A compromised log pipeline (or over-permissioned log viewer) harvests email addresses for phishing; an attacker who can trigger errors reads DB connection details from stack traces.

---

## Recommended fix

```ts
// email.service.ts — redact the recipient in info logs
function logSent(type: string, to: string): void {
  const [user, domain] = to.split("@");
  const redacted = `${user?.[0]}***@${domain ?? "(unknown)"}`;
  console.log(`[EMAIL] ${type} sent to ${redacted}`);
}

// controllers — log error class/code instead of full objects
console.error("Failed to create applicant:", (error as any)?.code ?? error?.constructor?.name);

// env.ts — do not dump the formatted error; log only the failed keys
const failedKeys = Object.keys(parsedEnv.error.flatten().fieldErrors);
console.error(`Invalid environment variables: ${failedKeys.join(", ")}`);
```
