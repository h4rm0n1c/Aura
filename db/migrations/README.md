# Database migrations

Versioned schema migrations will live here once the Phase 2 schema is accepted.

Rules:

- migrations are ordered and immutable after deployment;
- schema changes require corresponding contract/docs updates;
- add indexes for planned query paths rather than relying on full scans;
- do not put secrets or private fixture content in migrations;
- local/dev seed data belongs elsewhere and must be synthetic.

Current status: no schema has been frozen.
