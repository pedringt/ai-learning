"""#640 (Nov 7, Paige): Ask retrieves relevant resolved Questions with their recorded answer and provenance, and keeps
"this Question was answered" apart from "this is Current State". No model calls."""
from __future__ import annotations

from ask_contract import AskSelection, AskSynthesis
from ask_service import _compact_candidates, _grounding_rules, _selected_context, _trim_candidates_for_query, _validate_selection, _validate_synthesis
from eval.ask_quality_scenarios import SCENARIOS
from eval.quality_harness import _close, _new_test_connection, _seed_ask_scenario
from test_project_isolation import both_projects, db  # noqa: F401  (SQLite + Postgres connection fixtures)

SCENARIO = next(s for s in SCENARIOS if s.id == "ask_question_answer_no_state_mutation")


def _seeded():
    connection = _new_test_connection()
    _seed_ask_scenario(connection, SCENARIO)
    return connection


def test_a_resolved_question_reaches_ask_with_its_answer_and_provenance():
    connection = _seeded()
    try:
        candidates = _trim_candidates_for_query(SCENARIO.question, _compact_candidates(connection))
        [answered] = candidates["answered_questions"]
        assert answered["text"] == SCENARIO.closed_questions[0][0]
        assert answered["answer"] == SCENARIO.closed_questions[0][1]
        assert answered["authority"] == "answered_question"
        assert answered["answered_by_review_id"] == "ask-answer-review-0"
        assert answered["answer_evidence_id"] == "ask-answer-evidence-0"
        # Still not an open Question and not Current State.
        assert candidates["questions"] == []
        assert [s["statement"] for s in candidates["state"]] == ["The vendor contract remains under review."]
    finally:
        _close(connection)


def test_an_unrelated_request_does_not_pull_in_answered_questions():
    connection = _seeded()
    try:
        assert _trim_candidates_for_query("What is the launch date?", _compact_candidates(connection))["answered_questions"] == []
    finally:
        _close(connection)


def test_an_answered_question_card_uses_the_recorded_question_and_answer():
    connection = _seeded()
    try:
        candidates = _trim_candidates_for_query(SCENARIO.question, _compact_candidates(connection))
        selection = _validate_selection(AskSelection(job="current_fact", answered_question_ids=["ask-closed-question-0", "made-up"]), candidates)
        assert selection.answered_question_ids == ["ask-closed-question-0"]
        context = _selected_context(selection, candidates)
        answer = _validate_synthesis(AskSynthesis.model_validate({
            "job": "current_fact", "headline": "Yes, it was answered.", "summary": "The contract remains under review.",
            "sections": [{"kind": "other", "title": "Answered", "items": [
                {"text": "model paraphrase", "record_type": "answered_question", "record_id": "ask-closed-question-0", "detail": None}]}],
            "source_ids": ["ask-closed-question-0"], "uncertainty_ids": ["ask-closed-question-0"],
            "suggested_refinements": [], "suggested_question": None}), selection, context, candidates)
        [item] = answer.sections[0].items
        assert item.text == SCENARIO.closed_questions[0][0]
        assert item.detail == "Answered: " + SCENARIO.closed_questions[0][1]
        # An answered Question is not an open item, so it is never listed as uncertain.
        assert answer.uncertainty_ids == []
    finally:
        _close(connection)


def test_the_grounding_rules_keep_answered_apart_from_current_state():
    rules = _grounding_rules()
    assert "Answering a Question is not a Current State change" in rules


def test_answered_questions_stay_in_their_own_project(both_projects):
    db = both_projects
    db.project_id = "northstar"
    northstar = {x["id"] for x in _compact_candidates(db)["answered_questions"]}
    db.project_id = "juniper"
    juniper = {x["id"] for x in _compact_candidates(db)["answered_questions"]}
    assert northstar and juniper
    assert not (northstar & juniper)


def test_the_seeded_demo_answer_carries_its_evidence(both_projects):
    db = both_projects
    db.project_id = "northstar"
    [answered] = [x for x in _compact_candidates(db)["answered_questions"] if x["id"] == "q-review"]
    assert answered["answer"] and answered["answered_by_review_id"]
