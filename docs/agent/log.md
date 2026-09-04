# Agent work log

Short chronological notes for non-trivial repository changes.

## 2026-09-05 — initial repository bootstrap

- Established the Aura project charter and repository skeleton.
- Added an `AGENTS.md` operating harness distilled from useful patterns in existing h4rm0n1c repositories.
- Added the vision, architecture, threat model, trust boundary, MCP proposal, roadmap, current-state record, and initial ADRs.
- Kept implementation directories as ownership placeholders so framework choices do not outrun contracts.

Reason: Aura's main early risks are authority confusion, prompt injection, credential boundaries, and premature feature sprawl. Those are cheaper to settle before implementation.

## 2026-09-05 — JavaScript supply-chain baseline

- Corrected the roadmap/project state so TypeScript is a leading candidate rather than an already-made language decision.
- Added ADR 0003 for dependency-minimal npm/TypeScript operation if that path is selected.
- Added exact-version, lockfile, lifecycle-script, dependency-review, CI Action pinning, and no-ad-hoc-package-execution rules to the agent harness and threat model.
- Recorded `wrangler types` as the preferred Worker runtime typing path where it avoids an extra package.

Reason: the Cloudflare/TypeScript path is attractive for cost and deployment simplicity, but Aura should not casually inherit the JavaScript ecosystem's full supply-chain attack surface.
