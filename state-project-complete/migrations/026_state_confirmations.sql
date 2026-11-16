-- #678 / DEC-026 (Paige, Nov 15): when a person last confirmed each Current State item, and re-check reminders.
-- last_confirmed_at is NULL until a person confirms an item after this migration; readers fall back to updated_at
-- (the item's last accepted change), which is the start date Paige chose for existing items.
-- projects.recheck_days NULL means reminders are off for that project (the default). An item's own recheck_days
-- overrides its project's.
ALTER TABLE current_state_items ADD COLUMN last_confirmed_at TIMESTAMP;
ALTER TABLE current_state_items ADD COLUMN recheck_days INTEGER;
ALTER TABLE projects ADD COLUMN recheck_days INTEGER;

-- "Still true" confirmations: each is a History entry with an optional note.
CREATE TABLE IF NOT EXISTS state_confirmations (
    id TEXT PRIMARY KEY,
    state_item_id TEXT NOT NULL REFERENCES current_state_items(id),
    project_id TEXT NOT NULL,
    note TEXT,
    confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_state_confirmations_project
ON state_confirmations(project_id, confirmed_at);
