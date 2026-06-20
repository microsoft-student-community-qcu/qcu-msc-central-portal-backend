# API Deprecation Notice Template

Use this template to document deprecated endpoints.

**Endpoint:** `/api/v1/old-endpoint`

**Deprecated:** 2026-07-01

**Removal Target:** v2.0 (estimated 2026-10-01)

**Reason:** Explain why the endpoint is deprecated.

**Replacement:** `/api/v1/new-endpoint`

**Migration Notes:**
- Map fields from old → new
- Example request (old):

```json
{
  "oldField": "value"
}
```

**Example request (new):**

```json
{
  "newField": "value"
}
```

**Notes:** Additional compatibility or temporary guidance.
