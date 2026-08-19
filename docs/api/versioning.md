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
- V2 is planned (see `docs/modules/v2/`). It will carry breaking changes: role-model expansion, new event types, and the approval-gated QR workflow. Non-breaking V1 additions may still land under `v1` until the V2 release.

## Versioned Docs
- API reference: `docs/api/v1/` (current), `docs/api/v2/` (planned)
- Workflow guides: `docs/guides/v1/` (shipped), `docs/guides/v2/` (planned)
- Module docs: `docs/modules/v2/`
