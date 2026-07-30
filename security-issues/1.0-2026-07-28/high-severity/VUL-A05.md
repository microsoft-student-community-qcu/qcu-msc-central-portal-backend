# \[VUL-A05\] Stored XSS via Unsanitized User-Controlled URLs in Admin Portal

| Attribute | Details |
|---|---|
| Severity | High |
| CVSS v3.1 Score | 7.3 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:L/A:N`) |
| CVSS v4.0 Score | 7.0 (`CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:P/VC:H/VI:L/VA:N/SC:H/SI:L/SA:N`) |
| Vulnerability Class | OWASP A03:2021 – Injection (XSS) · CWE-79: Improper Neutralization of Input During Web Page Generation |
| Affected Endpoint | `GET /_admin/applications` (Admin Portal) |
| Source Location | `msc-qcu-admin-frontend/src/features/hr/applicants/components/ApplicantDetails.tsx` (Lines 234–296) |

## 1. Vulnerability Description

Three user-submitted URL fields (`portfolioUrl`, `githubUrl`, `facebookUrl`) are rendered directly in `<a href={...}>` anchor tags with no validation or sanitization. The HTML `href` attribute accepts `javascript:` URIs which execute JavaScript when clicked. Backend validation does not enforce an `https://` scheme constraint.

## 2. Business & Technical Impact

**Technical Impact:** Stored XSS triggered on admin interaction. Executes in `ADMIN_HR` context. Combined with VUL-A03, enables full token exfiltration.

**Business Impact:** Unauthenticated applicant can compromise all admin reviewers who view their application.

## 3. Proof of Concept (PoC)

**Step 1:** Submit application with malicious portfolio URL:

```
POST /api/v1/applicants HTTP/1.1
Content-Disposition: form-data; name="portfolio"

javascript:alert('XSS-'+document.domain)
```

**Step 2:** Admin HR opens the applicant's details and clicks "Portfolio Link".

**Expected Result:** `alert()` fires in admin context, confirming JavaScript execution.

## 4. Remediation & Guidance

**Root Cause Fix:** Enforce `https://` scheme on backend (Zod) and sanitize on frontend:

```typescript
// Backend
portfolio: z.string().url().startsWith("https://").optional()

// Frontend
const isSafeUrl = (url: string) => /^https:\/\//i.test(url);
{ isSafeUrl(applicant.portfolioUrl) && <a href={applicant.portfolioUrl}>...</a> }
```

**References:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html) — [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
