-- Preserve raw post source across human edits.
-- posts.body remains the canonical current Markdown source; rendered HTML is
-- derived at request time and is never stored.

ALTER TABLE posts ADD COLUMN edited_at INTEGER
    CHECK(edited_at IS NULL OR edited_at >= created_at);

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
