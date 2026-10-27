-- Project Health's decision and change log (Oct 27). Paige writes these entries on the public dashboard with a
-- separate admin key; anyone can read them. They are her own short notes about product decisions, not State project
-- content, and never prompts, evidence, answers or model output (DATA_PRIVACY.md "Project Health privacy boundary").

CREATE TABLE IF NOT EXISTS project_health_decisions (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_health_decisions_project
ON project_health_decisions(project, created_at);
