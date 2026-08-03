# \[VUL-A01\] Hardcoded Mock Credential Backdoor in Admin Frontend

| Attribute | Details |
|---|---|
| Severity | Critical |
| CVSS v3.1 Score | 9.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| CVSS v4.0 Score | 8.7 (`CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:L/SI:L/SA:N`) |
| Vulnerability Class | OWASP A07:2021 – Identification and Authentication Failures · CWE-798: Use of Hard-coded Credentials |
| Affected Endpoint | `/login` (Admin Portal) — Parameter: `email`, `password` |
| Source Location | `msc-qcu-admin-frontend/src/features/auth/hooks/useLoginForm.ts` (Lines 73–91) — `src/mocks/accounts.ts` |

## 1. Vulnerability Description

The admin login form implements a fallback authentication path activated whenever the backend API throws any error. The catch block checks credentials against a hardcoded dictionary (`mockAccounts`) with static password `"password123"`. This fallback: (1) ships in the production JavaScript bundle, (2) grants access without a server-side session, (3) is triggered by any network failure, CORS issue, rate limit, or misconfigured `VITE_API_URL`.

```typescript
} catch (err: any) {
  const account = mockAccounts[email.trim().toLowerCase()];
  if (account && password === "password123") {
    // ← static backdoor
    sessionStorage.setItem("currentUser", JSON.stringify(account));
    navigate({ to: "/dashboard" });
  }
}
```

Hardcoded accounts:
- `hr@qcu.edu.ph` / `password123` → `ADMIN_HR`
- `logistics@qcu.edu.ph` / `password123` → `ADMIN_LOGISTICS`

## 2. Business & Technical Impact

**Technical Impact:** Unauthenticated access to the admin UI under any backend disruption. Attacker gains a fully rendered `ADMIN_HR` session with no server-side token.

**Business Impact:** A permanent, unchangeable credential is embedded in public JavaScript source code extractable by anyone who inspects the production bundle.

## 3. Proof of Concept (PoC)

**Step 1:** In Chrome DevTools → Network tab, right-click the backend API domain → Block request domain.

**Step 2:** Navigate to `https://admin.msc-qcu.tech/login`.

**Step 3:** Enter `hr@qcu.edu.ph` / `password123` → Click "Sign in".

**Expected Result:** Immediate redirect to `/dashboard` with `ADMIN_HR` role. DevTools → Application → Session Storage confirms `currentUser` is set with no `accessToken` (no server contact made).

## 4. Remediation & Guidance

**Root Cause Fix:** Delete `src/mocks/accounts.ts`. Remove the mock fallback from `useLoginForm.ts`. The catch block must only display the error.

```typescript
} catch (err: any) {
  setError(err.message || "Invalid email or password.");
}
```

**Short-Term Workaround:** None viable — credentials are static and cannot be rotated without a code change and redeploy.

**References:** [CWE-798](https://cwe.mitre.org/data/definitions/798.html) — [OWASP Default Credentials](https://owasp.org/www-community/attacks/Default_Credentials/)
