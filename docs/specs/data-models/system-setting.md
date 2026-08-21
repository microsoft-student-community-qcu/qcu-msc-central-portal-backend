# Data Model — SystemSetting

## Overview

Global system toggles that govern subsystem availability across the entire portal
(e.g. event registration windows, merch shop, maintenance mode). Managed by SUPERADMIN
through `PATCH /api/v2/admin/settings`; every change is written to the audit log.

## Prisma Definition

```prisma
model SystemSetting {
  id          String   @id @default(uuid())
  key         String   @unique // Whitelisted key, e.g. events_registration_open
  value       Json // Boolean state of the toggle (JSON so future types are possible)
  description String?
  updatedById String? // User id of the last editor (no FK — survives user deletion)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([updatedAt])
}
```

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | String (UUID) | Yes | Primary key |
| `key` | String | Yes, unique | Whitelisted toggle key |
| `value` | Json | Yes | Boolean state of the toggle |
| `description` | String? | No | Human-readable purpose |
| `updatedById` | String? | No | User id of last editor (no FK — survives user deletion) |
| `createdAt` | DateTime | Yes | Auto-generated |
| `updatedAt` | DateTime | Yes | Auto-managed |

## Keys (whitelist)

| Key | Default | Meaning |
|-----|---------|---------|
| `events_registration_open` | `true` | Whether event registrations are open across the portal |
| `merch_shop_open` | `false` | Whether the merch pre-order shop is open |
| `maintenance_mode` | `false` | Whether the entire portal is in maintenance mode |

The whitelist is a shared constant in `src/config/settings.ts` — later modules extend it when
they ship their own toggles (e.g. Module 07 adds a DataCamp scholarship setting).

## Related

- API: [`PATCH /api/v2/admin/settings`](../../api/v2/admin.md#4-update-system-settings)
- Audit: [`audit-log.md`](audit-log.md) — every update emits a `SETTING_UPDATE` entry