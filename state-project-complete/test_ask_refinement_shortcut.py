"""Deterministic refinement shortcut: "make this 3 bullets" etc. should never
hit the model when a previous answer already exists to reshape.

Regression coverage for the Ask speed pass: before this, every refinement
request re-ran the full one-call pipeline (fresh context trim + a real model
round-trip) and only applied ask_refinement_transforms.py afterward, discarding
most of what the model produced. These tests lock in that refinements are now
served purely from ask_service._refinement_shortcut_result, with the model
provider left untouched.
"""
from __future__ import annotations

from copy import deepcopy

from ask_service import run_ask, stream_ask_events
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data


def seeded_connection(tmp_path):
    url = f"sqlite://{tmp_path / 'state.db'}"
    conn = connect(url)
    initialize_db(conn)
    bootstrap_demo_data(conn)
    return conn


class FakeOneCallAskProvider:
    """Provider that fails the test if it is ever actually called."""

    def __init__(self):
        self.calls = []

    def run(self, prompt):
        self.calls.append(prompt)
        raise AssertionError("Provider.run was called for a refinement that should have been served deterministically")

    def stream(self, prompt):
        self.calls.append(prompt)
        raise AssertionError("Provider.stream was called for a refinement that should have been served deterministically")


PREVIOUS_ANSWER = {
    "job": "meeting_prep",
    "headline": "Security meeting prep",
    "summary": "The pilot remains bounded and human-reviewed; retention authority still needs resolution.",
    "sections": [
        {"kind": "established", "title": "Decisions already made", "items": [
            {"text": "The pilot remains read-only.", "record_type": "state", "record_id": "k-data", "detail": None}
        ]},
        {"kind": "questions", "title": "Get these answered", "items": [
            {"text": "Does security require named-agent access?", "record_type": "question", "record_id": "q-ask-named-access", "detail": None},
            {"text": "Who owns pilot expansion approval?", "record_type": "question", "record_id": "q-ask-expansion-owner", "detail": None},
        ]},
        {"kind": "needs_review", "title": "Needs your review", "items": [
            {"text": "Should vendor retention be accepted into Current State?", "record_type": "review", "record_id": "demo-review-retention", "detail": "Vendor evidence conflicts with the existing retention statement."}
        ]},
    ],
    "source_ids": ["k-data"],
    "uncertainty_ids": ["q-ask-named-access", "demo-review-retention"],
    "suggested_refinements": ["Turn into agenda", "Make shorter"],
}


def test_three_bullets_refinement_never_calls_the_provider(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        result = run_ask(conn, provider, "make this 3 bullets", deepcopy(PREVIOUS_ANSWER))
        assert provider.calls == []
        assert result["timing"]["pipeline"] == "deterministic_refinement"
        assert result["timing"]["provider_ms"] == 0
        sections = result["answer"]["sections"]
        assert len(sections) == 1
        assert len(sections[0]["items"]) <= 3
    finally:
        conn.close()


def test_shorten_refinement_never_calls_the_provider(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        result = run_ask(conn, provider, "shorten it", deepcopy(PREVIOUS_ANSWER))
        assert provider.calls == []
        assert result["timing"]["pipeline"] == "deterministic_refinement"
    finally:
        conn.close()


def test_focus_blockers_refinement_never_calls_the_provider_via_streaming(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        events = list(stream_ask_events(conn, provider, "just show me the blockers", deepcopy(PREVIOUS_ANSWER)))
        assert provider.calls == []
        # The shortcut skips straight to a validated final payload -- no preview/delta noise.
        assert [name for name, _ in events] == ["final"]
        result = events[0][1]
        assert result["timing"]["pipeline"] == "deterministic_refinement"
    finally:
        conn.close()


def test_conversational_followup_is_not_treated_as_a_refinement(tmp_path):
    """A genuine follow-up question ("what source supports that?") still needs a
    real model call -- only recognized structural refinements skip it."""
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        try:
            run_ask(conn, provider, "what source supports that?", deepcopy(PREVIOUS_ANSWER))
        except AssertionError as exc:
            assert "Provider.run was called" in str(exc)
        else:
            raise AssertionError("Expected the fake provider to be called (and raise) for a conversational follow-up")
    finally:
        conn.close()


def test_refinement_without_a_previous_answer_is_not_a_shortcut(tmp_path):
    """No previous answer means there is nothing to reshape -- must go through the model."""
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        try:
            run_ask(conn, provider, "make this 3 bullets", None)
        except AssertionError as exc:
            assert "Provider.run was called" in str(exc)
        else:
            raise AssertionError("Expected the fake provider to be called (and raise) with no previous answer")
    finally:
        conn.close()


def test_refinement_shortcut_reports_honest_open_items_remaining(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        provider = FakeOneCallAskProvider()
        result = run_ask(conn, provider, "make it leadership-ready", deepcopy(PREVIOUS_ANSWER))
        remaining = result["open_items_remaining"]
        assert isinstance(remaining["count"], int)
        assert isinstance(remaining["reviews"], int)
        assert remaining["count"] >= 0
        assert remaining["reviews"] >= 0
    finally:
        conn.close()
