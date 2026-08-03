# \[VUL-A04\] Client-Side ADMIN_LOGISTICS Role Isolation Bypassable

| Attribute | Details |
|---|---|
| Severity | High |
| CVSS v3.1 Score | 6.4 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`) |
| CVSS v4.0 Score | 6.1 (`CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N`) |
| Vulnerability Class | OWASP A01:2021 – Broken Access Control · CWE-284: Improper Access Control |
| Affected Endpoint | `GET /_admin/applications`, `GET /_admin/members` |
| Source Location | `msc-qcu-admin-frontend/src/components/shared/sidebar.tsx` (Lines 88–95) |

## 1. Vulnerability Description

`ADMIN_LOGISTICS` role isolation is enforced only via sidebar menu filtering. Routes perform no role check. Direct URL navigation bypasses the restriction. SessionStorage role tampering upgrades the effective client-side role to `ADMIN_HR`.

## 2. Business & Technical Impact

**Technical Impact:** `ADMIN_LOGISTICS` accesses applicant UI; sessionStorage tampering provides `ADMIN_HR` rendering.

**Business Impact:** Principle of least privilege violated. Defense-in-depth compromised.

## 3. Proof of Concept (PoC)

**Method 1:** Log in as `ADMIN_LOGISTICS`. Navigate to `/applications`. Page renders.

**Method 2:** DevTools → Session Storage → change `role` to `"ADMIN_HR"` → refresh. All nav items appear.

## 4. Remediation & Guidance

**Root Cause Fix:** Add server-side `beforeLoad` role validation to restricted routes.

```typescript
export const Route = createFileRoute("/_admin/applications")({
  beforeLoad: async () => {
    const res = await fetch(`${getApiBaseURL()}/users/me`, { credentials: "include" });
    const data = await res.json();
    if (data.role !== "ADMIN_HR") throw redirect({ to: "/dashboard" });
  },
});
```

**References:** [CWE-284](https://cwe.mitre.org/data/definitions/284.html)
