"""#710 / DEC-031: a broad "What's still open?" answer shows the project's open Questions and pending Reviews.

The totals are counted by software from the whole project the request named (#709), never only the records the
answer used. No model calls: a fake Ask provider answers, and selects a single record on purpose.
"""
from __future__ import annotations

import json
import os
import socket
import tempfile
import uuid
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from ask_display import displayed_lines, open_work_line
from ask_software_answers import is_open_work_question
from db import connect
from test_baseline_setup_lifecycle import BaselineFixtureProvider

ASK_JS = Path(__file__).resolve().parent.parent / "implementation-context-prototype" / "context-ask.js"
NORTHSTAR = {"X-State-Project-Id": "northstar"}
JUNIPER = {"X-State-Project-Id": "juniper"}

SELECTION = {"job": "attention_check", "state_ids": [], "review_ids": ["demo-review-retention"],
             "blocking_question_ids": [], "question_ids": [], "history_ids": [], "evidence_ids": [],
             "answered_question_ids": []}
ANSWER = {"job": "attention_check",
          "claims": [{"text": "A Review about the retention terms is awaiting a decision.", "basis": "pending_review",
                      "primary_record_id": "demo-review-retention", "supporting_record_ids": []}],
          "sections": [], "source_ids": [], "uncertainty_ids": [], "suggested_refinements": [],
          "suggested_question": None}


class OneRecordAsk:
    """Answers every model-path question citing one Review, so the totals can't come from the selection."""

    def __init__(self):
        self.calls = 0

    def select(self, prompt):
        return deepcopy(SELECTION)

    def synthesize(self, prompt):
        self.calls += 1
        return deepcopy(ANSWER)

    def stream(self, prompt):
        self.calls += 1
        text = json.dumps({"selection": SELECTION, "answer": ANSWER})
        for start in range(0, len(text), 41):
            yield text[start:start + 41]


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("network attempted")

    monkeypatch.setattr(socket.socket, "connect", refuse)


@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request):
    if request.param == "sqlite":
        with tempfile.TemporaryDirectory() as tempdir:
            yield "sqlite://" + str(Path(tempdir) / "state.db")
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    schema = "test_open_work_" + uuid.uuid4().hex
    with connect(url) as admin:
        admin.execute(f"CREATE SCHEMA {schema}")
        admin.commit()
    separator = "&" if "?" in url else "?"
    try:
        yield f"{url}{separator}options=-csearch_path%3D{schema}"
    finally:
        with connect(url) as admin:
            admin.execute(f"DROP SCHEMA {schema} CASCADE")
            admin.commit()


@pytest.fixture
def client(db_url):
    settings = Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider(), ask_provider=OneRecordAsk())) as c:
        yield c


def _ask(client, query, headers=NORTHSTAR, previous_answer=None):
    body = {"query": query, **({"previous_answer": previous_answer} if previous_answer else {})}
    response = client.post("/api/ask", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["answer"]


def _stream(client, query, headers=NORTHSTAR):
    with client.stream("POST", "/api/ask/stream", json={"query": query}, headers=headers) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())
    final = [b for b in body.split("\n\n") if b.startswith("event: final")]
    assert final, body
    return json.loads(final[-1].split("data: ", 1)[1])["answer"]


def _totals(client, headers):
    questions = client.get("/api/questions", params={"status": "open"}, headers=headers).json()["items"]
    reviews = client.get("/api/reviews", params={"status": "open"}, headers=headers).json()["items"]
    return {"questions": len(questions), "reviews": len(reviews)}


# --- trigger -------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("query", [
    "What's still open?", "What’s unresolved?", "What's pending?", "What's outstanding?", "What's left to decide?",
    "What is still unresolved in this project?", "Is anything still open?", "Anything pending right now?",
    "What questions are still open?", "Which decisions are pending?", "List the open items", "What remains undecided?",
    "What's still to be decided?",
])
def test_broad_unresolved_work_requests_trigger(query):
    assert is_open_work_question(query)


@pytest.mark.parametrize("query", [
    "Is the vendor question still open?", "What's pending on the VIP carve-out?",
    "What's unresolved about the security review?", "Which Reviews are pending for retention?",
    "Should we open the pilot to Tier 2?", "What is the pilot budget?", "What's left?", "What changed recently?",
    "Is the retention Review still pending legal sign-off?", "Which items need a re-check?",
])
def test_questions_with_their_own_subject_do_not_trigger(query):
    assert not is_open_work_question(query)


# --- totals ------------------------------------------------------------------------------------------------------

def test_the_line_counts_the_whole_project_not_the_selected_record(client):
    expected = _totals(client, NORTHSTAR)
    assert expected["questions"] > 1 and expected["reviews"] > 1
    answer = _ask(client, "What's still open?")
    assert answer["open_work"] == expected
    assert _stream(client, "What's unresolved?")["open_work"] == expected


