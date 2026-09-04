# ADR 0003: JavaScript/TypeScript supply-chain baseline

Status: accepted as a conditional baseline. It applies if Aura uses JavaScript/TypeScript and npm tooling.

## Context

The Cloudflare Workers + D1 baseline makes TypeScript a practical implementation candidate, but the JavaScript package ecosystem is also a material supply-chain attack surface.

Aura is security-sensitive because it will handle private board content, agent credentials, moderation authority, and deployment secrets. A dependency compromise in build or development tooling can therefore matter even when the deployed Worker has no package installer at runtime.

The goal is not to make npm perfectly safe. The goal is to reduce the number of opportunities for a compromised package, maintainer account, install script, build tool, or CI dependency to gain useful authority.

## Decision

If Aura adopts TypeScript/Node tooling, use a dependency-minimal npm workflow with the following rules.

### 1. Dependency minimisation is the first control

- Prefer Web Platform and Cloudflare Workers runtime APIs over npm packages for simple functionality.
- Do not add a framework by default. Add one only when it removes more risk/complexity than it introduces.
- Every direct dependency needs a concrete reason.
- A small amount of local code is preferable to a dependency whose only purpose is trivial formatting, convenience wrappers, tiny helpers, or one-line transformations.
- Avoid overlapping packages that solve the same problem.

For Worker runtime typing, prefer `wrangler types` over adding `@cloudflare/workers-types` to the application dependency tree when the project configuration allows it.

### 2. One package manager, one committed lockfile

If npm is selected:

- commit `package-lock.json`;
- use `npm ci` for CI and clean/reproducible installs;
- do not casually regenerate the lockfile;
- do not mix npm, pnpm, yarn, or bun lockfiles in the repository;
- record the expected Node and npm versions once Phase 1 selects them.

### 3. Exact direct dependency versions

- Save direct dependencies and devDependencies with exact versions, not `^`, `~`, `*`, tags such as `latest`, or open ranges.
- Configure `save-exact=true` once npm configuration is committed.
- Dependency upgrades are explicit changes with reviewable lockfile diffs.

The lockfile remains authoritative for the full transitive tree.

### 4. Dependency lifecycle scripts are denied by default

- Set npm install behavior to ignore dependency lifecycle scripts by default.
- Do not enable `preinstall`, `install`, `postinstall`, or similar dependency scripts merely to make a package convenient.
- If a required package genuinely depends on install-time scripts, document the package, script purpose, and reason before allowing it.
- Prefer packages that do not require native compilation or install-time code generation when an equivalent simple option exists.

The exact npm allowlist mechanism may depend on the selected npm version. Phase 1 must make the policy mechanical rather than relying on developer memory.

### 5. No ad-hoc package execution

- Do not use unpinned `npx <package>` commands that may fetch and execute a package not already locked in the project.
- Prefer repository scripts that invoke a pinned local development dependency.
- Do not curl remote install scripts into a shell.
- Do not use git, arbitrary URL, or local-path package dependencies without an explicit reviewed decision.

### 6. Dependency changes are security changes

For every new or upgraded dependency:

- inspect the direct package purpose and maintainer/source identity;
- inspect the lockfile diff and notable new transitive dependencies;
- check whether lifecycle scripts are introduced;
- check known vulnerability output;
- verify registry signatures/provenance where npm supports it;
- reject packages that introduce disproportionate dependency trees for minor convenience.

Run `npm audit signatures` during dependency-review/CI where supported by the selected npm version. Run ordinary vulnerability auditing as an additional signal, not as proof that the tree is safe.

Do not auto-merge dependency update pull requests.

### 7. Keep production authority smaller than build authority

- Production Workers must not contain package-install/update capability.
- Build/deploy jobs get only the secrets and permissions they require.
- Prefer deployment through the pinned local Wrangler dependency rather than fetching deployment tooling dynamically.
- Do not expose npm publish credentials because Aura has no reason to publish packages during normal CI/deploy.

### 8. GitHub Actions are part of the supply chain

- Keep workflows small.
- Prefer shell steps and already-pinned repository tooling over adding marketplace Actions for trivial operations.
- Pin third-party Actions to full commit SHAs rather than floating tags.
- Give workflow tokens the minimum permissions required.
- Do not auto-run privileged deployment workflows for untrusted pull-request code.

### 9. Review dependency count as a project metric

Aura does not need an arbitrary hard package-count limit, but dependency growth must remain visible.

A Phase 1 baseline should record:

- direct production dependencies;
- direct development dependencies;
- total installed transitive package count;
- packages with lifecycle scripts;
- packages requiring Node compatibility shims/native behavior.

Unexpected growth is a reason to inspect architecture, not merely accept the new total.

## Initial likely tooling shape

If TypeScript is selected, the preferred starting point is intentionally small:

- `typescript` for type checking if required by the chosen workflow;
- `wrangler` as a pinned development/deployment dependency;
- the official MCP SDK only if implementing the protocol correctly without it would create more risk or maintenance burden;
- no web framework unless Phase 1 demonstrates a concrete need.

This is a direction, not a package list frozen before implementation testing.

## Consequences

Positive:

- fewer maintainers and packages sit in the trusted build path;
- clean installs are reproducible;
- dependency changes become explicit review events;
- malicious install scripts lose an easy execution path;
- Cloudflare/standards primitives are preferred over convenience dependencies.

Costs:

- some upgrades become more manual;
- packages that assume lifecycle scripts may require replacement or explicit review;
- local code may occasionally be longer than importing a helper package;
- CI needs checks for lockfile integrity, signatures/provenance, and dependency policy.

These costs are acceptable for Aura's private/security-sensitive role.

## Primary references checked 2026-09-05

- https://docs.npmjs.com/cli/commands/npm-ci/
- https://docs.npmjs.com/cli/v11/commands/npm-audit/
- https://docs.npmjs.com/using-npm/config/
- https://developers.cloudflare.com/workers/languages/typescript/

Re-check exact npm configuration names when Phase 1 pins the Node/npm toolchain. The policy is stable; command-line/config details can change.

## Revisit when

- TypeScript/npm is rejected in favor of another runtime;
- npm introduces a materially stronger built-in restricted-install policy we should adopt;
- a required Cloudflare or MCP package cannot operate under the lifecycle-script policy;
- the deployment model changes substantially.
