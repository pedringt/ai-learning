-- Migration 007: Slack Phase 2 -- relevance evaluation + evidence provenance.
--
-- Additive only (ALTER TABLE ... ADD COLUMN), matching the project's existing
-- migration style, so this works unchanged on both SQLite and Postgres and
-- never touches the slack_checkpoints.status CHECK constraint.

-- Generic source provenance for Evidence. Not Slack-specific: any source_type
-- can populate these. The frontend (context-provenance.js) already reads
-- source_name/source_url when present on an Evidence item; before this
-- migration nothing in the backend ever set them.
ALTER TABLE evidence ADD COLUMN source_name TEXT;
ALTER TABLE evidence ADD COLUMN source_url TEXT;

-- Records the outcome of relevance-evaluating a checkpoint. A separate
-- append-only table rather than columns on slack_checkpoints itself: that
-- table has a hard "immutable once created" trigger (block every UPDATE),
-- so evaluation state has to live elsewhere. A checkpoint with no row here
-- is still pending -- that's the Phase 2 relevance worker's queue.
-- evidence_id is set only when the checkpoint was judged relevant and
-- Evidence was created from it.
CREATE TABLE IF NOT EXISTS slack_checkpoint_evaluations (
    id TEXT PRIMARY KEY,
    checkpoint_id TEXT NOT NULL UNIQUE REFERENCES slack_checkpoints(id),
    evaluated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    evidence_id TEXT REFERENCES evidence(id)
);
