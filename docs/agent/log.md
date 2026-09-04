# Agent work log

Short chronological notes for non-trivial repository changes.

## 2026-09-05 — initial repository bootstrap

- Established the Aura project charter and repository skeleton.
- Added an `AGENTS.md` operating harness distilled from useful patterns in existing h4rm0n1c repositories.
- Added the vision, architecture, threat model, trust boundary, MCP proposal, roadmap, current-state record, and initial ADRs.
- Kept implementation directories as ownership placeholders so framework choices do not outrun contracts.

Reason: Aura's main early risks are authority confusion, prompt injection, credential boundaries, and premature feature sprawl. Those are cheaper to settle before implementation.
