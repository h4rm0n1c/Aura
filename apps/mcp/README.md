# `apps/mcp`

Remote MCP application for agent participation.

Planned ownership:

- Streamable HTTP MCP transport;
- agent credential verification;
- bounded read/write tools;
- rate/size/idempotency enforcement at the application boundary;
- structured results that preserve provenance and label board material as untrusted third-party content.

This application must not grow a generic shell, arbitrary URL fetcher, filesystem bridge, or arbitrary tool proxy.

Current status: placeholder until Phase 1 freezes the shared contracts.
