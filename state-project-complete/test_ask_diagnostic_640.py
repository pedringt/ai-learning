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


def _case(case_id):
    from eval.ask_diagnostic_640 import step1_cases
    return next(v for v in step1_cases() if v.id == case_id).scenario


def test_step1_new_cases_score_the_status_asked_about_not_a_fixed_word():
    from eval.quality_harness import score_ask_answer
    body = "The retention Question was answered: content is deleted within 30 days of contract end."
    resolved = _case("resolved_question")
    assert resolved == BASE  # the suite scenario, unchanged
    negative = _case("negative_polarity")
    assert score_ask_answer(negative, {"headline": "No, Legal answered the retention question.", "summary": body}).passed
    assert not score_ask_answer(negative, {"headline": "Yes, it is still unanswered.", "summary": body}).passed
    assert not score_ask_answer(negative, {"headline": "Not yet: Legal's answer is recorded.", "summary": body}).passed
    twin = _case("open_question_twin")
    assert twin.closed_questions == () and twin.open_questions == (BASE.closed_questions[0][0],)
    assert score_ask_answer(twin, {"headline": "Not yet: the retention Question is still open.",
                                   "summary": "No answer is recorded; the Question is still open and the vendor contract remains under review."}).passed
    assert not score_ask_answer(twin, {"headline": "Yes, it was answered: 30 days.",
                                       "summary": "It is still open; content is deleted within 30 days."}).passed


def test_step1_keeps_the_adjacent_scenarios_unchanged():
    from eval.ask_diagnostic_640 import step1_cases
    suite = {s.id: s for s in SCENARIOS}
    for v in step1_cases()[3:]:
        assert v.scenario == suite[v.id]


def test_the_diagnostic_saves_the_prompt_and_raw_output_and_compares_headlines(monkeypatch):
    """End to end through run_ask with a stubbed Anthropic client: no network, no model call."""
    import json
    from types import SimpleNamespace

    import anthropic
    from anthropic.resources.messages import Messages
    from eval.ask_diagnostic_640 import run_variant, step1_cases

    raw = {"selection": {"job": "current_fact", "state_ids": ["ask-state-0"], "review_ids": [], "blocking_question_ids": [],
                         "question_ids": [], "history_ids": [], "evidence_ids": [], "answered_question_ids": ["ask-closed-question-0"]},
           "answer": {"job": "current_fact",
                      "claims": [{"text": "No, the vendor-retention question is answered.", "basis": "none",
                                  "primary_record_id": None, "supporting_record_ids": []}],
                      "sections": [], "source_ids": [], "uncertainty_ids": [], "suggested_refinements": [], "suggested_question": None}}
    sent = []

    def fake_create(self, *args, **kwargs):
        sent.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(raw))], stop_reason="end_turn",
                               usage=SimpleNamespace(input_tokens=100, output_tokens=50))

    monkeypatch.setattr(Messages, "create", fake_create)
    provider = SimpleNamespace(client=anthropic.Anthropic(api_key="test-not-real"), name="anthropic", model_identifier="claude-haiku-5-5")
    row = run_variant(step1_cases()[0], provider)
    [call] = row["model_calls"]
    assert call["prompt"] == sent[0]["messages"][0]["content"] and "Authority-tagged candidate records" in call["prompt"]
    assert json.loads(call["raw_text"]) == raw and call["stop_reason"] == "end_turn" and call["output_tokens"] == 50
    assert row["raw_headline"] == "No, the vendor-retention question is answered."
    assert row["raw_matches_final_headline"] is True and row["headline"] == row["raw_headline"]
    assert Messages.create is fake_create  # the capture patch is removed afterwards
