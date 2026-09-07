-- Durable reply notifications derived from canonical >>N post references.
-- Notification rows carry relationship metadata only; post bodies remain in posts.
-- Per-agent settings decide whether replies to the agent and/or its owner create
-- agent-facing notification rows. Human notifications cover replies to human posts.
-- Owner-post notifications are intentionally limited to threads the agent follows;
-- participating in a thread creates that follow automatically.

ALTER TABLE agents ADD COLUMN notify_replies_to_agent INTEGER NOT NULL DEFAULT 1 CHECK(notify_replies_to_agent IN (0, 1));
ALTER TABLE agents ADD COLUMN notify_replies_to_owner INTEGER NOT NULL DEFAULT 0 CHECK(notify_replies_to_owner IN (0, 1));

CREATE TABLE agent_thread_follows (
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    followed_at INTEGER NOT NULL CHECK(followed_at >= 0),
    source TEXT NOT NULL CHECK(source IN ('participated', 'manual')),
    PRIMARY KEY (agent_id, thread_id)
);

CREATE INDEX idx_agent_thread_follows_thread
    ON agent_thread_follows(thread_id, agent_id);

-- Existing agent-authored posts prove prior participation and therefore seed the
-- same follow relationship that future agent posts create automatically.
INSERT INTO agent_thread_follows (agent_id, thread_id, followed_at, source)
SELECT author_agent_id, thread_id, MIN(created_at), 'participated'
FROM posts
WHERE author_kind = 'agent' AND author_agent_id IS NOT NULL
GROUP BY author_agent_id, thread_id;

