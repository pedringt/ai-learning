-- Keep every controlled eval run in one analytics table.
-- PR #207 originally used product_quality_eval_runs so the quality work could land
-- without changing the earlier analytics schema. This migration folds those rows
-- into product_eval_runs and adds the quality-specific aggregate metrics there.

ALTER TABLE product_eval_runs ADD COLUMN interpretation_accuracy REAL;
ALTER TABLE product_eval_runs ADD COLUMN uncertainty_accuracy REAL;
ALTER TABLE product_eval_runs ADD COLUMN open_item_accuracy REAL;
ALTER TABLE product_eval_runs ADD COLUMN authority_accuracy REAL;
ALTER TABLE product_eval_runs ADD COLUMN overall_pass_rate REAL;

-- Compatibility bridge for deployments that already received PR #207's
-- request-time table creation. Fresh databases create this empty table only long
-- enough for the same migration path, then remove it.
CREATE TABLE IF NOT EXISTS product_quality_eval_runs (
    id TEXT PRIMARY KEY,
    suite TEXT NOT NULL,
    run_kind TEXT NOT NULL,
    build TEXT,
    provider TEXT,
    model_identifier TEXT,
    total INTEGER NOT NULL,
    errors INTEGER NOT NULL DEFAULT 0,
    high_severity_failures INTEGER NOT NULL DEFAULT 0,
    precision REAL,
    recall REAL,
    false_positives INTEGER NOT NULL DEFAULT 0,
    false_negatives INTEGER NOT NULL DEFAULT 0,
    interpretation_accuracy REAL,
    ask_grounding REAL,
    uncertainty_accuracy REAL,
    open_item_accuracy REAL,
    authority_accuracy REAL,
    overall_pass_rate REAL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO product_eval_runs (
    id, suite, run_kind, build, provider, model_identifier, total,
    precision, recall, false_positives, false_negatives, errors,
    high_severity_failures, question_usefulness, ask_grounding,
    interpretation_accuracy, uncertainty_accuracy, open_item_accuracy,
    authority_accuracy, overall_pass_rate, created_at
)
SELECT
    id, suite, run_kind, build, provider, model_identifier, total,
    precision, recall, false_positives, false_negatives, errors,
    high_severity_failures, NULL, ask_grounding,
    interpretation_accuracy, uncertainty_accuracy, open_item_accuracy,
    authority_accuracy, overall_pass_rate, created_at
FROM product_quality_eval_runs;

DROP TABLE IF EXISTS product_quality_eval_runs;
