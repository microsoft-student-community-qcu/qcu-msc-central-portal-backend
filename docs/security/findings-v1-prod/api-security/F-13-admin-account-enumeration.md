# F-13 — Admin-Account Enumeration via Student Sign-In Endpoint

- **Category:** API Security (user enumeration)
- **Affected file:** `src/app.ts:350-356`
- **Severity:** Low · **Exploitability:** Direct

---

## Summary

The student-portal sign-in endpoint returns a **distinct** 403 message for admin accounts, while wrong credentials return 401 — letting attackers confirm which email addresses belong to admins.

---

## Evidence

```ts
if (user && (user.role === "ADMIN_HR" || user.role === "ADMIN_LOGISTICS")) {
  res.status(403).json({
    success: false,
    message: "Admin accounts cannot sign in through the Student Portal. Please use the Admin Portal.",
  });
  return;
}
// ... else: Better Auth returns 401 "Invalid email or password"
```

(The admin endpoint `src/app.ts:464-470` already returns one generic message for both cases — good.)

---

## Why it is vulnerable

The differing response allows an unauthenticated attacker to test candidate emails and determine which ones are admin accounts — enabling targeted phishing/credential-stuffing against high-value targets.

---

## Attack scenario

Attacker runs a list of employee/student emails through the student sign-in endpoint; every email returning the 403 "Admin accounts cannot sign in" message is flagged as an admin target for phishing.

---

## Recommended fix

Return the same response for both cases:

```ts
if (!user || user.role === "ADMIN_HR" || user.role === "ADMIN_LOGISTICS") {
  res.status(401).json({
    success: false,
    message: "Invalid email or password",
  });
  return;
}
```
