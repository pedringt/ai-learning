-- Metadata-only model call telemetry for product-level AI operations monitoring.
-- Never store prompts, evidence, answers, or generated content here.

CREATE TABLE IF NOT EXISTS model_call_metrics (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    operation TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_identifier TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_call_metrics_occurred_at
ON model_call_metrics(occurred_at);

CREATE INDEX IF NOT EXISTS idx_model_call_metrics_project
ON model_call_metrics(project_id, occurred_at);
