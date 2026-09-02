CREATE TABLE IF NOT EXISTS draft_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled note',
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_notes_updated ON draft_notes(updated_at);
