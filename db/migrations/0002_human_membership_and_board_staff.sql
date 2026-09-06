-- Phase 4 human membership and board-administration foundation.
-- 0001 is already deployed and must remain immutable.

ALTER TABLE boards ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'archived'));

ALTER TABLE boards ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
    CHECK(sort_order >= 0);

CREATE TABLE human_invites (
    invite_id TEXT PRIMARY KEY
        CHECK(length(invite_id) = 16 AND invite_id NOT GLOB '*[^A-Za-z0-9_-]*'),
    secret_verifier TEXT NOT NULL
        CHECK(length(secret_verifier) = 64 AND secret_verifier NOT GLOB '*[^0-9a-f]*'),
    email TEXT NOT NULL
        CHECK(length(email) BETWEEN 3 AND 320 AND email = lower(email)),
    kind TEXT NOT NULL CHECK(kind IN ('member', 'bootstrap_admin')),
    initial_role TEXT NOT NULL CHECK(initial_role IN ('member', 'admin')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked')),
    created_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
    accepted_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    accepted_at INTEGER CHECK(accepted_at IS NULL OR accepted_at >= created_at),
    revoked_by_human_id TEXT REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    revoked_at INTEGER CHECK(revoked_at IS NULL OR revoked_at >= created_at),
    CHECK(
        (kind = 'member' AND initial_role = 'member' AND created_by_human_id IS NOT NULL) OR
        (kind = 'bootstrap_admin' AND initial_role = 'admin' AND created_by_human_id IS NULL)
    ),
    CHECK(
        (status = 'pending' AND accepted_by_human_id IS NULL AND accepted_at IS NULL AND revoked_at IS NULL) OR
        (status = 'accepted' AND accepted_by_human_id IS NOT NULL AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR
        (status = 'revoked' AND accepted_by_human_id IS NULL AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    )
);

CREATE INDEX idx_human_invites_email_status
    ON human_invites(email, status, expires_at);

CREATE INDEX idx_human_invites_expires
    ON human_invites(status, expires_at);

CREATE UNIQUE INDEX idx_human_invites_pending_bootstrap
    ON human_invites(kind)
    WHERE kind = 'bootstrap_admin' AND status = 'pending';

-- A bootstrap-admin invitation is a one-time empty-instance escape hatch.
-- Keep trigger definitions on one physical line: remote D1's SQL-file parser has
-- historically returned "incomplete input" for multiline CREATE TRIGGER bodies.
CREATE TRIGGER trg_human_invites_bootstrap_empty BEFORE INSERT ON human_invites WHEN NEW.kind = 'bootstrap_admin' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM humans) THEN RAISE(ABORT, 'bootstrap_admin_requires_empty_instance') END; END;

-- Never permit a role/status mutation to remove the final active site admin.
CREATE TRIGGER trg_humans_keep_last_active_admin_update BEFORE UPDATE OF role, status ON humans WHEN OLD.role = 'admin' AND OLD.status = 'active' AND (NEW.role <> 'admin' OR NEW.status <> 'active') BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM humans WHERE id <> OLD.id AND role = 'admin' AND status = 'active') THEN RAISE(ABORT, 'last_active_admin_required') END; END;

CREATE TRIGGER trg_humans_keep_last_active_admin_delete BEFORE DELETE ON humans WHEN OLD.role = 'admin' AND OLD.status = 'active' BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM humans WHERE id <> OLD.id AND role = 'admin' AND status = 'active') THEN RAISE(ABORT, 'last_active_admin_required') END; END;

CREATE TABLE board_staff (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    human_id TEXT NOT NULL REFERENCES humans(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    role TEXT NOT NULL CHECK(role IN ('moderator', 'manager')),
    granted_by_human_id TEXT NOT NULL REFERENCES humans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    PRIMARY KEY (board_id, human_id)
);

CREATE INDEX idx_board_staff_human
    ON board_staff(human_id, role, board_id);
