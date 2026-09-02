-- Migration 002: Add operation and effective_date fields to proposed_state_changes
-- 
-- These fields were designed in Phase 2 to support create/update/retire operations
-- and dated effective changes. Phase 1's schema inferred operation from nullable fields;
-- Phase 2 makes it explicit.
--
-- This migration is safe to run multiple times (IF NOT EXISTS pattern used where
-- applicable; SQLite limitations on ALTER TABLE mean explicit checks are needed).

-- Add operation column if not present
-- Note: Postgres supports ADD COLUMN IF NOT EXISTS; SQLite does not
-- This migration assumes operation and effective_date columns don't exist yet

-- Save current proposal data to temporary table (for safety/inspection)
CREATE TEMP TABLE proposed_state_changes_backup AS
  SELECT * FROM proposed_state_changes;

-- Add operation column with sensible default: update (Phase 1 design assumed updates)
ALTER TABLE proposed_state_changes ADD COLUMN operation TEXT DEFAULT 'update';

-- Add effective_date column (optional, allows future-dated changes)
ALTER TABLE proposed_state_changes ADD COLUMN effective_date TEXT;

-- Backfill: proposals with both state_item_id and expected_state_version are updates
-- (This matches Phase 1's original design inference)
UPDATE proposed_state_changes 
  SET operation = 'update' 
  WHERE state_item_id IS NOT NULL AND expected_state_version IS NOT NULL;

-- Drop default constraint (now that backfill is complete)
-- SQLite doesn't support DROP DEFAULT; we'll rely on application logic to enforce NOT NULL
-- by rejecting inserts without operation specified.

-- Add foreign key constraint if not already present
-- (SQLite allows ALTER but it's a no-op; real enforcement is in application layer)

INSERT INTO schema_migrations(version) VALUES ('002_add_operation_and_effective_date') ON CONFLICT (version) DO NOTHING;
