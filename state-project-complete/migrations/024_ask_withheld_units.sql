-- #662 (Paige, Nov 14): statements Ask's checks left out of an answer, kept 90 days for review (ask_withheld_log.py).
-- An approved exception in docs/product/DATA_PRIVACY.md: the statement and the question are stored, each cut to 300
-- characters. No page reads this table.

CREATE TABLE IF NOT EXISTS ask_withheld_units (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    build TEXT,
    unit TEXT NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT,
    basis TEXT,
    record_id TEXT,
    statement_text TEXT,
    question_text TEXT,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ask_withheld_units_occurred_at
ON ask_withheld_units(occurred_at);
