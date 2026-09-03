from __future__ import annotations

from fastapi.testclient import TestClient

from api import Settings, create_app
from ask_contract import AskSelection, AskSynthesis
from ask_service import _compact_candidates, _trim_candidates_for_query, _validate_synthesis
from database_migration_backed import initialize_db
from db import connect
from review_service import list_state, resolve_review
from seed_demo import bootstrap_demo_data, reset_demo_data


def seeded_connection(tmp_path):
    conn = connect(f"sqlite://{tmp_path / 'golden.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    return conn


def test_golden_specific_recent_fact_outranks_broad_stakeholder_context(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        conn.execute(
            "INSERT INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)",
            ("e-billing-contact", "My billing contact is Jane Smith", "manual_note", "processed"),
        )
        candidates = _trim_candidates_for_query("Who is my billing contact?", _compact_candidates(conn))
        assert candidates["evidence"][0]["id"] == "e-billing-contact"
        assert "Jane Smith" in candidates["evidence"][0]["content"]
    finally:
        conn.close()


def test_golden_question_copy_is_canonical_and_internal_ids_do_not_leak(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        candidates = _trim_candidates_for_query("Prep me for the security meeting", _compact_candidates(conn))
        selection = AskSelection(
            job="meeting_prep",
            state_ids=[], review_ids=[], blocking_question_ids=["q-thresholds", "q-retention"],
            question_ids=[], history_ids=[], evidence_ids=[]
        )
        context = {
            "state": [], "reviews": [], "history": [], "evidence": [], "rules": [],
            "questions": [x for x in candidates["questions"] if x["id"] in {"q-thresholds", "q-retention"}],
        }
        raw = AskSynthesis.model_validate({
            "job": "meeting_prep",
            "headline": "Security prep question_4a63aa40d2b5",
            "summary": "Use q-thresholds and ask-evidence-vendor-retention.",
            "sections": [{
                "kind": "questions", "title": "Blocking question\\_97efc593a697", "items": [
                    {"text": "Evaluation thresholds question\\_4a63aa40d2b5 / q-thresholds. Blocks: Pilot launch criteria", "record_type": "blocking_question", "record_id": "q-thresholds", "detail": "Blocks: Pilot launch criteria"},
                    {"text": "Retention ask-evidence-vendor-retention question_97efc593a697", "record_type": "blocking_question", "record_id": "q-retention", "detail": "Blocks: Security approval for pilot data flow"},
                ]
            }],
            "source_ids": [], "uncertainty_ids": ["q-thresholds", "q-retention"], "suggested_refinements": []
        })
        clean = _validate_synthesis(raw, selection, context)
        visible = " ".join([clean.headline, clean.summary] + [s.title for s in clean.sections] + [i.text + " " + (i.detail or "") for s in clean.sections for i in s.items])
        for forbidden in ["question_", "q-thresholds", "q-retention", "ask-evidence-"]:
            assert forbidden not in visible
        threshold = next(i for s in clean.sections for i in s.items if i.record_id == "q-thresholds")
        assert threshold.text == "What evaluation thresholds should block or allow pilot launch?"
        assert threshold.detail == "Pilot launch criteria"
    finally:
        conn.close()


def test_golden_accepting_duplicate_create_does_not_duplicate_current_state(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        statement = "Grandfathered packages are legacy customer entitlements preserved outside current plan matrix definitions."
        conn.execute("INSERT INTO current_state_items(id,topic,statement,version) VALUES ('k-grandfathered','feature-access',?,1)", (statement,))
        conn.execute("INSERT INTO evidence(id,content,source_type,processing_status) VALUES ('e-dup',?,'manual_note','processed')", (statement,))
        conn.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES ('r-dup','missing_understanding','Add this fact?','Could duplicate existing State','open')")
        conn.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES ('r-dup','e-dup')")
        conn.execute("INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation) VALUES ('p-dup','r-dup',NULL,?,'Same fact',NULL,'pending','create')", (statement,))
        conn.commit()
        resolve_review(conn, "r-dup", "accept")
        matches = [x for x in list_state(conn) if " ".join(x["statement"].casefold().split()) == " ".join(statement.casefold().split())]
        assert len(matches) == 1
    finally:
        conn.close()


def test_golden_demo_reset_restores_interactive_baseline(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        conn.execute("INSERT INTO evidence(id,content,source_type,processing_status) VALUES ('e-user-test','QA junk','manual_note','processed')")
        conn.execute("UPDATE review_issues SET status='resolved',resolution='confirmed_current' WHERE id='demo-review-access'")
        conn.commit()
        counts = reset_demo_data(conn)
        assert counts["state"] >= 20
        assert conn.execute("SELECT id FROM evidence WHERE id='e-user-test'").fetchone() is None
        assert conn.execute("SELECT COUNT(*) AS c FROM review_issues WHERE status='open'").fetchone()["c"] >= 4
        assert conn.execute("SELECT COUNT(*) AS c FROM questions WHERE status='open' AND blocking=1").fetchone()["c"] >= 1
        assert conn.execute("SELECT COUNT(*) AS c FROM history_transitions").fetchone()["c"] >= 1
    finally:
        conn.close()


def test_demo_reset_api_is_demo_only_and_restores_seed(tmp_path):
    settings = Settings(database_path=str(tmp_path / "api-reset.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=None)
    with TestClient(app) as client:
        response = client.post("/api/demo/reset")
        assert response.status_code == 200
        assert response.json()["status"] == "reset"
        assert response.json()["seeded"]["reviews"] >= 4


class FactSynthesisProvider:
    def __init__(self):
        self.prompts = []
    def synthesize_selected(self, prompt):
        self.prompts.append(prompt)
        return {
            "job": "current_fact",
            "headline": "Jane Smith",
            "summary": "A recent project update says Jane Smith is the billing contact; it is still awaiting Review.",
            "sections": [{
                "kind": "recent_context", "title": "Recent project evidence", "items": [
                    {"text": "My billing contact is Jane Smith", "record_type": "evidence", "record_id": "e-billing-contact", "detail": None}
                ]
            }],
            "source_ids": ["e-billing-contact"], "uncertainty_ids": [], "suggested_refinements": []
        }


def test_golden_direct_fact_lookup_uses_specific_deterministic_fast_path_and_preserves_pending_review(tmp_path):
    from ask_service import run_ask
    conn = seeded_connection(tmp_path)
    try:
        conn.execute("INSERT INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES ('e-billing-contact','My billing contact is Jane Smith','manual_note','processed',CURRENT_TIMESTAMP)")
        conn.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES ('r-billing','missing_understanding','Add Jane Smith as the billing contact?','This establishes a project contact','open')")
        conn.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES ('r-billing','e-billing-contact')")
        conn.commit()
        provider = FactSynthesisProvider()
        result = run_ask(conn, provider, "Who is my billing contact?")
        assert result["timing"]["pipeline"] == "deterministic_fact_one_call"
        assert result["answer"]["headline"] == "Jane Smith"
        assert "e-billing-contact" in result["selection"]["evidence_ids"]
        assert "r-billing" in result["selection"]["review_ids"]
        review_items = [i for s in result["answer"]["sections"] for i in s["items"] if i["record_type"] == "review"]
        assert any(i["record_id"] == "r-billing" for i in review_items)
        assert len(provider.prompts) == 1
    finally:
        conn.close()

class DuplicateCreateProvider:
    name = "fake"
    model_identifier = "duplicate-create"
    def __init__(self, statement):
        self.statement = statement
    def interpret(self, *, context, evidence):
        return {
            "summary": "The note repeats an already-maintained fact.",
            "topics": ["workflow"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "missing_understanding",
                "decision_question": "Should State add this fact?",
                "why_consequential": "The provider believes this is missing.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": self.statement,
                    "rationale": "The note states this directly."
                }],
            }],
        }


def test_golden_repeated_current_state_evidence_does_not_create_noop_review(tmp_path):
    from interpretation_pipeline_integrated import process_evidence
    conn = seeded_connection(tmp_path)
    try:
        statement = conn.execute("SELECT statement FROM current_state_items WHERE id='k-pilot'").fetchone()["statement"]
        conn.execute("INSERT INTO evidence(id,content,source_type,processing_status) VALUES ('e-repeat',?,'manual_note','pending')", (statement,))
        conn.commit()
        result = process_evidence(conn, evidence_id="e-repeat", provider=DuplicateCreateProvider(statement))
        assert result.processing_status == "succeeded"
        assert result.review_ids == ()
        assert conn.execute("SELECT COUNT(*) AS c FROM review_evidence WHERE evidence_id='e-repeat'").fetchone()["c"] == 0
        record = conn.execute("SELECT structured_result FROM interpretation_records WHERE id=?", (result.interpretation_record_id,)).fetchone()
        assert '"outcome": "no_review"' in record["structured_result"]
    finally:
        conn.close()
