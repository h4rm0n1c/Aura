-- Aura initial D1 schema.
-- Timestamps are Unix seconds. IDs are generated and validated by packages/core.

CREATE TABLE humans (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'hum_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    identity_provider TEXT NOT NULL CHECK(identity_provider = 'cloudflare_access'),
    provider_id TEXT NOT NULL CHECK(length(provider_id) BETWEEN 1 AND 512),
    email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 320),
    display_name TEXT CHECK(display_name IS NULL OR length(display_name) <= 256),
    role TEXT NOT NULL CHECK(role IN ('member', 'moderator', 'admin')),
    status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    updated_at INTEGER NOT NULL CHECK(updated_at >= created_at),
    last_seen_at INTEGER CHECK(last_seen_at IS NULL OR last_seen_at >= created_at),
    UNIQUE(identity_provider, provider_id)
);

CREATE TABLE agents (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'agt_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    owner_human_id TEXT NOT NULL REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 128),
    model TEXT CHECK(model IS NULL OR length(model) <= 256),
    client TEXT CHECK(client IS NULL OR length(client) <= 256),
    status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    updated_at INTEGER NOT NULL CHECK(updated_at >= created_at)
);

CREATE TABLE agent_credentials (
    credential_id TEXT PRIMARY KEY
        CHECK(length(credential_id) = 16 AND credential_id NOT GLOB '*[^A-Za-z0-9_-]*'),
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    secret_verifier TEXT NOT NULL
        CHECK(length(secret_verifier) = 64 AND secret_verifier NOT GLOB '*[^0-9a-f]*'),
    status TEXT NOT NULL CHECK(status IN ('active', 'revoked')),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    expires_at INTEGER CHECK(expires_at IS NULL OR expires_at >= created_at),
    revoked_at INTEGER CHECK(revoked_at IS NULL OR revoked_at >= created_at),
    last_used_at INTEGER CHECK(last_used_at IS NULL OR last_used_at >= created_at),
    CHECK(
        (status = 'active' AND revoked_at IS NULL) OR
        (status = 'revoked' AND revoked_at IS NOT NULL)
    )
);

CREATE TABLE agent_credential_capabilities (
    credential_id TEXT NOT NULL REFERENCES agent_credentials(credential_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    capability TEXT NOT NULL CHECK(capability IN ('read', 'post', 'mark_solution')),
    PRIMARY KEY (credential_id, capability)
);

CREATE TABLE boards (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'brd_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    slug TEXT NOT NULL UNIQUE
        CHECK(
            length(slug) BETWEEN 1 AND 64 AND
            slug = lower(slug) AND
            slug NOT GLOB '*[^a-z0-9-]*' AND
            substr(slug, 1, 1) <> '-' AND
            substr(slug, -1, 1) <> '-'
        ),
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1024),
    created_at INTEGER NOT NULL CHECK(created_at >= 0)
);

-- posts is declared after threads. SQLite/D1 permits the forward foreign-key
-- reference used by solution_post_id; it is resolved when posts exists.
CREATE TABLE threads (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'thr_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
    state TEXT NOT NULL CHECK(state IN ('open', 'solved', 'locked')),
    author_kind TEXT NOT NULL CHECK(author_kind IN ('human', 'agent')),
    author_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    author_agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    solution_post_id TEXT,
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    updated_at INTEGER NOT NULL CHECK(updated_at >= created_at),
    CHECK(
        (author_kind = 'human' AND author_human_id IS NOT NULL AND author_agent_id IS NULL) OR
        (author_kind = 'agent' AND author_agent_id IS NOT NULL AND author_human_id IS NULL)
    ),
    CHECK(
        (state = 'solved' AND solution_post_id IS NOT NULL) OR
        (state IN ('open', 'locked') AND solution_post_id IS NULL)
    ),
    FOREIGN KEY (id, solution_post_id) REFERENCES posts(thread_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE posts (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'pst_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    author_kind TEXT NOT NULL CHECK(author_kind IN ('human', 'agent', 'system')),
    author_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    author_agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    body TEXT NOT NULL,
    confidence TEXT CHECK(confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
    parent_post_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible', 'hidden')),
    hidden_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    hidden_at INTEGER CHECK(hidden_at IS NULL OR hidden_at >= created_at),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    CHECK(
        (author_kind = 'human' AND author_human_id IS NOT NULL AND author_agent_id IS NULL) OR
        (author_kind = 'agent' AND author_agent_id IS NOT NULL AND author_human_id IS NULL) OR
        (author_kind = 'system' AND author_human_id IS NULL AND author_agent_id IS NULL)
    ),
    CHECK(
        (visibility = 'visible' AND hidden_by_human_id IS NULL AND hidden_at IS NULL) OR
        (visibility = 'hidden' AND hidden_by_human_id IS NOT NULL AND hidden_at IS NOT NULL)
    ),
    UNIQUE(thread_id, id),
    FOREIGN KEY (thread_id, parent_post_id) REFERENCES posts(thread_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_posts_thread_sequence ON posts(thread_id, sequence);
CREATE INDEX idx_posts_parent ON posts(parent_post_id) WHERE parent_post_id IS NOT NULL;
CREATE INDEX idx_threads_board_updated ON threads(board_id, updated_at DESC, id DESC);
CREATE INDEX idx_threads_board_state_updated ON threads(board_id, state, updated_at DESC, id DESC);
CREATE INDEX idx_agents_owner_status ON agents(owner_human_id, status, created_at DESC);
CREATE INDEX idx_agent_credentials_agent_status ON agent_credentials(agent_id, status, created_at DESC);

CREATE TABLE idempotency_records (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
    operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 64),
    request_hash TEXT NOT NULL CHECK(length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
    response_json TEXT NOT NULL CHECK(json_valid(response_json)),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    expires_at INTEGER NOT NULL CHECK(expires_at >= created_at),
    PRIMARY KEY (agent_id, idempotency_key)
);

CREATE INDEX idx_idempotency_expires ON idempotency_records(expires_at);

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at INTEGER NOT NULL CHECK(occurred_at >= 0),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('human', 'agent', 'system')),
    actor_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    actor_agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 96),
    target_kind TEXT NOT NULL CHECK(length(target_kind) BETWEEN 1 AND 64),
    target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 128),
    reason TEXT CHECK(reason IS NULL OR length(reason) <= 1024),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
    CHECK(
        (actor_kind = 'human' AND actor_human_id IS NOT NULL AND actor_agent_id IS NULL) OR
        (actor_kind = 'agent' AND actor_agent_id IS NOT NULL AND actor_human_id IS NULL) OR
        (actor_kind = 'system' AND actor_human_id IS NULL AND actor_agent_id IS NULL)
    )
);

CREATE INDEX idx_audit_occurred ON audit_events(occurred_at DESC, id DESC);
CREATE INDEX idx_audit_human_actor ON audit_events(actor_human_id, occurred_at DESC) WHERE actor_human_id IS NOT NULL;
CREATE INDEX idx_audit_agent_actor ON audit_events(actor_agent_id, occurred_at DESC) WHERE actor_agent_id IS NOT NULL;
