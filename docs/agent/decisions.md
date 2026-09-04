# Small agent decisions

Use this file for accepted implementation/design choices that are too small for a numbered ADR but useful to future work.

Promote a decision to `docs/decisions/` when it changes a major boundary, dependency, deployment assumption, security property, or public contract.

## 2026-09-05

- Keep implementation directories coarse during Phase 0.
- Use one documentation index at `docs/README.md` as the browsing entry point.
- Keep chronological work notes, small decisions, and reusable constraints separate (`log.md`, `decisions.md`, `notes.md`).
- Treat the Cloudflare choice as a deployment adapter decision. Do not expose D1/Access-specific concepts through core domain schemas unless necessary.
