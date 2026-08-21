# API Versioning

All public APIs must use explicit versioning in their paths and documentation (for example, `/api/v1/...`).

## Strategy
- Use URL path versioning for major versions (recommended): `/api/v1/...`, `/api/v2/...`.
- Query or header-based versioning may be used for experimental previews only.

## Deprecation & Migration
- Document deprecated endpoints in `/docs/api/` with a clear deprecation date and removal target.
- Provide migration notes and example requests/responses for the replacement endpoint.

## Starting Point
- Current stable API surface is `v1` — **frozen (bugfixes only)**. The live student/admin portals
  depend on it, so V1 endpoints are not removed or changed behaviorally while V2 is developed.
- **The `/api/v2/` namespace is open as of Module 01 (M0).** Every new V2 feature ships under
  `/api/v2/` the moment its module lands, so parallel module branches target a stable version path.
- Breaking changes (role-model expansion, new event types, approval-gated QR) land under `v2`.
- V1 endpoints are deprecated *with a timeline* only when the V2 release replaces them
  (see `docs/api/deprecation-template.md`).

## Versioned Docs
- API reference: `docs/api/v1/` (frozen, current), `docs/api/v2/` (open — V2 features)
- Workflow guides: `docs/guides/v1/` (shipped), `docs/guides/v2/` (built per module)
- Module docs: `docs/modules/v2/`
