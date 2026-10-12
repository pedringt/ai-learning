-- #136: a project area's identity is (project_id, id), not a global id.
--
-- project_areas.id was a global PRIMARY KEY (migration 012) and current_state_items.area_id referenced
-- it, so two projects could not both define an area called 'budget'. This migration makes the key
-- (project_id, id) and the reference (project_id, area_id). Area ids, API payloads and every existing
-- area assignment stay the same; only the key changes. The key swap itself is Python
-- (project_area_scope_migration.py), run by initialize_db right after this file, because SQLite has to
-- rebuild both tables and Postgres has to look up the constraint names.
--
-- First, clear any area reference that does not point at an area of the fact's OWN project (another
-- project's area, or an area that no longer exists). The new reference would reject such a row. Every
-- read already joins areas on the fact's own project, so such a fact was already shown with the
-- generic General name; with the stale id cleared it also lands in the General group. Expected to
-- touch no rows: every write path already validates the area against the fact's project.
UPDATE current_state_items SET area_id = NULL
WHERE area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_areas a
    WHERE a.id = current_state_items.area_id AND a.project_id = current_state_items.project_id
  );
