# Security Assessment Report

| Field | Details |
|---|---|
| Report Version | 1.0 |
| Assessment Date | 2026-07-28 |
| Scope | Student Frontend - Admin Frontend - Backend API |
| Repositories | `qcu-msc-central-portal-frontend`, `msc-qcu-admin-frontend`, `qcu-msc-central-portal-backend` |
| Classification | CONFIDENTIAL - Internal Use Only |

---

## Executive Summary

| Severity | Count |
|---|---|
| Critical | 5 |
| High | 7 |
| Medium | 10 |
| Low | 4 |
| Informational | 2 |
| **Total** | **28** |

---

## Attack Chain Highlights

| Chain ID | Title | Exploitability |
|---|---|---|
| CHAIN-1 | VUL-A01 + VUL-A02 = Unauthenticated Admin Dashboard Access | Trivial (no credentials needed) |
| CHAIN-2 | VUL-A05 + VUL-A03 = Stored XSS to Admin Token Theft | Easy (applicant submits URL) |
| CHAIN-3 | VUL-004 + VUL-007 = Account Pre-Hijacking | Easy (direct API call) |
| CHAIN-4 | VUL-016 = Instant Privilege Escalation to ADMIN_HR | Trivial (single API request) |
| CHAIN-5 | VUL-010 + VUL-008 = Malicious File Upload to Admin XSS | Moderate |

---

## Vulnerability Index

### Critical Severity

| ID | Title | CVSS v3.1 |
|---|---|---|
| [VUL-016](./critical-severity/VUL-016.md) | Mass Assignment Privilege Escalation on User Sign-Up | 9.8 |
| [VUL-A01](./critical-severity/VUL-A01.md) | Hardcoded Mock Credential Backdoor in Admin Frontend | 9.1 |
| [VUL-004](./critical-severity/VUL-004.md) | Account Pre-Hijacking via Unenforced Setup Token Validation | 8.6 |
| [VUL-A02](./critical-severity/VUL-A02.md) | Missing Route Authentication Guard — Full Admin Auth Bypass | 8.2 |

### High Severity

| ID | Title | CVSS v3.1 |
|---|---|---|
| [VUL-010](./high-severity/VUL-010.md) | Unrestricted File Upload — No Server-Side Content Validation | 8.1 |
| [VUL-A03](./high-severity/VUL-A03.md) | Admin Session Token Stored in XSS-Accessible sessionStorage | 7.5 |
| [VUL-A05](./high-severity/VUL-A05.md) | Stored XSS via Unsanitized User-Controlled URLs in Admin Portal | 7.3 |
| [VUL-A04](./high-severity/VUL-A04.md) | Client-Side ADMIN_LOGISTICS Role Isolation Bypassable | 6.4 |

---

## Repositories

- [qcu-msc-central-portal-frontend](https://github.com/anomalyco/qcu-msc-central-portal-frontend)
- [msc-qcu-admin-frontend](https://github.com/anomalyco/msc-qcu-admin-frontend)
- [qcu-msc-central-portal-backend](https://github.com/anomalyco/qcu-msc-central-portal-backend)
