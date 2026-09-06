-- Preserve raw post source across human edits.
-- posts.body remains the canonical current Markdown source; rendered HTML is
-- derived at request time and is never stored.

ALTER TABLE posts ADD COLUMN edited_at INTEGER
    CHECK(edited_at IS NULL OR edited_at >= created_at);

ALTER TABLE posts ADD COLUMN edited_by_human_id TEXT
    REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE post_revisions (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    body TEXT NOT NULL,
    replaced_at INTEGER NOT NULL CHECK(replaced_at >= 0),
    replaced_by_human_id TEXT NOT NULL REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    PRIMARY KEY (post_id, revision)
);

CREATE INDEX idx_post_revisions_post_desc
    ON post_revisions(post_id, revision DESC);

-- A body mutation without explicit trusted editor metadata is invalid. Keep
-- trigger definitions on one physical line for D1 SQL-import compatibility.
CREATE TRIGGER trg_posts_require_edit_metadata BEFORE UPDATE OF body ON posts WHEN OLD.body <> NEW.body AND (NEW.edited_at IS NULL OR NEW.edited_by_human_id IS NULL) BEGIN SELECT RAISE(ABORT, 'post edit metadata required'); END;

-- Archive the exact prior raw source in the same SQLite write transaction as
-- the post update. Revision numbering is per post and append-only.
CREATE TRIGGER trg_posts_archive_revision AFTER UPDATE OF body ON posts WHEN OLD.body <> NEW.body BEGIN INSERT INTO post_revisions (post_id, revision, body, replaced_at, replaced_by_human_id) VALUES (OLD.id, COALESCE((SELECT MAX(revision) + 1 FROM post_revisions WHERE post_id = OLD.id), 1), OLD.body, NEW.edited_at, NEW.edited_by_human_id); END;
