"""Nov 4 (Paige): an Ask answer whose only problem is an over-long headline is kept, not rejected.

The heading becomes "Answer" and the whole original headline opens the summary (unless the summary
already contains it), so nothing is dropped and the moved text gets every summary check. Any other
invalid field, or a summary that would run over its limit, still fails exactly as before. No model calls.
"""
from __future__ import annotations

import json
import logging
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api import Settings, create_app
from ask_service import OVERFLOW_HEADLINE, _recover_headline_overflow, run_ask
from test_ask_r9 import FakeAskProvider, seeded_connection

SELECTION = {
    "job": "current_fact",
    "state_ids": ["k-data", "k-security", "k-pilot"],
    "review_ids": [],
    "blocking_question_ids": ["q-retention"],
    "question_ids": ["q-ask-named-access"],
    "history_ids": [],
    "evidence_ids": ["ask-evidence-security-meeting"],
}
SUMMARY = "The pilot remains bounded and human-reviewed; retention authority still needs a decision."
# The Nov 4 shape: a status sentence that runs past 180 characters.
LONG = ("The pilot budget is $40,000 per Q3 planning notes, but it is not yet approved in Current State, "
        "and implementation planning can proceed only within the bounded Tier 1 use case for now")


def headline_of(length: int) -> str:
    text = (LONG + " " + LONG)[:length]
    assert len(text) == length
    return text


def answer(headline: str, summary: str = SUMMARY, **changes) -> dict:
    return {
        "job": "current_fact",
        "headline": headline,
        "summary": summary,
        "sections": [{"kind": "established", "title": "Decisions already made", "items": [
            {"text": "The pilot remains read-only.", "record_type": "state", "record_id": "k-data", "detail": None}]}],
        "source_ids": ["k-data"],
        "uncertainty_ids": ["q-retention"],
        "suggested_refinements": [],
        **changes,
    }


class OneCallProvider:
    def __init__(self, answer_raw: dict):
        self.answer_raw = answer_raw
        self.calls = 0

    def run(self, prompt):
        self.calls += 1
        return {"selection": deepcopy(SELECTION), "answer": deepcopy(self.answer_raw)}


class StreamingProvider(FakeAskProvider):
    """Streams one answer; select/synthesize are only reached by the API's contract retry."""

    def __init__(self, answer_raw: dict):
        super().__init__(selection=deepcopy(SELECTION), answer=deepcopy(answer_raw))
        self.stream_calls = 0

    def stream(self, prompt):
        self.stream_calls += 1
        yield json.dumps({"selection": self.selection, "answer": self.answer})


def ask_result(tmp_path, answer_raw: dict) -> dict:
    tmp_path.mkdir(parents=True, exist_ok=True)
    conn = seeded_connection(tmp_path)
    try:
        return run_ask(conn, OneCallProvider(answer_raw), "What's the pilot budget, and is it approved?")
    finally:
        conn.close()


def ask(tmp_path, answer_raw: dict) -> dict:
    return ask_result(tmp_path, answer_raw)["answer"]


def test_a_180_character_headline_is_left_alone(tmp_path):
    headline = headline_of(180)
    assert _recover_headline_overflow(answer(headline)) == answer(headline)
    result = ask(tmp_path, answer(headline))
    assert result["headline"] != OVERFLOW_HEADLINE
    assert result["summary"] == SUMMARY


def test_a_181_character_headline_becomes_answer_and_opens_the_summary_in_full(tmp_path):
    headline = headline_of(181)
    result = ask(tmp_path, answer(headline))
    assert result["headline"] == OVERFLOW_HEADLINE
    assert result["summary"] == f"{headline}. {SUMMARY}"


def test_a_headline_ending_in_punctuation_gets_no_extra_period():
    headline = headline_of(180) + "?"
    repaired = _recover_headline_overflow(answer(headline))
    assert repaired["summary"] == f"{headline} {SUMMARY}"


def test_a_headline_the_summary_already_contains_is_not_repeated():
    headline = headline_of(200)
    summary = "  " + headline.upper().replace(" ", "   ") + " Retention still needs a decision."
    repaired = _recover_headline_overflow(answer(headline, summary=summary))
    assert repaired["headline"] == OVERFLOW_HEADLINE
    assert repaired["summary"] == summary


