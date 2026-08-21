# Data Model — AuditLog

## Overview

Append-only, tamper-evident audit trail of administrative actions (role changes, system toggle
updates, maintenance toggles, and — from later modules — event/merch/showcase/scholarship
mutations). Viewed by SUPERADMIN through `GET /api/v2/admin/audit-logs`.

**Tamper-evidence:** every row is chained to the previous row with an HMAC-SHA256 hash:
`hash = HMAC(prevHash | actorId | action | entityType | entityId | JSON(details) | createdAt, BETTER_AUTH_SECRET)`.
The viewer recomputes the chain on read and reports `integrityOk` + the first `breakIndex` if a row
was modified. No update/delete paths exist anywhere in the app.

## Prisma Definition

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  actorId    String? // User id who performed the action (null = system)
  action     String // e.g. ROLE_CHANGE, SETTING_UPDATE, SYSTEM_MAINTENANCE
  entityType String // e.g. "USER", "SYSTEM_SETTING"
  entityId   String?
  details    Json? // Action-specific payload (never contains secrets)
  ipAddress  String?
  prevHash   String? // Hash of the previous log row (hash chain linkage)
  hash       String // HMAC-SHA256 of this row's canonical payload
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([actorId])
  @@index([action])
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `actorId` | String? | No | User id who performed the action (null = system); no FK so rows survive user deletion |
| `action` | String | Yes | `ROLE_CHANGE`, `SETTING_UPDATE`, `SYSTEM_MAINTENANCE` (+ more from later modules) |
| `entityType` | String | Yes | e.g. `USER`, `SYSTEM_SETTING` |
| `entityId` | String? | No | Id of the affected entity |
| `details` | Json? | No | Action-specific payload; never contains secrets |
| `ipAddress` | String? | No | Best-effort request IP |
| `prevHash` | String? | No | Hash of the previous row (null for the first row) |
| `hash` | String | Yes | HMAC-SHA256 of this row's canonical payload |
| `createdAt` | DateTime | Yes | Auto-generated |

## Related

- API: [`GET /api/v2/admin/audit-logs`](../../api/v2/admin.md#5-audit-logs-viewer)
- Settings: [`system-setting.md`](system-setting.md)