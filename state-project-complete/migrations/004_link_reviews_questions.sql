CREATE TABLE IF NOT EXISTS review_questions (
    review_id TEXT NOT NULL REFERENCES review_issues(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (review_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_review_questions_question ON review_questions(question_id);
