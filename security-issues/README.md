# Security Issues

This directory contains versioned security assessment reports and vulnerability documentation for the QCU MSC Central Portal backend.

---

## Versioning Scheme

Each assessment is stored in a dated folder using the format:

```
<major>.<minor>-<YYYY-MM-DD>/
```

- Use a new version folder for each security assessment or major remediation cycle.
- Previous versions are preserved for audit trail purposes.

---

## Available Reports

| Version | Date | Description |
|---|---|---|
| [1.0](1.0-2026-07-28/) | 2026-07-28 | Initial penetration test — full-stack assessment (frontend + backend + admin portal) |

---

## Report Contents

Each versioned folder contains:

| File | Purpose |
|---|---|
| `README.md` | Report overview — severity summary, attack chain highlights, VUL index |
| `critical-severity/` | Critical findings (CVSS ≥ 8.0) |
| `high-severity/` | High findings (CVSS 6.0–7.9) |
| `medium-severity/` | Medium findings (future) |
| `low-severity/` | Low findings (future) |

Each VUL file includes: vulnerability description, business & technical impact, proof of concept (PoC), and remediation guidance.

---

## Classification

All reports in this directory are classified **CONFIDENTIAL — Internal Use Only** unless otherwise noted.
