-- Issue #155: Baseline Setup is an explicit lifecycle for user-created projects.
-- Existing user-created projects are treated as already established when this
-- migration lands; newly-created project_* rows have NULL until the person
-- explicitly finishes baseline setup.
ALTER TABLE projects ADD COLUMN baseline_completed_at TIMESTAMP;
-- substr() is supported by both SQLite and PostgreSQL and avoids a literal %
-- pattern, which psycopg2 would otherwise interpret as parameter syntax.
UPDATE projects SET baseline_completed_at = CURRENT_TIMESTAMP WHERE substr(id, 1, 8) = 'project_';

-- Optional organizational hints from the baseline interpretation model.
-- They remain proposals only. A project area is created only inside the
-- human-authorized Review acceptance flow.
ALTER TABLE proposed_state_changes ADD COLUMN proposed_area_name TEXT;
ALTER TABLE proposed_state_changes ADD COLUMN proposed_topic TEXT;

-- Coarse structural coverage for a large source interpreted in bounded chunks.
-- This is not a semantic omission oracle; it only surfaces chunks that produced
-- no Review so the person can decide whether another look is warranted.
CREATE TABLE IF NOT EXISTS baseline_evidence_coverage (
    evidence_id TEXT PRIMARY KEY REFERENCES evidence(id),
    chunk_count INTEGER NOT NULL DEFAULT 1,
    represented_chunks INTEGER NOT NULL DEFAULT 0,
    unrepresented_chunks INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
