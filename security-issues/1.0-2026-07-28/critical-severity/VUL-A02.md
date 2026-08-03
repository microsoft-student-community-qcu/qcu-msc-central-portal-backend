# \[VUL-A02\] Missing Route Authentication Guard — Full Admin Auth Bypass

| Attribute | Details |
|---|---|
| Severity | Critical |
| CVSS v3.1 Score | 8.2 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`) |
| CVSS v4.0 Score | 8.0 (`CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N`) |
| Vulnerability Class | OWASP A01:2021 – Broken Access Control · CWE-306: Missing Authentication for Critical Function |
| Affected Endpoint | `/dashboard`, `/applications`, `/members`, `/events/list` (Admin Portal) |
| Source Location | `msc-qcu-admin-frontend/src/routes/_admin.tsx` · `src/routes/__root.tsx` |

## 1. Vulnerability Description

The `/_admin` layout route — parent of all protected admin pages — performs no authentication check. Any unauthenticated user navigating directly to `/dashboard` or `/applications` receives a fully rendered admin shell (API calls return 401 so data is blank, but the UI shell is fully visible).

## 2. Business & Technical Impact

**Technical Impact:** Full admin UI accessible without authentication. Combined with VUL-A01, complete functional access with no server interaction.

**Business Impact:** Admin portal cannot be considered access-controlled by any security standard.

## 3. Proof of Concept (PoC)

**Step 1:** Open an incognito window (no session data).

**Step 2:** Navigate to `https://admin.msc-qcu.tech/applications`.

**Expected Result:** Admin sidebar, header, and layout render fully. No redirect to `/login`. Session Storage is empty.

This is still a critical vulnerability because this can be used as the start of the attack chain of the attacker, especially those good ones (I just can't reproduce an escalated POC because I'm still a beginner, and I am sure that someone out there can).

## 4. Remediation & Guidance

**Root Cause Fix:** Add server-validated `beforeLoad` guard to `_admin.tsx`:

```typescript
export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ location }) => {
    const res = await fetch(`${getApiBaseURL()}/users/me`, { credentials: "include" });
    if (!res.ok) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: AdminRoute,
});
```

**References:** [CWE-306](https://cwe.mitre.org/data/definitions/306.html) — [OWASP A01:2021](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
