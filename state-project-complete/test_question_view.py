"""#640 Draft 1 (Paige, Nov 8): the Answered Question view's data. Each part appears only when the records support it.
Deterministic; SQLite and Postgres (the `db` fixture); no model calls."""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app
from review_service import get_question, list_questions, question_details, resolving_review
from test_project_isolation import both_projects, db  # noqa: F401  (SQLite + Postgres connection fixtures)


def _question(db, qid, status="resolved", resolved_at="2026-10-01 09:00:00", evidence_id=None, project="northstar"):
    db.execute("INSERT INTO questions(id, text, status, blocking, resolved_at, resolution, source_evidence_id, project_id) "
               "VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
               (qid, f"Question {qid}?", status, resolved_at if status == "resolved" else None,
                "Resolved by reviewed evidence" if status == "resolved" else None, evidence_id, project))


def _evidence(db, eid, content="Legal confirmed 30 days.", project="northstar"):
    db.execute("INSERT INTO evidence(id, content, project_id) VALUES (?, ?, ?)", (eid, content, project))


def _review(db, rid, qid, resolution="confirmed_current", note=None, resolved_at="2026-10-01 09:00:00", link=True, project="northstar"):
    db.execute("INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, resolution, resolution_note, resolved_at, project_id) "
               "VALUES (?, 'proposed_update', ?, '', 'resolved', ?, ?, ?, ?)", (rid, f"Review {rid}", resolution, note, resolved_at, project))
    if link:
        db.execute("INSERT INTO review_questions(review_id, question_id) VALUES (?, ?)", (rid, qid))


def _transition(db, rid, tid, statement="Retention is 30 days.", adjusted=0):
    db.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, 'retention', ?, 2)", (f"state-{tid}", statement))
    db.execute("INSERT INTO proposed_state_changes(id, review_id, state_item_id, proposed_statement, rationale, expected_state_version, status, operation) "
               "VALUES (?, ?, ?, ?, 'r', 1, 'accepted', 'update')", (f"p-{tid}", rid, f"state-{tid}", statement))
    db.execute("INSERT INTO history_transitions(id, state_item_id, proposed_change_id, transition_type, old_statement, new_statement, from_version, to_version, changed_at, accepted_as_adjusted) "
               "VALUES (?, ?, ?, 'updated', 'old', ?, 1, 2, '2026-10-01 09:00:00', ?)", (f"h-{tid}", f"state-{tid}", f"p-{tid}", statement, adjusted))


# ------------------------------------------------------------------ which Review resolved it

def test_one_linked_accepted_review_is_the_resolver_with_its_note_and_linked_updates(db):
    _evidence(db, "e1"); _question(db, "q1", evidence_id="e1")
    _review(db, "r1", "q1", resolution="updated", note="Matches the contract."); _transition(db, "r1", "t1")
    details = question_details(db, get_question(db, "q1"))
    assert details["evidence"]["content"] == "Legal confirmed 30 days."
    assert details["resolving_review"]["id"] == "r1" and details["resolving_review"]["resolution_note"] == "Matches the contract."
    assert [u["new_statement"] for u in details["state_updates"]] == ["Retention is 30 days."]


def test_two_linked_accepted_reviews_are_ambiguous_so_no_review_note_or_state_claim(db):
    _evidence(db, "e1"); _question(db, "q1", evidence_id="e1")
    _review(db, "r1", "q1", note="first"); _review(db, "r2", "q1", resolution="updated", note="second"); _transition(db, "r2", "t2")
    details = question_details(db, get_question(db, "q1"))
    assert details["resolving_review"] is None and details["state_updates"] == []
    assert details["evidence"]["id"] == "e1"  # the Question's own explicit link is still shown


def test_a_review_with_a_coincident_timestamp_but_no_link_is_never_the_resolver(db):
    _question(db, "q1")
    _review(db, "r-same-time", "q1", link=False)  # resolved at the same moment, not linked
    assert resolving_review(db, "q1") is None


def test_linked_reviews_that_could_not_resolve_it_are_not_the_resolver(db):
    _question(db, "q1")
    _review(db, "r-linked-question", "q1", resolution="question_linked")  # links a Question, never resolves one
    _review(db, "r-rejected", "q1", resolution="not_applied")
    _review(db, "r-adjusted", "q1", resolution="updated"); _transition(db, "r-adjusted", "ta", adjusted=1)  # #106: leaves Questions open
    assert resolving_review(db, "q1") is None
    _review(db, "r-real", "q1")
    assert resolving_review(db, "q1")["id"] == "r-real"


