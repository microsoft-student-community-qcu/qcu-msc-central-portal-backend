# Admin API (V2) — Super Admin Settings Hub

> **Module 01 (M0)** — ships with the V2 namespace. All endpoints are **SUPERADMIN-only**
> and mounted after the authentication middleware (`/api/v2/admin/*`).

## Overview

The V2 admin surface is the foundation for role management, global system toggles, and a
tamper-evident audit viewer. SUPERADMIN is the only role that may call these endpoints.

**Role inheritance:** SUPERADMIN automatically passes every `require*` guard in the system
(PRD-V2 Global NFR). These endpoints additionally require the explicit `SUPERADMIN` role.

**Response contract:** follows the standard format — `{ success, data?, message? }` on success,
`{ success, message }` for simple errors, and `{ success, message: "Validation error", errors }`
for field-level Zod validation errors.

---

## 1. List / Search Users

**Method:** `GET`  
**Path:** `/api/v2/admin/users`

**Authentication:** Required — `SUPERADMIN`

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string? | Free-text search across email, full name, first/last name, and student ID |
| `role` | string? | Filter by role (`APPLICANT`, `MEMBER`, `ADMIN_HR`, `ADMIN_LOGISTICS`, `SUPERADMIN`, `ADMIN_FINANCE`, `ADMIN_FINANCE_HEAD`, `ADMIN_LOGISTICS_HEAD`, `STARTUP_DEV`) |
| `page` | int? | Page number (default `1`) |
| `pageSize` | int? | Rows per page (default `10`, max `50`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "juan@gmail.com",
        "firstName": "Juan",
        "lastName": "Dela Cruz",
        "middleInitial": "M",
        "name": "Juan M. Dela Cruz",
        "studentId": "23-1234",
        "role": "MEMBER",
        "image": null,
        "emailVerified": true,
        "createdAt": "2026-06-15T10:30:00Z",
        "updatedAt": "2026-06-15T10:30:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 }
  }
}
```

**Errors:** `400` invalid role filter · `401` unauthenticated · `403` non-SUPERADMIN · `500` internal

**Security:** responses expose **safe fields only** — passwords, sessions, and internal fields are never selected.

---

## 2. Update User Role

**Method:** `PATCH`  
**Path:** `/api/v2/admin/users/:userId/role`

**Authentication:** Required — `SUPERADMIN`  
**Rate limit:** 20 requests/minute per IP

**Request Body:**
```json
{ "role": "ADMIN_HR" }
```

Any system role is assignable: `APPLICANT`, `MEMBER`, `ADMIN_HR`, `ADMIN_LOGISTICS`, `SUPERADMIN`, `ADMIN_FINANCE`, `ADMIN_FINANCE_HEAD`, `ADMIN_LOGISTICS_HEAD`, `STARTUP_DEV`.

**Success Response (200):**
```json
{
  "success": true,
  "data": { "id": "...", "email": "juan@gmail.com", "role": "ADMIN_HR" },
  "message": "User role updated successfully"
}
```

**Audit:** every role change writes a `ROLE_CHANGE` AuditLog entry (`actorId`, old → new role, IP).

**Edge cases (all enforced server-side):**

| Case | Status | Message |
|------|--------|---------|
| Target user does not exist | `404` | `User not found` |
| Invalid role value | `400` | Validation error with `errors.role` |
| **Self-demotion** — SUPERADMIN changing their own role away from SUPERADMIN | `403` | `You cannot change your own role. Another SUPERADMIN must perform this action.` |
| **Last-superadmin** — demoting the only remaining SUPERADMIN | `403` | `Cannot demote the last SUPERADMIN. Promote another user first.` |

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v2/admin/users/550e8400-e29b-41d4-a716-446655440000/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <superadmin-token>" \
  -d '{ "role": "ADMIN_HR" }'
```

---

## 3. Get System Settings

**Method:** `GET`  
**Path:** `/api/v2/admin/settings`

