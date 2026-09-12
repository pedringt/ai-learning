"""Regression coverage for provider mistakes observed or likely in production.

Mechanical mistakes should normalize into a legal canonical interpretation.
Semantic/authority mistakes must still fail atomically with zero Reviews.
"""
import copy
import sqlite3

from database_migration_backed import initialize_db
from interpretation_pipeline_integrated import process_evidence


BASE = {
    "summary": "Training timing changed.",
    "topics": ["training"],
    "review_recommendations": [{
        "review_type": "proposed_update",
        "decision_question": "Update training timing?",
        "why_consequential": "The maintained timing is stale.",
        "affected_state_item_ids": ["k-training"],
        "proposed_changes": [{
            "operation": "update",
            "state_item_id": "k-training",
            "proposed_statement": "Training begins September 15.",
            "rationale": "Evidence changes the timing.",
        }],
    }],
}


class PayloadProvider:
    name = "regression"
    model_identifier = "deterministic"
    def __init__(self, payload): self.payload = payload
    def interpret(self, *, context, evidence, connection=None):
        return copy.deepcopy(self.payload)


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_db(conn)
    conn.execute(
        "INSERT INTO current_state_items(id,topic,statement,version) VALUES(?,?,?,?)",
        ("k-training", "training", "Training begins October 1.", 3),
    )
    conn.execute("INSERT INTO evidence(id,content,source_type) VALUES('e1','New note','manual_note')")
    conn.commit()
    return conn


def assert_succeeds(payload):
    conn = db()
    result = process_evidence(conn, evidence_id="e1", provider=PayloadProvider(payload))
    assert result.processing_status == "succeeded"
    assert conn.execute("SELECT count(*) FROM review_issues").fetchone()[0] == 1
    conn.close()


def assert_fails_atomically(payload, expected_code):
    conn = db()
    result = process_evidence(conn, evidence_id="e1", provider=PayloadProvider(payload))
    assert result.processing_status == "failed"
    assert conn.execute("SELECT count(*) FROM review_issues").fetchone()[0] == 0
    code = conn.execute(
        "SELECT error_code FROM interpretation_records WHERE id=?", (result.interpretation_record_id,)
    ).fetchone()[0]
    assert code == expected_code
    conn.close()


def test_observed_mechanical_failure_classes_are_repaired():
    variants = []

    # create + stray expected_version/state ID
    p = copy.deepcopy(BASE)
    rec = p["review_recommendations"][0]
    rec["review_type"] = "missing_understanding"
    rec["affected_state_item_ids"] = []
    proposal = rec["proposed_changes"][0]
    proposal.update(operation="create", state_item_id="k-training", expected_version=99,
                    proposed_statement="Tier 2 joins September 15.")
    variants.append(p)

    # relative/sentinel effective date
    p = copy.deepcopy(BASE); p["review_recommendations"][0]["proposed_changes"][0]["effective_date"] = "upon_decision"; variants.append(p)

    # explicit target omitted from affected IDs
    p = copy.deepcopy(BASE); p["review_recommendations"][0]["affected_state_item_ids"] = []; variants.append(p)

    # missing_understanding mislabeled around an update
    p = copy.deepcopy(BASE); p["review_recommendations"][0]["review_type"] = "missing_understanding"; variants.append(p)

    # grouped recommendation with no grouping_reason
    p = copy.deepcopy(BASE)
    p["review_recommendations"][0]["affected_state_item_ids"] = ["k-training", "k-training"]
    variants.append(p)  # dedupes back to singleton; omission remains legal

    # mechanical fields omitted entirely (new Anthropic structured-output shape)
    variants.append(copy.deepcopy(BASE))

    for payload in variants:
        assert_succeeds(payload)


def test_unrepairable_authority_or_content_errors_still_fail_atomically():
    p = copy.deepcopy(BASE)
    p["review_recommendations"][0]["proposed_changes"][0]["state_item_id"] = "made-up-state"
    assert_fails_atomically(p, "schema_violation")

    p = copy.deepcopy(BASE)
    del p["review_recommendations"][0]["proposed_changes"][0]["proposed_statement"]
    assert_fails_atomically(p, "schema_violation")

    p = copy.deepcopy(BASE)
    p["review_recommendations"][0]["existing_review_id"] = "made-up-review"
    assert_fails_atomically(p, "invalid_review_reference")


def test_existing_review_id_with_mismatched_review_type_is_repaired_not_rejected():
    """Regression coverage for a staging finding (2026-09-13): a provider
    correctly linked evidence to an existing open Review (demo-review-retention,
    stored type state_at_risk) but labeled its own recommendation
    proposed_update. Validation hard-rejected the whole evidence submission
    with review_type_mismatch even though the reference itself was exactly
    right -- a mechanical labeling slip, not a substantive authority problem.

    The existing Review's type is an application fact the provider was
    already shown; software now treats it as authoritative for any
    recommendation that references it via existing_review_id, the same way
    it already owns concurrency versions. The evidence must be saved and
    linked to the existing Review, and no duplicate Review is created.
    """
    conn = db()
    conn.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
        "VALUES ('demo-review-retention', 'state_at_risk', 'Is the vendor retention window acceptable?', "
        "'Vendor retention terms were unconfirmed.', 'open')"
    )
    conn.commit()

    p = copy.deepcopy(BASE)
    rec = p["review_recommendations"][0]
    rec["review_action"] = "update_existing"
    rec["existing_review_id"] = "demo-review-retention"
    rec["review_type"] = "proposed_update"  # mismatches the persisted state_at_risk

    result = process_evidence(conn, evidence_id="e1", provider=PayloadProvider(p))

    assert result.processing_status == "succeeded"
    # No duplicate Review was created; the existing one is still the only one.
    assert conn.execute("SELECT count(*) FROM review_issues").fetchone()[0] == 1
    row = conn.execute(
        "SELECT review_type, status FROM review_issues WHERE id='demo-review-retention'"
    ).fetchone()
    assert row["review_type"] == "state_at_risk"
    assert row["status"] == "open"
    # The new evidence is linked to the existing Review.
    assert conn.execute(
        "SELECT count(*) FROM review_evidence WHERE review_id='demo-review-retention' AND evidence_id='e1'"
    ).fetchone()[0] == 1
    conn.close()
