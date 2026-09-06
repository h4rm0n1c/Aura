-- Per-board live-thread capacity and internal thread archive.
-- Thread discussion state (open/solved/locked) remains orthogonal to whether a
-- thread is still listed on its board.

ALTER TABLE boards ADD COLUMN max_threads INTEGER NOT NULL DEFAULT 100
    CHECK(max_threads BETWEEN 1 AND 10000);

ALTER TABLE threads ADD COLUMN listing_state TEXT NOT NULL DEFAULT 'live'
    CHECK(listing_state IN ('live', 'archived'));

ALTER TABLE threads ADD COLUMN archived_at INTEGER
    CHECK(
        (listing_state = 'live' AND archived_at IS NULL) OR
        (listing_state = 'archived' AND archived_at IS NOT NULL AND archived_at >= created_at)
    );

CREATE INDEX idx_threads_board_listing_updated
    ON threads(board_id, listing_state, updated_at DESC, created_at DESC, id DESC);

CREATE INDEX idx_threads_board_archive
    ON threads(board_id, listing_state, archived_at DESC, id DESC);

-- If a pre-migration board already exceeds the new default capacity, preserve
-- the most recently active threads and place the remainder in its archive.
WITH ranked AS (
    SELECT
        t.id,
        t.updated_at,
        ROW_NUMBER() OVER (
            PARTITION BY t.board_id
            ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
        ) AS live_rank,
        b.max_threads
    FROM threads t
    JOIN boards b ON b.id = t.board_id
)
UPDATE threads
SET listing_state = 'archived', archived_at = updated_at
WHERE id IN (SELECT id FROM ranked WHERE live_rank > max_threads);

-- Creating a thread pushes every live thread below the board's configured
-- capacity into the read-only archive. Keep trigger definitions on one
-- physical line for the same D1 SQL-import compatibility reason as 0002.
CREATE TRIGGER trg_threads_enforce_board_max AFTER INSERT ON threads BEGIN UPDATE threads SET listing_state = 'archived', archived_at = NEW.created_at WHERE board_id = NEW.board_id AND listing_state = 'live' AND id IN (SELECT id FROM threads WHERE board_id = NEW.board_id AND listing_state = 'live' ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT -1 OFFSET (SELECT max_threads FROM boards WHERE id = NEW.board_id)); END;

-- Lowering max_threads takes effect immediately. Raising it never resurrects
-- already archived threads; archives are durable history rather than overflow
-- storage waiting to reappear on the live board.
CREATE TRIGGER trg_boards_enforce_max_threads AFTER UPDATE OF max_threads ON boards BEGIN UPDATE threads SET listing_state = 'archived', archived_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER)) WHERE board_id = NEW.id AND listing_state = 'live' AND id IN (SELECT id FROM threads WHERE board_id = NEW.id AND listing_state = 'live' ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT -1 OFFSET NEW.max_threads); END;