-- Allow normal member invitations to be bearer links with no pre-bound email.
-- Existing email-bound invitations remain unchanged. A NULL email means that the
-- first authenticated Cloudflare identity presenting the valid one-time token may
-- accept it; bootstrap-admin invitations remain email-bound.

CREATE TABLE human_invites_v3 (
    invite_id TEXT PRIMARY KEY
        CHECK(length(invite_id) = 16 AND invite_id NOT GLOB '*[^A-Za-z0-9_-]*'),
    secret_verifier TEXT NOT NULL
        CHECK(length(secret_verifier) = 64 AND secret_verifier NOT GLOB '*[^0-9a-f]*'),
    email TEXT
        CHECK(email IS NULL OR (length(email) BETWEEN 3 AND 320 AND email = lower(email))),
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
        (kind = 'bootstrap_admin' AND initial_role = 'admin' AND created_by_human_id IS NULL AND email IS NOT NULL)
    ),
    CHECK(
        (status = 'pending' AND accepted_by_human_id IS NULL AND accepted_at IS NULL AND revoked_at IS NULL) OR
        (status = 'accepted' AND accepted_by_human_id IS NOT NULL AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR
        (status = 'revoked' AND accepted_by_human_id IS NULL AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    )
);

INSERT INTO human_invites_v3
    (invite_id, secret_verifier, email, kind, initial_role, status,
     created_by_human_id, created_at, expires_at,
     accepted_by_human_id, accepted_at, revoked_by_human_id, revoked_at)
SELECT
    invite_id, secret_verifier, email, kind, initial_role, status,
    created_by_human_id, created_at, expires_at,
    accepted_by_human_id, accepted_at, revoked_by_human_id, revoked_at
FROM human_invites;

DROP TABLE human_invites;
ALTER TABLE human_invites_v3 RENAME TO human_invites;

CREATE INDEX idx_human_invites_email_status
    ON human_invites(email, status, expires_at);

CREATE INDEX idx_human_invites_expires
    ON human_invites(status, expires_at);

CREATE UNIQUE INDEX idx_human_invites_pending_bootstrap
    ON human_invites(kind)
    WHERE kind = 'bootstrap_admin' AND status = 'pending';

CREATE TRIGGER trg_human_invites_bootstrap_empty BEFORE INSERT ON human_invites WHEN NEW.kind = 'bootstrap_admin' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM humans) THEN RAISE(ABORT, 'bootstrap_admin_requires_empty_instance') END; END;