def test_the_line_comes_from_the_requesting_tabs_project(client):
    # The shared pointer stays on Northstar; the tab is on Juniper.
    assert client.get("/api/projects").json()["active"]["id"] == "northstar"
    expected = _totals(client, JUNIPER)
    assert expected != _totals(client, NORTHSTAR)
    assert _ask(client, "What's pending?", JUNIPER)["open_work"] == expected
    assert _stream(client, "What's pending?", JUNIPER)["open_work"] == expected


def test_a_review_proposing_a_question_counts_as_a_review_only(client):
    reviews = client.get("/api/reviews", params={"status": "open"}, headers=NORTHSTAR).json()["items"]
    proposing = [r for r in reviews if r.get("question_to_create")]
    assert proposing, "seed should have an open_question Review"
    question_ids = {q["id"] for q in client.get("/api/questions", params={"status": "open"}, headers=NORTHSTAR).json()["items"]}
    assert not {r["question_to_create"]["id"] for r in proposing} & question_ids
    assert _ask(client, "What's still open?")["open_work"]["reviews"] == len(reviews)


def test_an_empty_project_shows_both_zeros(client):
    project = client.post("/api/projects", json={"name": "Blank"}).json()
    answer = _ask(client, "What's still open?", {"X-State-Project-Id": project["id"]})
    assert answer["open_work"] == {"questions": 0, "reviews": 0}
    assert open_work_line(answer) == "No open Questions · No Reviews awaiting a decision"


def test_other_questions_carry_no_line(client):
    assert _ask(client, "What is the pilot budget?")["open_work"] is None
    assert _ask(client, "Is the vendor question still open?")["open_work"] is None


def test_a_refinement_keeps_the_line_recounted(client):
    first = _ask(client, "What's still open?")
    question_id = client.get("/api/questions", params={"status": "open"}, headers=NORTHSTAR).json()["items"][0]["id"]
    assert client.post(f"/api/questions/{question_id}/stop", headers=NORTHSTAR, json={}).status_code == 200
    shorter = _ask(client, "shorten it", previous_answer=first)
    assert shorter["open_work"] == {**first["open_work"], "questions": first["open_work"]["questions"] - 1}
    other = _ask(client, "What is the pilot budget?")
    assert _ask(client, "shorten it", previous_answer=other)["open_work"] is None


def test_the_count_is_fresh_not_a_cached_copy(client):
    before = _ask(client, "What's outstanding?")["open_work"]
    question_id = client.get("/api/questions", params={"status": "open"}, headers=NORTHSTAR).json()["items"][0]["id"]
    assert client.post(f"/api/questions/{question_id}/stop", headers=NORTHSTAR, json={}).status_code == 200
    assert _ask(client, "What's outstanding?")["open_work"]["questions"] == before["questions"] - 1


def test_a_deleted_project_is_refused_before_counting(client):
    project = client.post("/api/projects", json={"name": "Gone"}).json()
    assert client.delete(f"/api/projects/{project['id']}").status_code == 200
    response = client.post("/api/ask", json={"query": "What's still open?"}, headers={"X-State-Project-Id": project["id"]})
    assert response.status_code == 404 and response.json()["detail"]["code"] == "project_unavailable"


# --- wording -----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("work,line", [
    ({"questions": 3, "reviews": 2}, "3 open Questions · 2 Reviews awaiting a decision"),
    ({"questions": 1, "reviews": 1}, "1 open Question · 1 Review awaiting a decision"),
    ({"questions": 0, "reviews": 2}, "No open Questions · 2 Reviews awaiting a decision"),
    ({"questions": 4, "reviews": 0}, "4 open Questions · No Reviews awaiting a decision"),
])
def test_line_wording(work, line):
    assert open_work_line({"open_work": work}) == line


def test_copy_puts_the_line_right_after_the_headline_and_evals_never_read_it():
    answer = {"headline": "What needs attention", "open_work": {"questions": 3, "reviews": 2},
              "claims": [{"text": "A Review is awaiting a decision.", "basis": "pending_review", "label": "Pending Review"}]}
    lines = displayed_lines(answer)
    assert lines[:2] == ["What needs attention", "3 open Questions · 2 Reviews awaiting a decision"]
    assert "3 open Questions · 2 Reviews awaiting a decision" not in displayed_lines(answer, labels=False)


def test_the_browser_uses_the_same_wording():
    source = ASK_JS.read_text()
    for phrase in ("No open Questions", "No Reviews awaiting a decision", " awaiting a decision`", "open ${w.questions===1?'Question':'Questions'}"):
        assert phrase in source, phrase
