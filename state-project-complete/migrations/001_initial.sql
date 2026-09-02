CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    source_type TEXT NOT NULL DEFAULT 'manual_note',
    processing_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processed', 'failed')),
    supersedes_evidence_id TEXT REFERENCES evidence(id),
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Evidence immutability will be enforced at the application layer, not via database trigger
-- (Postgres trigger syntax differs from SQLite and complicates cross-database migrations)

CREATE TABLE IF NOT EXISTS current_state_items (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    statement TEXT NOT NULL CHECK (length(trim(statement)) > 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'retired')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    effective_date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_rules (
    id TEXT PRIMARY KEY,
    statement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'retired')),
    rationale TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retired_at TEXT
);

CREATE TABLE IF NOT EXISTS review_issues (
    id TEXT PRIMARY KEY,
    review_type TEXT NOT NULL
        CHECK (review_type IN ('proposed_update', 'state_at_risk', 'missing_understanding')),
    decision_question TEXT NOT NULL,
    why_consequential TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
    resolution TEXT CHECK (
        resolution IS NULL OR resolution IN (
            'updated', 'partially_applied', 'not_applied',
            'confirmed_current', 'not_needed'
        )
    ),
    resolution_note TEXT,
    prior_review_id TEXT REFERENCES review_issues(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS interpretation_records (
    id TEXT PRIMARY KEY,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    review_id TEXT REFERENCES review_issues(id),
    provider TEXT NOT NULL,
    model_identifier TEXT NOT NULL,
    contract_version TEXT NOT NULL,
    processing_status TEXT NOT NULL
        CHECK (processing_status IN ('succeeded', 'failed')),
    structured_result TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (processing_status = 'succeeded' AND structured_result IS NOT NULL AND error_code IS NULL)
        OR (processing_status = 'failed' AND error_code IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS review_evidence (
    review_id TEXT NOT NULL REFERENCES review_issues(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    PRIMARY KEY (review_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS review_state_items (
    review_id TEXT NOT NULL REFERENCES review_issues(id) ON DELETE CASCADE,
    state_item_id TEXT NOT NULL REFERENCES current_state_items(id),
    PRIMARY KEY (review_id, state_item_id)
);

CREATE TABLE IF NOT EXISTS proposed_state_changes (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES review_issues(id),
    state_item_id TEXT REFERENCES current_state_items(id),
    proposed_statement TEXT NOT NULL,
    rationale TEXT NOT NULL,
    expected_state_version INTEGER,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'not_applied', 'superseded')),
    supersedes_proposal_id TEXT REFERENCES proposed_state_changes(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT,
    CHECK (
        (state_item_id IS NULL AND expected_state_version IS NULL)
        OR (state_item_id IS NOT NULL AND expected_state_version IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS history_transitions (
    id TEXT PRIMARY KEY,
    state_item_id TEXT NOT NULL REFERENCES current_state_items(id),
    proposed_change_id TEXT NOT NULL UNIQUE REFERENCES proposed_state_changes(id),
    transition_type TEXT NOT NULL
        CHECK (transition_type IN ('created', 'updated', 'retired')),
    old_statement TEXT,
    new_statement TEXT NOT NULL,
    old_effective_date TEXT,
    new_effective_date TEXT,
    from_version INTEGER,
    to_version INTEGER NOT NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (from_version IS NULL OR to_version = from_version + 1)
);

INSERT INTO schema_migrations(version) VALUES ('001_initial') ON CONFLICT (version) DO NOTHING;

