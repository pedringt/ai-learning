-- QA follow-up (2026-09-14): a Review's "create" proposal had no way to
-- carry an intended area, so every newly-accepted Current State fact fell
-- into the generic "general" fallback from migration 012, regardless of
-- project or content -- confirmed live on both Northstar and Juniper.
-- proposed_area_id lets a create proposal name the area the new fact
-- should land in; review_service._apply_proposal validates it against the
-- project's own project_areas before using it (an unrecognized or
-- cross-project id is ignored, falling back to the existing General
-- behavior), so this is safe even for proposals that never set it.
ALTER TABLE proposed_state_changes ADD COLUMN proposed_area_id TEXT;