def test_an_open_question_gets_no_resolution_details_even_with_draft_text(db):
    _evidence(db, "e-draft", "Draft: maybe 30 days."); _question(db, "q-open", status="open", evidence_id="e-draft")
    details = question_details(db, get_question(db, "q-open"))
    assert details == {"evidence": None, "resolving_review": None, "state_updates": []}


def test_a_missing_resolved_date_is_returned_as_missing(db):
    _question(db, "q1", resolved_at=None)
    assert get_question(db, "q1")["resolved_at"] is None


# ------------------------------------------------------------------ pagination and isolation

def test_pages_are_newest_first_with_ties_broken_by_id_and_undated_last(db):
    for qid, when in [("qb", "2026-10-02 09:00:00"), ("qa", "2026-10-02 09:00:00"), ("qc", "2026-10-02 09:00:00"),
                      ("qz", "2026-10-05 09:00:00"), ("q-undated", None)]:
        _question(db, qid, resolved_at=when)
    pages = [list_questions(db, "resolved", limit=2, offset=o) for o in (0, 2, 4)]
    ids = [q["id"] for page in pages for q in page]
    assert ids == ["qz", "qa", "qb", "qc", "q-undated"]
    assert len(set(ids)) == len(ids)


def test_without_a_limit_the_list_order_is_unchanged(db):
    _question(db, "q-old", status="open"); _question(db, "q-new", status="open")
    db.execute("UPDATE questions SET created_at='2026-01-01' WHERE id='q-old'"); db.execute("UPDATE questions SET created_at='2026-02-01' WHERE id='q-new'")
    assert [q["id"] for q in list_questions(db, "open")] == ["q-old", "q-new"]


def test_another_projects_question_and_evidence_are_not_visible(both_projects):
    db = both_projects
    _evidence(db, "e-j", project="juniper"); _question(db, "q-j", evidence_id="e-j", project="juniper")
    db.project_id = "northstar"
    assert get_question(db, "q-j") is None
    db.project_id = "juniper"
    assert question_details(db, get_question(db, "q-j"))["evidence"]["id"] == "e-j"


# ------------------------------------------------------------------ API

def _client(tmp):
    return TestClient(create_app(Settings(database_path=str(Path(tmp) / "state.db"), provider="anthropic", cors_origins=[], demo_bootstrap=True)))


def test_api_fetches_the_demo_question_by_id_with_what_the_records_support():
    with tempfile.TemporaryDirectory() as tmp, _client(tmp) as client:
        body = client.get("/api/questions/q-review", headers={"X-State-Project-Id": "northstar"}).json()
        assert body["item"]["status"] == "resolved"
        assert body["details"]["evidence"]["id"] == "demo-review-resolved-review-question-evidence"
        assert body["details"]["resolving_review"]["id"] == "demo-review-resolved-review-question"
        assert body["details"]["state_updates"] == []
        assert client.get("/api/questions/q-review", headers={"X-State-Project-Id": "juniper"}).status_code == 404
        assert client.get("/api/questions/no-such-question").status_code == 404


def test_api_pagination_is_opt_in_and_reports_the_next_page():
    with tempfile.TemporaryDirectory() as tmp, _client(tmp) as client:
        plain = client.get("/api/questions?status=open").json()
        assert set(plain) == {"items"}  # existing callers: unchanged shape
        page = client.get("/api/questions?status=resolved&limit=10&offset=0").json()
        assert [q["id"] for q in page["items"]] == ["q-review"] and page["next_offset"] is None


def test_ask_keeps_its_own_review_choice_and_answer_text_through_the_shared_lookup(db):
    """Paige, Nov 8: sharing the lookup must not change Ask. Ask still names the most recently resolved linked Review
    (the view, by contrast, says the resolver is not recorded when two could have resolved it)."""
    from ask_service import _answered_question
    _evidence(db, "e1", "Legal confirmed the vendor deletes customer content within 30 days of contract end.")
    _question(db, "q1", evidence_id="e1")
    _review(db, "r-early", "q1", resolved_at="2026-10-01 09:00:00"); _review(db, "r-late", "q1", resolved_at="2026-10-02 09:00:00")
    record = _answered_question(db, get_question(db, "q1"))
    assert record["answer"] == "Legal confirmed the vendor deletes customer content within 30 days of contract end."
    assert record["answered_by_review_id"] == "r-late" and record["answer_evidence_id"] == "e1"
    assert resolving_review(db, "q1") is None