def test_moved_headline_text_gets_exactly_the_summary_authority_backstop(tmp_path):
    # An unearned settled word in the moved text is treated as it would be anywhere in the summary.
    claim = ("The vendor confirmed the 30-day retention term and Legal resolved the open contract question, "
             "so the retention terms are established and nothing else is blocking the pilot launch next month")
    assert len(claim) > 180
    recovered = ask(tmp_path / "recovered", answer(claim))
    as_summary = ask(tmp_path / "direct", answer("Retention status", summary=f"{claim}. {SUMMARY}"))
    assert recovered["headline"] == OVERFLOW_HEADLINE
    assert recovered["summary"] == as_summary["summary"]
    assert recovered["summary"] != f"{claim}. {SUMMARY}", "the backstop must still act on the moved text"


def test_hedged_authority_wording_is_moved_word_for_word(tmp_path):
    result = ask(tmp_path, answer(LONG))
    assert result["summary"].startswith(LONG + ".")
    assert "not yet approved in Current State" in result["summary"]


def test_a_summary_that_would_run_over_its_limit_fails_closed(tmp_path):
    long_summary = "x" * 1_100
    raw = answer(headline_of(181), summary=long_summary)
    assert _recover_headline_overflow(raw) is raw
    with pytest.raises(ValidationError):
        ask_result(tmp_path, raw)


def test_an_empty_summary_is_not_repaired_by_the_moved_headline(tmp_path):
    raw = answer(headline_of(181), summary="")
    assert _recover_headline_overflow(raw) is raw
    with pytest.raises(ValidationError) as caught:
        ask_result(tmp_path, raw)
    assert {"headline", "summary"} <= {error["loc"][0] for error in caught.value.errors()}


def test_any_other_invalid_field_still_fails_with_the_original_errors(tmp_path):
    raw = answer(headline_of(181), job="not-a-real-ask-job")
    assert _recover_headline_overflow(raw) is raw
    with pytest.raises(ValidationError) as caught:
        ask_result(tmp_path, raw)
    failed = {error["loc"][0] for error in caught.value.errors()}
    assert {"headline", "job"} <= failed


def test_the_log_records_lengths_but_not_answer_text(tmp_path, caplog):
    headline = headline_of(181)
    with caplog.at_level(logging.WARNING, logger="state.ask"):
        ask(tmp_path, answer(headline))
    messages = [r.getMessage() for r in caplog.records if "headline over" in r.getMessage()]
    assert messages == [f"Ask headline over 180 characters (181); moved into the summary ({len(SUMMARY)} -> {len(headline) + 2 + len(SUMMARY)} characters)"]
    assert "pilot budget" not in messages[0]


def test_recovery_is_internal_and_adds_nothing_to_the_response(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        normal = run_ask(conn, OneCallProvider(answer("Pilot budget")), "What's the pilot budget, and is it approved?")
        recovered = run_ask(conn, OneCallProvider(answer(headline_of(181))), "Is the pilot budget approved?")
    finally:
        conn.close()
    assert set(recovered) == set(normal)
    assert set(recovered["answer"]) == set(normal["answer"])
    assert headline_of(181) not in json.dumps({k: v for k, v in recovered.items() if k != "answer"})


def test_standard_api_answers_with_one_provider_call(tmp_path):
    provider = OneCallProvider(answer(headline_of(181)))
    settings = Settings(database_path=str(tmp_path / "api.db"), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=None, ask_provider=provider)) as client:
        response = client.post("/api/ask", json={"query": "What's the pilot budget, and is it approved?"})
    assert response.status_code == 200
    assert response.json()["answer"]["headline"] == OVERFLOW_HEADLINE
    assert provider.calls == 1


def test_standard_api_still_retries_once_and_then_fails_closed_for_other_errors(tmp_path):
    provider = OneCallProvider(answer(headline_of(181), job="not-a-real-ask-job"))
    settings = Settings(database_path=str(tmp_path / "api.db"), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=None, ask_provider=provider)) as client:
        response = client.post("/api/ask", json={"query": "What's the pilot budget, and is it approved?"})
    assert response.status_code == 422
    assert provider.calls == 2


def test_streaming_ask_gives_a_stable_final_answer_from_one_model_call(tmp_path):
    provider = StreamingProvider(answer(headline_of(181)))
    settings = Settings(database_path=str(tmp_path / "stream.db"), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=None, ask_provider=provider)) as client:
        response = client.post("/api/ask/stream", json={"query": "What's the pilot budget, and is it approved?"})
    assert response.status_code == 200
    assert "event: final" in response.text
    assert "event: error" not in response.text
    final = json.loads(response.text.split("event: final\ndata: ", 1)[1].split("\n\n", 1)[0])
    assert final["answer"]["headline"] == OVERFLOW_HEADLINE
    assert final["answer"]["summary"].startswith(headline_of(181))
    assert provider.stream_calls == 1
    assert provider.prompts == [], "no contract retry (select/synthesize) was needed"
