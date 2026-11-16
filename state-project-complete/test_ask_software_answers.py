"""Ask answers software writes from the record, with no model call (ask_software_answers.py, Nov 16).

#692: re-check and confirmation-date questions are answered from `last_confirmed_at` / `needs_recheck` (DEC-026).

Runs the real app on the seeded demo projects (SQLite, and Postgres when STATE_TEST_POSTGRES_URL is set). The Ask
provider fails the test if it is called.
"""
from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from ask_display import displayed_text
from ask_software_answers import format_confirmed, is_recheck_question
from test_area_identity import db_url  # noqa: F401  (SQLite + Postgres database URL fixture)
from test_baseline_setup_lifecycle import BaselineFixtureProvider

NORTHSTAR = {"X-State-Project-Id": "northstar"}
JUNIPER = {"X-State-Project-Id": "juniper"}


class NoModel:
    """Fails the test if Ask reaches the model."""

    def run(self, prompt):
        raise AssertionError("Ask called the model for a question software answers")

    def stream(self, prompt):
        raise AssertionError("Ask called the model for a question software answers")


def _client(db_url):
    return TestClient(create_app(Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True),
                                 provider=BaselineFixtureProvider(), ask_provider=NoModel()))


def _ask(client, query, headers=NORTHSTAR, **extra):
    response = client.post("/api/ask", json={"query": query, **extra}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _stream_final(client, query, headers=NORTHSTAR):
    import json
    with client.stream("POST", "/api/ask/stream", json={"query": query}, headers=headers) as response:
        body = "".join(response.iter_text())
    events = [block for block in body.split("\n\n") if block.strip()]
    assert len(events) == 1 and events[0].startswith("event: final"), body
    return json.loads(events[0].split("data: ", 1)[1])


def _state(client, headers=NORTHSTAR):
    return {item["id"]: item for item in client.get("/api/state", headers=headers).json()["items"]}


# --------------------------------------------------------------------------------------------------------------------
# #692


@pytest.mark.parametrize("query", [
    "When was the escalation path last confirmed?",
    "Which items in Current State are flagged as needing re-check",
    "Are any Current State items overdue for a re-check?",
    "Which Current State items need a re-check?",
    "Which items need a re-check?",
    "Do any items need rechecking?",
    "What are the confirmation dates for Current State?",
    "Does anything need to be re-confirmed?",
])
def test_recheck_questions_are_recognised(query):
    assert is_recheck_question(query)


@pytest.mark.parametrize("query", [
    "Is the pilot budget approved?",
    "Has leadership confirmed the autonomy target?",
    "What needs my attention right now?",
    "What did the vendor confirm about the move date?",
    "Which Reviews are open?",
])
def test_other_questions_are_left_to_the_model(query):
    assert not is_recheck_question(query)


def test_which_items_need_a_recheck_lists_the_flagged_items_not_reviews(db_url):
    """QA Nov 16: the model listed five pending Reviews as 'items needing a re-check' and left out k-escalation."""
    with _client(db_url) as client:
        for result in (_ask(client, "Which Current State items need a re-check?"),
                       _stream_final(client, "Which items in Current State are flagged as needing re-check")):
            answer = result["answer"]
            assert result["timing"]["pipeline"] == "software_recheck"
            assert answer["claims"][0]["text"].startswith("2 Current State items need a re-check")
            listed = [item["record_id"] for section in answer["sections"] for item in section["items"]]
            assert sorted(listed) == ["k-escalation", "k-vip"]
            assert all(item["record_type"] == "state" for section in answer["sections"] for item in section["items"])
            assert "no current state item" not in displayed_text(result).lower()


def test_when_was_an_item_last_confirmed_names_its_date_and_flag(db_url):
    """QA Nov 16: 'The records I looked at don't show when the escalation path was last confirmed' above a chip that
    showed the date."""
    with _client(db_url) as client:
        item = _state(client)["k-escalation"]
        result = _ask(client, "When was the escalation path last formally confirmed, and by whom?", client_timezone_offset=0)
        claims = result["answer"]["claims"]
        assert claims[0]["primary_record_id"] == "k-escalation" and claims[0]["basis"] == "current_state"
        assert claims[0]["label"] == "Current State"
        when = format_confirmed(item["last_confirmed_at"], 0)
        assert claims[0]["text"] == (f"Escalation path was last confirmed {when}. That's longer ago than its 60-day "
                                     "re-check interval, so it needs a re-check.")
        assert claims[-1]["text"] == "State records when an item was last confirmed, not who confirmed it."
        assert result["answer"]["suggested_question"] is None      # never "Track this unknown?" for a recorded date
        assert result["selection"]["state_ids"] == ["k-escalation"]


def test_an_item_within_its_interval_says_so(db_url):
    with _client(db_url) as client:
        claims = _ask(client, "When was the VIP exception last confirmed?")["answer"]["claims"]
        assert claims[0]["primary_record_id"] == "k-vip" and "needs a re-check" in claims[0]["text"]
        claims = _ask(client, "When was the data boundary last confirmed?")["answer"]["claims"]
        assert claims[0]["primary_record_id"] == "k-data"
        assert claims[0]["text"].endswith("within its 60-day re-check interval.")


def test_juniper_lists_its_own_flagged_item(db_url):
    with _client(db_url) as client:
        result = _ask(client, "Which items need a re-check?", JUNIPER)
        listed = [item["record_id"] for section in result["answer"]["sections"] for item in section["items"]]
        assert listed == ["j-storage"]
        assert result["answer"]["claims"][0]["text"].startswith("1 Current State item needs a re-check")


def test_an_unmatched_subject_says_so_and_lists_the_flagged_items(db_url):
    with _client(db_url) as client:
        claims = _ask(client, "When was the pilot budget last confirmed?")["answer"]["claims"]
        assert claims[0]["text"].startswith("State couldn't tell which Current State item")
        assert claims[1]["text"].startswith("2 Current State items need a re-check")


def test_still_true_moves_the_answer_not_a_cached_copy(db_url):
    with _client(db_url) as client:
        assert _ask(client, "Which items need a re-check?")["answer"]["claims"][0]["text"].startswith("2 ")
        assert client.post("/api/state/k-escalation/confirm", json={}, headers=NORTHSTAR).status_code == 200
        assert _ask(client, "Which items need a re-check?")["answer"]["claims"][0]["text"].startswith("1 ")


def test_reminders_off_says_so(db_url):
    with _client(db_url) as client:
        assert client.patch("/api/project/recheck", json={"days": None}, headers=NORTHSTAR).status_code == 200
        claims = _ask(client, "Which items need a re-check?")["answer"]["claims"]
        assert claims[0]["text"].startswith("Re-check reminders are off for this project")


def test_dates_follow_the_askers_time_zone():
    # 2026-08-04 02:00 UTC is Aug 3 in Seattle (offset 420 in summer), as the chip shows it there.
    assert format_confirmed("2026-08-04 02:00:00", 420, date(2026, 11, 16)) == "Aug 3"
    assert format_confirmed("2026-08-04 02:00:00", None, date(2026, 11, 16)) == "Aug 4"
    assert format_confirmed("2025-12-30 12:00:00", 0, date(2026, 11, 16)) == "Dec 30, 2025"
