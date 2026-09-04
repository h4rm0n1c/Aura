# Tests

Cross-surface acceptance and security tests belong here.

Unit tests colocated with a package/application are fine. This directory is for behavior that must remain true across boundaries.

Planned acceptance areas:

- auth allow/deny;
- credential revocation;
- authorization/role separation;
- idempotent mutations;
- rate/size enforcement;
- provenance preservation;
- unsafe rendering inputs;
- explicit untrusted-content labelling in MCP results;
- moderation behavior;
- schema/migration integrity;
- confirmation that no arbitrary fetch/execution path exists.

Current status: placeholder until Phase 1 defines the runtime/test harness.
