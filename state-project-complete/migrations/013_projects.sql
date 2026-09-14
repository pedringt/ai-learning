-- state.md #114: prove State's product model is project-agnostic by adding
-- a second, contrasting seeded project (a non-software office move) and
-- real data isolation between it and Northstar.
--
-- projects is the project registry; active_project is a single-row pointer
-- to "which project the app is currently showing" (this is a single-
-- instance demo app with no auth/multi-user concurrency, so a global
-- pointer -- not a per-request/per-user setting -- is the right amount of
-- mechanism; see api.py's get_connection()).
--
-- Every content table gets a project_id column, NOT NULL DEFAULT
-- 'northstar' so every existing row (and every existing test that never
-- mentions a project) keeps meaning exactly what it meant before this
-- migration. Dependent tables (history_transitions, proposed_state_changes,
-- review_evidence, review_state_items, review_questions, proposed_questions,
-- interpretation_records) are deliberately NOT given their own project_id --
-- they're scoped transitively through their parent row's project_id, the
-- same way they're already scoped through their parent's existence.
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO projects(id, name) VALUES ('northstar', 'Northstar');

CREATE TABLE IF NOT EXISTS active_project (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    project_id TEXT NOT NULL REFERENCES projects(id)
);
INSERT OR IGNORE INTO active_project(id, project_id) VALUES (1, 'northstar');

-- SQLite rejects ADD COLUMN combining REFERENCES with a non-null DEFAULT, so
-- project_id isn't FK-declared here (same tradeoff already made for other
-- app-layer-enforced references in this schema, e.g. evidence immutability).
ALTER TABLE current_state_items ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE review_issues ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE questions ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE evidence ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE project_rules ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE project_areas ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';
ALTER TABLE draft_notes ADD COLUMN project_id TEXT NOT NULL DEFAULT 'northstar';

-- #113's "General" fallback area never needed to be a stored row -- it's a
-- universal, non-project-specific concept ("this fact has no category
-- yet"), not project data. Simplify before it would otherwise need a
-- duplicate per-project row: drop the stored row; review_service.py's
-- list_state() computes the fallback as a literal instead.
DELETE FROM project_areas WHERE id='general';
