"""Oct 20: summary sentences that only repeat a card are dropped; nothing that warns is (no model calls)."""
from ask_dedupe import drop_repeated_summary_sentences, summary_repetition


def _answer(summary):
    return {"summary": summary, "sections": [
        {"items": [{"text": "Password-reset automation is paused after a security incident.", "detail": None}]},
        {"items": [{"text": "Leadership asked whether low-risk cases can skip human review.", "detail": ""}]},
    ]}


def test_a_pure_repeat_of_a_card_is_dropped_but_the_first_sentence_stays():
    a = _answer("No, it is paused. Current State says password-reset automation is paused after a security incident.")
    drop_repeated_summary_sentences(a)
    assert a["summary"] == "No, it is paused."


def test_a_sentence_that_warns_or_hedges_is_kept_even_when_it_repeats_a_card():
    a = _answer("Human review stays. An open Review notes leadership asked whether low-risk cases can skip human review.")
    drop_repeated_summary_sentences(a)
    assert "open Review" in a["summary"]


def test_the_first_sentence_is_never_dropped_and_new_information_is_kept():
    a = _answer("Password-reset automation is paused after a security incident. It was approved before September.")
    drop_repeated_summary_sentences(a)
    assert a["summary"].startswith("Password-reset automation is paused") and "September" in a["summary"]


def test_summary_repetition_counts_without_changing_the_answer():
    a = _answer("No, it is paused. Current State says password-reset automation is paused after a security incident.")
    assert summary_repetition(a) == {"summary_sentences": 2, "repeated_sentences": 1, "summary_words": 15}
    assert "Current State says" in a["summary"]


def test_grader_sees_the_card_badges_people_see():
    from eval.ask_grader import visible_answer
    shown = visible_answer({"answer": {"headline": "h", "sections": [{"items": [{"text": "t", "record_type": "blocking_question"}]}]}})
    assert shown["sections"][0]["items"][0]["badge"] == "Blocking"


def test_suggested_question_is_part_of_the_answer_contract_and_schema():
    # #543
    from ask_contract import ANSWER_JSON_SCHEMA, AskSynthesis
    assert "suggested_question" in ANSWER_JSON_SCHEMA["required"]
    assert ANSWER_JSON_SCHEMA["properties"]["suggested_question"]["type"] == ["string", "null"]
    base = {"job": "current_fact", "headline": "h", "summary": "s"}
    assert AskSynthesis.model_validate(base).suggested_question is None
    assert AskSynthesis.model_validate({**base, "suggested_question": "Why was it paused?"}).suggested_question == "Why was it paused?"


def test_prompts_carry_the_scope_and_suggestion_rules():
    # #543, #545: both the one-call and the two-call prompts.
    import inspect
    import ask_service
    source = inspect.getsource(ask_service)
    assert source.count("keep its scope qualifiers") == 2
    assert source.count("suggested_question: when the answer finds a specific gap") == 2
