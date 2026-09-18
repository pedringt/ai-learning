-- Product analytics storage is persistent State schema, not request-time DDL.
-- Existing deployments may already have these tables because the first analytics
-- implementation created them lazily. IF NOT EXISTS makes this migration safe for
-- those databases while giving fresh databases one canonical creation path.

CREATE TABLE IF NOT EXISTS product_analytics_events (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    session_id TEXT,
    project_id TEXT,
    environment TEXT,
    build TEXT,
    ref_label TEXT,
    outcome TEXT,
    source_type TEXT,
    duration_ms INTEGER,
    view_name TEXT,
    destination_origin TEXT,
    status_code INTEGER,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_eval_runs (
    id TEXT PRIMARY KEY,
    suite TEXT NOT NULL,
    run_kind TEXT NOT NULL,
    build TEXT,
    provider TEXT,
    model_identifier TEXT,
    total INTEGER NOT NULL,
    precision REAL,
    recall REAL,
    false_positives INTEGER NOT NULL DEFAULT 0,
    false_negatives INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    high_severity_failures INTEGER NOT NULL DEFAULT 0,
    question_usefulness REAL,
    ask_grounding REAL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
