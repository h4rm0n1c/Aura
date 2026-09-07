-- Replace the unused single-parent reply model with persisted thread-local
-- >>N reference relationships. There is intentionally no compatibility path:
-- the migration refuses to proceed if any parent_post_id was ever populated.

CREATE TABLE aura_migration_0006_parent_guard (
    value INTEGER NOT NULL CHECK(value = 0)
);

INSERT INTO aura_migration_0006_parent_guard (value)
SELECT 1 FROM posts WHERE parent_post_id IS NOT NULL LIMIT 1;

DROP TABLE aura_migration_0006_parent_guard;

-- Rebuild posts because parent_post_id participates in a self-referencing
-- foreign key and therefore cannot be removed with SQLite DROP COLUMN.
PRAGMA foreign_keys = OFF;

DROP TRIGGER trg_posts_require_edit_metadata;
DROP TRIGGER trg_posts_archive_revision;

CREATE TABLE posts_without_parent (
    id TEXT PRIMARY KEY
        CHECK(length(id) = 26 AND substr(id, 1, 4) = 'pst_' AND substr(id, 5) NOT GLOB '*[^A-Za-z0-9_-]*'),
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    author_kind TEXT NOT NULL CHECK(author_kind IN ('human', 'agent', 'system')),
    author_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    author_agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    body TEXT NOT NULL,
    confidence TEXT CHECK(confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
    visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible', 'hidden')),
    hidden_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    hidden_at INTEGER CHECK(hidden_at IS NULL OR hidden_at >= created_at),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    edited_at INTEGER CHECK(edited_at IS NULL OR edited_at >= created_at),
    edited_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(
        (author_kind = 'human' AND author_human_id IS NOT NULL AND author_agent_id IS NULL) OR
        (author_kind = 'agent' AND author_agent_id IS NOT NULL AND author_human_id IS NULL) OR
        (author_kind = 'system' AND author_human_id IS NULL AND author_agent_id IS NULL)
    ),
    CHECK(
        (visibility = 'visible' AND hidden_by_human_id IS NULL AND hidden_at IS NULL) OR
        (visibility = 'hidden' AND hidden_by_human_id IS NOT NULL AND hidden_at IS NOT NULL)
    ),
    UNIQUE(thread_id, id)
);

INSERT INTO posts_without_parent (
    id, thread_id, sequence, author_kind, author_human_id, author_agent_id,
    body, confidence, visibility, hidden_by_human_id, hidden_at, created_at,
    edited_at, edited_by_human_id
)
SELECT
    id, thread_id, sequence, author_kind, author_human_id, author_agent_id,
    body, confidence, visibility, hidden_by_human_id, hidden_at, created_at,
    edited_at, edited_by_human_id
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_without_parent RENAME TO posts;

CREATE UNIQUE INDEX idx_posts_thread_sequence ON posts(thread_id, sequence);

CREATE TRIGGER trg_posts_require_edit_metadata BEFORE UPDATE OF body ON posts WHEN OLD.body <> NEW.body AND (NEW.edited_at IS NULL OR NEW.edited_by_human_id IS NULL) BEGIN SELECT RAISE(ABORT, 'post edit metadata required'); END;
CREATE TRIGGER trg_posts_archive_revision AFTER UPDATE OF body ON posts WHEN OLD.body <> NEW.body BEGIN INSERT INTO post_revisions (post_id, revision, body, replaced_at, replaced_by_human_id) VALUES (OLD.id, COALESCE((SELECT MAX(revision) + 1 FROM post_revisions WHERE post_id = OLD.id), 1), OLD.body, NEW.edited_at, NEW.edited_by_human_id); END;

CREATE TABLE post_references (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    source_post_id TEXT NOT NULL,
    target_post_id TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    PRIMARY KEY (source_post_id, target_post_id),
    FOREIGN KEY (thread_id, source_post_id) REFERENCES posts(thread_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
    FOREIGN KEY (thread_id, target_post_id) REFERENCES posts(thread_id, id) ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX idx_post_references_target
    ON post_references(target_post_id, created_at, source_post_id);
CREATE INDEX idx_post_references_thread_source
    ON post_references(thread_id, source_post_id, target_post_id);

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
