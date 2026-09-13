-- The migration runner widens Review type/outcome constraints first on both
-- databases. Pending suggestions are not Questions and cannot enter Ask as one.
CREATE TABLE proposed_questions (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES review_issues(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0 AND length(text) <= 500),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'not_applied', 'superseded')),
    resulting_question_id TEXT REFERENCES questions(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP
);
CREATE UNIQUE INDEX uq_pending_question_proposal
    ON proposed_questions(review_id) WHERE status='pending';
