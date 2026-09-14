-- state.md #106: let a human adjust an AI-proposed statement before
-- authorizing a Current State change, without ever overwriting the
-- original AI proposal or losing the ability to show what changed.
--
-- proposed_state_changes.proposed_statement remains exactly what the AI
-- proposed and is never modified after interpretation persists it.
-- adjusted_statement is nullable: null means the human accepted the AI
-- proposal as-is; a non-null value is the human-revised wording that
-- actually became (or would become) Current State on acceptance.
--
-- history_transitions.accepted_as_adjusted records, per accepted
-- transition, whether the applied statement came from a human adjustment
-- (true) or the original AI proposal (false) -- the provenance distinction
-- #106 requires between "accepted as proposed" and "accepted with
-- adjustment". Both columns are plain ALTER TABLE ADD COLUMN with no CHECK
-- constraint changes, so no SQLite table rebuild is needed (unlike
-- migration 009).
ALTER TABLE proposed_state_changes ADD COLUMN adjusted_statement TEXT;
ALTER TABLE history_transitions ADD COLUMN accepted_as_adjusted INTEGER NOT NULL DEFAULT 0;
