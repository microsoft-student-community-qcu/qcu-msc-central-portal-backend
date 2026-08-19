# Documentation Index

Central navigation for the QCU MSC Central Portal documentation.

## Layout

| Folder | Purpose |
|--------|---------|
| [`api/`](api/README.md) | Versioned API documentation — `v1/` (current), `v2/` (planned), versioning + deprecation guidelines |
| [`guides/`](guides/v1/workflows.md) | Versioned workflow guides — `v1/` (shipped behavior), `v2/` (planned behavior) |
| [`modules/`](modules/README.md) | Per-module handoff docs — one self-contained file per V2 module, with assignee/status index |
| [`specs/`](specs/PRD-V1.md) | PRDs (`PRD-V1.md`, `PRD-V2.md`), DTM, data-model docs |

## Quick Links

- **PRD V1** — [`specs/PRD-V1.md`](specs/PRD-V1.md)
- **PRD V2** — [`specs/PRD-V2.md`](specs/PRD-V2.md)
- **V2 modules** — [`modules/v2/`](modules/v2/) (index: [`modules/README.md`](modules/README.md))
- **V2 API placeholder** — [`api/v2/README.md`](api/v2/README.md)
- **Workflow guides** — V1: [`guides/v1/workflows.md`](guides/v1/workflows.md) · V2: [`guides/v2/workflows.md`](guides/v2/workflows.md)
- **Data models** — [`specs/data-models.md`](specs/data-models.md)

## Conventions

- Docs are versioned to match the API (`v1`, `v2`).
- Keep documentation consistent with actual implementation (no outdated docs allowed).
- When a V2 module ships, promote its workflow content into `docs/guides/v2/workflows/`.