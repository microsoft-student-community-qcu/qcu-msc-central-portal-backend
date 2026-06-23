# Agent Rules

## Code Style
- Always add comments for non-trivial logic.
- Keep functions small, focused, and reusable.
- Prefer readability over clever or overly compact code.
- Follow existing project structure and naming conventions.
- Avoid duplicating logic; extract reusable utilities instead.

## Code Structure (VERY IMPORTANT)
- Never allow a single file to become too large or hard to navigate.
- If a file grows beyond a reasonable size, split it into modules.
- Each file should have a single responsibility (one feature or concern only).
- Group related logic into folders (e.g., services, controllers, utils, components).
- Move repeated logic into shared utilities instead of copying it.
- Avoid deeply nested logic; refactor into smaller functions or modules.

## Documentation Rules
- Always update `/docs` folder when code changes affect:
  - API behavior
  - data models
  - endpoints
  - workflows
- If a new feature is added, create a corresponding doc file.
- Keep documentation consistent with actual implementation (no outdated docs allowed).

## API Rules
- Every endpoint must be documented in `/docs/api/`.
- Each API doc must include:
  - clear description
  - request parameters
  - response format
  - example request
  - example response
- Avoid undocumented or “hidden” endpoints.

## API Versioning
- All public APIs must use explicit versioning in their paths and documentation (e.g., `/api/v1/...`).
- Versioning strategy: URL path versioning for major versions; query/header versioning may be used for previews where necessary.
- Start with `v1` for the current API surface. New breaking changes must increment the major version (v1 -> v2).
- Deprecation policy: document deprecated endpoints in `/docs/api/` and provide a deprecation timeline and migration notes.
- Maintain backward compatibility within a major version; non-breaking additions may be added under the same major version.

## Git Rules
- Use meaningful and descriptive commit messages.
- Do not commit undocumented breaking changes.
- Keep commits focused on a single logical change (avoid mixed-purpose commits).

## Agent Behavior Rules
- Before writing code, check existing docs and project structure.
- Prefer extending existing modules instead of creating new scattered logic.
- After modifying logic, update all related documentation immediately.
- If unsure whether docs are affected, assume they are and update them.
- When adding new features, design them in a modular way from the start (avoid monolithic files).