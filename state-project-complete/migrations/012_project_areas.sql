-- state.md #113: Current State's top-level organization ("areas") must come
-- from project data, not from keyword classifiers/IDs hardcoded in view
-- JavaScript. project_areas is the project-defined taxonomy (name,
-- description, display order); current_state_items.area_id is the explicit,
-- deterministic assignment of one fact to one area -- looked up by equality,
-- never guessed from statement text.
--
-- 'general' is the one guaranteed fallback area every project gets for
-- free, used whenever an item has no area_id (a pre-migration item, or a
-- new fact accepted with no area chosen). It is deliberately generic --
-- never a domain-specific label like "product" -- so an uncategorized fact
-- never silently implies a category that may not apply to this project.
-- A project's own real areas (e.g. Northstar's, in seed_demo.py) are project
-- data, not schema, and are seeded there instead of here.
CREATE TABLE IF NOT EXISTS project_areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO project_areas(id, name, description, sort_order)
VALUES ('general', 'General', 'Reviewed facts that do not yet belong to a more specific part of the project.', 999);

ALTER TABLE current_state_items ADD COLUMN area_id TEXT REFERENCES project_areas(id);