**Authentication:** Required — `SUPERADMIN`

Returns all global toggles with their descriptions and last editor.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "settings": [
      {
        "key": "events_registration_open",
        "value": true,
        "description": "Whether event registrations are open across the portal",
        "updatedById": "550e8400-e29b-41d4-a716-446655440000",
        "updatedAt": "2026-08-19T10:30:00Z"
      }
    ]
  }
}
```

---

## 4. Update System Settings

**Method:** `PATCH`  
**Path:** `/api/v2/admin/settings`

**Authentication:** Required — `SUPERADMIN`  
**Rate limit:** 20 requests/minute per IP

**Request Body:** a partial object mapping **whitelisted keys** to boolean values.

```json
{ "merch_shop_open": true }
```

**Allowed keys (whitelist):**

| Key | Meaning |
|-----|---------|
| `events_registration_open` | Whether event registrations are open |
| `merch_shop_open` | Whether the merch pre-order shop is open |
| `maintenance_mode` | Whether the entire portal is in maintenance mode |

Unknown keys are rejected with a field-level error (`errors.<key>`), so the whitelist cannot be
bypassed. Values must be booleans.

**Success Response (200):**
```json
{
  "success": true,
  "data": { "settings": [ { "key": "merch_shop_open", "value": true, "description": "...", "updatedById": "...", "updatedAt": "..." } ] },
  "message": "Settings updated successfully"
}
```

**Validation Error Response (400) — unknown key:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": { "bogus_key": ["Unknown setting key: bogus_key"] }
}
```

**Audit:** every update writes a `SETTING_UPDATE` entry; toggling `maintenance_mode` additionally
writes a `SYSTEM_MAINTENANCE` entry.

---

## 5. Audit Logs (Viewer)

**Method:** `GET`  
**Path:** `/api/v2/admin/audit-logs`

**Authentication:** Required — `SUPERADMIN`

Read-only viewer for the tamper-evident audit trail of administrative actions.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `action` | string? | Filter by action (`ROLE_CHANGE`, `SETTING_UPDATE`, `SYSTEM_MAINTENANCE`) |
| `actorId` | string? | Filter by actor user id |
| `from` | date? | Inclusive lower bound (`YYYY-MM-DD` or ISO timestamp) |
| `to` | date? | Inclusive upper bound |
| `page` | int? | Page number (default `1`) |
| `pageSize` | int? | Rows per page (default `10`, max `100`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "actorId": "550e8400-e29b-41d4-a716-446655440000",
        "action": "ROLE_CHANGE",
        "entityType": "USER",
        "entityId": "550e8400-e29b-41d4-a716-446655440002",
        "details": { "from": "MEMBER", "to": "ADMIN_HR" },
        "ipAddress": "127.0.0.1",
        "prevHash": "abc123...",
        "hash": "def456...",
        "createdAt": "2026-08-19T10:30:00Z"
      }
    ],
    "integrity": { "integrityOk": true, "total": 1, "breakIndex": null },
    "pagination": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 }
  }
}
```

**Tamper-evidence:** rows are append-only and chained via HMAC-SHA256 (`prevHash` → `hash`).
`integrity.integrityOk` reports whether the chain verifies end-to-end; `breakIndex` points at the
first row that breaks the chain if tampering is detected. `details` never contains secrets.

**Errors:** `400` invalid `from`/`to` date · `401` unauthenticated · `403` non-SUPERADMIN · `500` internal

---

## Related Docs

- Data models: [`user.md`](../../specs/data-models/user.md), [`system-setting.md`](../../specs/data-models/system-setting.md), [`audit-log.md`](../../specs/data-models/audit-log.md)
- RBAC guide: [`docs/guides/v2/workflows/rbac.md`](../../guides/v2/workflows/rbac.md)
- Module doc: [`docs/modules/v2/01-superadmin-settings-hub.md`](../../modules/v2/01-superadmin-settings-hub.md)