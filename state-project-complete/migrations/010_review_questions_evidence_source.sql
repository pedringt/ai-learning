-- review_questions previously recorded only (review_id, question_id), with no
-- way to know which specific Evidence's interpretation established that a
-- given Question was resolved. resolve_review() fell back to "the most
-- recently submitted Evidence linked to the whole Review" (via review_evidence),
-- which can be a different, unrelated Evidence item if one was linked later
-- with no bearing on this Question (e.g. a manually-linked adversarial
-- relationship, same pattern as seed_demo.py's demo-review-retention/
-- ask-evidence-vendor-retention link). Nullable: existing rows have no
-- recorded source and resolve_review() falls back to the prior behavior for them.
ALTER TABLE review_questions ADD COLUMN evidence_id TEXT REFERENCES evidence(id);
