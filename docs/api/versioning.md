# API Versioning

All public APIs must use explicit versioning in their paths and documentation (for example, `/api/v1/...`).

## Strategy
- Use URL path versioning for major versions (recommended): `/api/v1/...`, `/api/v2/...`.
- Query or header-based versioning may be used for experimental previews only.

## Deprecation & Migration
- Document deprecated endpoints in `/docs/api/` with a clear deprecation date and removal target.
- Provide migration notes and example requests/responses for the replacement endpoint.

## Starting Point
- Current API surface is `v1`.
