import { spawnSync } from "node:child_process";

const tests = [
  "packages/core/test/auth.test.ts",
  "packages/core/test/csrf.test.ts",
  "packages/core/test/domain.test.ts",
  "packages/core/test/authorization.test.ts",
  "packages/core/test/mcp-schemas.test.ts",
  "apps/web/test/access.test.ts",
  "apps/web/test/invites.test.ts",
  "apps/web/test/agents.test.ts",
  "apps/web/test/admin.test.ts",
  "apps/web/test/boards.test.ts",
  "apps/web/test/forum.test.ts",
  "apps/web/test/runtime.test.ts",
  "apps/web/test/presentation.test.ts",
  "apps/mcp/test/bearer.test.ts",
  "apps/mcp/test/http-security.test.ts",
  "apps/mcp/test/edge-limits.test.ts",
  "apps/mcp/test/read-repository.test.ts",
  "apps/mcp/test/credential-store.test.ts",
  "db/test/migrations.test.ts",
  "db/test/unbound-invites.test.ts",
  "db/test/admin-invariants.test.ts",
  "db/test/identity-lifecycle.test.ts",
  "db/test/board-thread-lifecycle.test.ts",
];

const [major, minor] = process.versions.node.split(".").map(Number);
const needsStripFlag = major === 22 && minor < 18;
const args = [
  ...(needsStripFlag ? ["--experimental-strip-types"] : []),
  "--test",
  ...tests,
];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
