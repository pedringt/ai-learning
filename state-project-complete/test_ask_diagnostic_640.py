"""#640 diagnostic: variants keep the prompt and scorer fixed, and the duplicate-Evidence filter does only that. No
model calls."""
from ask_service import _compact_candidates, _trim_candidates_for_query
import ask_service
from eval.ask_diagnostic_640 import CLEAR_QUESTION, variants, without_duplicate_evidence
from eval.ask_quality_scenarios import SCENARIOS
from eval.quality_harness import _close, _new_test_connection, _seed_ask_scenario

BASE = next(s for s in SCENARIOS if s.id == "ask_question_answer_no_state_mutation")


def test_variants_change_only_what_each_one_tests():
    clear, no_dup, isolated = variants()
    assert [v.id for v in variants()] == ["clear_wording", "no_duplicate_evidence", "resolved_question_only"]
    for v in variants():
        assert v.scenario.question == CLEAR_QUESTION
        assert v.scenario.closed_questions == BASE.closed_questions
        assert v.scenario.headline_required_facts == BASE.headline_required_facts
        assert v.scenario.forbidden_headline_openings == BASE.forbidden_headline_openings
    # The expected answer is the scenario's own; only the isolated variant drops what its missing record can't support.
    assert clear.scenario.required_facts == BASE.required_facts and clear.scenario.forbidden_claims == BASE.forbidden_claims
    assert no_dup.scenario == clear.scenario and no_dup.drop_duplicate_evidence and not clear.drop_duplicate_evidence
    assert isolated.scenario.current_state == () and "under review" not in isolated.scenario.required_facts
    assert ("answered", "resolved") in isolated.scenario.required_facts and "30 days" in isolated.scenario.required_facts


def test_the_duplicate_evidence_filter_removes_only_the_answer_evidence_and_restores_retrieval():
    connection = _new_test_connection()
    try:
        _seed_ask_scenario(connection, BASE)
        original = ask_service._trim_candidates_for_query
        with without_duplicate_evidence(True):
            trimmed = ask_service._trim_candidates_for_query(CLEAR_QUESTION, _compact_candidates(connection))
        assert ask_service._trim_candidates_for_query is original
        plain = _trim_candidates_for_query(CLEAR_QUESTION, _compact_candidates(connection))
        assert [x["id"] for x in plain["evidence"]] == ["ask-answer-evidence-0"]
        assert trimmed["evidence"] == []
        assert trimmed["answered_questions"] == plain["answered_questions"]
        assert trimmed["answered_questions"][0]["answer"].endswith("within 30 days of contract end.")
    finally:
        _close(connection)