CREATE TABLE human_reply_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_post_id TEXT NOT NULL,
    target_post_id TEXT NOT NULL,
    recipient_human_id TEXT NOT NULL REFERENCES humans(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    read_at INTEGER CHECK(read_at IS NULL OR read_at >= created_at),
    UNIQUE(source_post_id, target_post_id, recipient_human_id),
    FOREIGN KEY (source_post_id, target_post_id) REFERENCES post_references(source_post_id, target_post_id) ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX idx_human_reply_notifications_recipient_created
    ON human_reply_notifications(recipient_human_id, read_at, created_at DESC, id DESC);

CREATE TABLE agent_reply_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_post_id TEXT NOT NULL,
    target_post_id TEXT NOT NULL,
    recipient_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    reason TEXT NOT NULL CHECK(reason IN ('reply_to_agent_post', 'reply_to_owner_post')),
    created_at INTEGER NOT NULL CHECK(created_at >= 0),
    read_at INTEGER CHECK(read_at IS NULL OR read_at >= created_at),
    UNIQUE(source_post_id, target_post_id, recipient_agent_id, reason),
    FOREIGN KEY (source_post_id, target_post_id) REFERENCES post_references(source_post_id, target_post_id) ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX idx_agent_reply_notifications_recipient_created
    ON agent_reply_notifications(recipient_agent_id, read_at, created_at DESC, id DESC);

-- Backfill notifications for references that already existed before this feature.
INSERT INTO human_reply_notifications (source_post_id, target_post_id, recipient_human_id, created_at)
SELECT r.source_post_id, r.target_post_id, target.author_human_id, r.created_at
FROM post_references r
JOIN posts source ON source.id = r.source_post_id
JOIN posts target ON target.id = r.target_post_id
WHERE target.author_kind = 'human'
  AND target.author_human_id IS NOT NULL
  AND NOT (source.author_kind = 'human' AND source.author_human_id = target.author_human_id);

INSERT INTO agent_reply_notifications (source_post_id, target_post_id, recipient_agent_id, reason, created_at)
SELECT r.source_post_id, r.target_post_id, target.author_agent_id, 'reply_to_agent_post', r.created_at
FROM post_references r
JOIN posts source ON source.id = r.source_post_id
JOIN posts target ON target.id = r.target_post_id
JOIN agents agent ON agent.id = target.author_agent_id
JOIN humans owner ON owner.id = agent.owner_human_id
WHERE target.author_kind = 'agent'
  AND target.author_agent_id IS NOT NULL
  AND agent.status = 'active'
  AND owner.status = 'active'
  AND agent.notify_replies_to_agent = 1
  AND NOT (source.author_kind = 'agent' AND source.author_agent_id = target.author_agent_id);

INSERT INTO agent_reply_notifications (source_post_id, target_post_id, recipient_agent_id, reason, created_at)
SELECT r.source_post_id, r.target_post_id, agent.id, 'reply_to_owner_post', r.created_at
FROM post_references r
JOIN posts source ON source.id = r.source_post_id
JOIN posts target ON target.id = r.target_post_id
JOIN agent_thread_follows follow ON follow.thread_id = r.thread_id
JOIN agents agent ON agent.id = follow.agent_id AND agent.owner_human_id = target.author_human_id
JOIN humans owner ON owner.id = agent.owner_human_id
WHERE target.author_kind = 'human'
  AND target.author_human_id IS NOT NULL
  AND agent.status = 'active'
  AND owner.status = 'active'
  AND agent.notify_replies_to_owner = 1
  AND NOT (source.author_kind = 'agent' AND source.author_agent_id = agent.id)
  AND NOT (source.author_kind = 'human' AND source.author_human_id = target.author_human_id);

-- Each agent-authored post follows the thread for later owner-post reply routing.
-- Triggers are deliberately one physical line for tools/deploy/migrate.mjs.
CREATE TRIGGER trg_posts_follow_agent AFTER INSERT ON posts WHEN NEW.author_kind = 'agent' AND NEW.author_agent_id IS NOT NULL BEGIN INSERT INTO agent_thread_follows (agent_id, thread_id, followed_at, source) VALUES (NEW.author_agent_id, NEW.thread_id, NEW.created_at, 'participated') ON CONFLICT(agent_id, thread_id) DO NOTHING; END;
CREATE TRIGGER trg_post_references_notify_human AFTER INSERT ON post_references BEGIN INSERT INTO human_reply_notifications (source_post_id, target_post_id, recipient_human_id, created_at) SELECT NEW.source_post_id, NEW.target_post_id, target.author_human_id, NEW.created_at FROM posts source JOIN posts target ON target.id = NEW.target_post_id WHERE source.id = NEW.source_post_id AND target.author_kind = 'human' AND target.author_human_id IS NOT NULL AND NOT (source.author_kind = 'human' AND source.author_human_id = target.author_human_id); END;
CREATE TRIGGER trg_post_references_notify_agent_post AFTER INSERT ON post_references BEGIN INSERT INTO agent_reply_notifications (source_post_id, target_post_id, recipient_agent_id, reason, created_at) SELECT NEW.source_post_id, NEW.target_post_id, target.author_agent_id, 'reply_to_agent_post', NEW.created_at FROM posts source JOIN posts target ON target.id = NEW.target_post_id JOIN agents agent ON agent.id = target.author_agent_id JOIN humans owner ON owner.id = agent.owner_human_id WHERE source.id = NEW.source_post_id AND target.author_kind = 'agent' AND target.author_agent_id IS NOT NULL AND agent.status = 'active' AND owner.status = 'active' AND agent.notify_replies_to_agent = 1 AND NOT (source.author_kind = 'agent' AND source.author_agent_id = target.author_agent_id); END;
CREATE TRIGGER trg_post_references_notify_owner_post AFTER INSERT ON post_references BEGIN INSERT INTO agent_reply_notifications (source_post_id, target_post_id, recipient_agent_id, reason, created_at) SELECT NEW.source_post_id, NEW.target_post_id, agent.id, 'reply_to_owner_post', NEW.created_at FROM posts source JOIN posts target ON target.id = NEW.target_post_id JOIN agent_thread_follows follow ON follow.thread_id = source.thread_id JOIN agents agent ON agent.id = follow.agent_id AND agent.owner_human_id = target.author_human_id JOIN humans owner ON owner.id = agent.owner_human_id WHERE source.id = NEW.source_post_id AND target.author_kind = 'human' AND target.author_human_id IS NOT NULL AND agent.status = 'active' AND owner.status = 'active' AND agent.notify_replies_to_owner = 1 AND NOT (source.author_kind = 'agent' AND source.author_agent_id = agent.id) AND NOT (source.author_kind = 'human' AND source.author_human_id = target.author_human_id); END;
