-- DEC-025 (Nov 15): Project Health's investigation records, shared by every visitor instead of kept per browser. A
-- record is created by the server only for a real problem (a verified deployment or release-check failure, or a State
-- eval run with failures) and holds the project, a problem key, what triggered it, evidence source names and a one-line
-- summary written by the server. Paige records the outcome with the decision-log key. No prompts, evidence bodies,
-- State project content or full reports (DATA_PRIVACY.md "Project Health privacy boundary").

CREATE TABLE IF NOT EXISTS project_health_investigations (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    trigger_label TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    outcome TEXT,
    outcome_note TEXT,
    outcome_at TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_health_investigations_project
ON project_health_investigations(project, created_at);
