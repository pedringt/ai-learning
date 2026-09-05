-- Slack Phase 1: deterministic intake plumbing only.
-- No Evidence, Review, or Question tables are touched here. See
-- docs/architecture/SLACK_INTEGRATION_PLAN.md and the Phase 1 contract.

CREATE TABLE IF NOT EXISTS slack_connections (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    team_id TEXT NOT NULL UNIQUE,
    workspace_name TEXT,
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected')),
    environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_event_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slack_channels (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    team_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
    include_threads INTEGER NOT NULL DEFAULT 1 CHECK (include_threads IN (0,1)),
    include_bots INTEGER NOT NULL DEFAULT 0 CHECK (include_bots IN (0,1)),
    ingestion_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, channel_id)
);

-- Immutable delivery/event receipt log. Never updated after insert; edits and
-- deletes are recorded as new rows referencing the same Slack event history
-- through slack_messages, not by mutating this table.
CREATE TABLE IF NOT EXISTS slack_events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    team_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_ts TEXT NOT NULL,
    thread_root_ts TEXT,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload TEXT NOT NULL,
    disposition TEXT NOT NULL DEFAULT 'pending'
        CHECK (disposition IN ('pending','unapproved_channel','noise','conversation_updated'))
);

CREATE INDEX IF NOT EXISTS idx_slack_events_team_channel ON slack_events(team_id, channel_id);

-- Latest source projection for an individual Slack message. The event log
-- above stays immutable; this table reflects edits/deletes as they arrive.
CREATE TABLE IF NOT EXISTS slack_messages (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_ts TEXT NOT NULL,
    thread_root_ts TEXT NOT NULL,
    user_id TEXT,
    text TEXT NOT NULL DEFAULT '',
    edited_at TIMESTAMP,
    removed_at_source_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, channel_id, message_ts)
);

CREATE INDEX IF NOT EXISTS idx_slack_messages_conversation
    ON slack_messages(team_id, channel_id, thread_root_ts);

-- Stable standalone-message/thread identity and quiet-window state. A
-- conversation is never permanently "finished": any future reply wakes it
-- again, even after weeks of inactivity.
CREATE TABLE IF NOT EXISTS slack_conversations (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    thread_root_ts TEXT NOT NULL,
    last_activity_at TIMESTAMP NOT NULL,
    next_checkpoint_at TIMESTAMP NOT NULL,
    last_checkpointed_message_count INTEGER NOT NULL DEFAULT 0,
    -- NULL means "never checkpointed": every edit/deletion in the
    -- conversation counts toward the first checkpoint's deltas.
    last_checkpointed_at TIMESTAMP,
    latest_checkpoint_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, channel_id, thread_root_ts)
);

CREATE INDEX IF NOT EXISTS idx_slack_conversations_due
    ON slack_conversations(next_checkpoint_at);

-- Immutable deterministic conversation snapshots waiting for later relevance
-- evaluation. Phase 1 never consumes ready_for_relevance automatically.
CREATE TABLE IF NOT EXISTS slack_checkpoints (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES slack_conversations(id),
    version INTEGER NOT NULL,
    previous_checkpoint_id TEXT REFERENCES slack_checkpoints(id),
    included_message_ids TEXT NOT NULL,
    new_reply_count INTEGER NOT NULL DEFAULT 0,
    new_edit_count INTEGER NOT NULL DEFAULT 0,
    new_deletion_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ready_for_relevance'
        CHECK (status IN ('ready_for_relevance')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (conversation_id, version)
);
