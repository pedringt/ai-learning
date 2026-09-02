CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','stopped')),
    blocking INTEGER NOT NULL DEFAULT 0 CHECK (blocking IN (0,1)),
    blocks TEXT,
    origin TEXT NOT NULL DEFAULT 'Added from Workspace',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution TEXT,
    source_evidence_id TEXT REFERENCES evidence(id)
);

CREATE INDEX IF NOT EXISTS idx_questions_status_created ON questions(status, created_at);
