from __future__ import annotations

from copy import deepcopy

from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data
from ask_service import run_ask


class FakeAskProvider:
    def __init__(self, selection=None, answer=None, fail=False):
        self.selection = selection or {
            "job": "meeting_prep",
            "state_ids": ["k-data", "k-security", "k-pilot"],
            "review_ids": [],  # service must add linked retention review
            "blocking_question_ids": ["q-retention"],
            "question_ids": ["q-ask-named-access", "q-ask-expansion-owner"],
            "history_ids": ["demo-history-data-boundary"],
            "evidence_ids": ["ask-evidence-security-meeting", "ask-evidence-vendor-retention"],
        }
        self.answer = answer or {
            "job": "meeting_prep",
            "headline": "Security meeting prep",
            "summary": "The pilot is bounded and human-reviewed, while vendor retention authority still needs a decision.",
            "sections": [
                {"kind": "established", "title": "Decisions already made", "items": [
                    {"text": "The pilot remains read-only and human-reviewed.", "record_type": "state", "record_id": "k-data", "detail": None}
                ]},
                {"kind": "questions", "title": "Get these answered", "items": [
                    {"text": "Does security require named-agent access for the full pilot?", "record_type": "question", "record_id": "q-ask-named-access", "detail": None}
                ]},
            ],
            "source_ids": ["k-data", "ask-evidence-security-meeting"],
            "uncertainty_ids": ["q-retention"],
            "suggested_refinements": ["Turn into agenda", "Make shorter"],
        }
        self.fail = fail
        self.prompts = []

    def select(self, prompt):
        self.prompts.append(("select", prompt))
        if self.fail:
            raise RuntimeError("selector down")
        return deepcopy(self.selection)

    def synthesize(self, prompt):
        self.prompts.append(("synthesize", prompt))
        if self.fail:
            raise RuntimeError("synthesis down")
        return deepcopy(self.answer)


def seeded_connection(tmp_path):
    url = f"sqlite://{tmp_path / 'state.db'}"
    conn = connect(url)
    initialize_db(conn)
    bootstrap_demo_data(conn)
    return conn


def test_ask_adversarial_seed_is_idempotent_and_linked(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        second = bootstrap_demo_data(conn)
        assert second["evidence"] == 0
        assert second["rules"] == 0
        for eid in [
            "ask-evidence-security-meeting", "ask-evidence-vendor-retention",
            "ask-evidence-retrieval-test", "ask-evidence-demo-noise", "ask-evidence-tier2-slack",
        ]:
            assert conn.execute("SELECT id FROM evidence WHERE id=?", (eid,)).fetchone()
        rule = conn.execute("SELECT statement FROM project_rules WHERE id='rule-ask-slack-authority'").fetchone()
        assert "not authoritative approval" in rule["statement"]
        assert conn.execute(
            "SELECT 1 FROM review_evidence WHERE review_id='demo-review-retention' AND evidence_id='ask-evidence-vendor-retention'"
        ).fetchone()
        assert conn.execute(
            "SELECT 1 FROM review_state_items WHERE review_id='demo-review-retention' AND state_item_id='k-data'"
        ).fetchone()
        assert conn.execute(
            "SELECT 1 FROM review_questions WHERE review_id='demo-review-retention' AND question_id='q-retention'"
        ).fetchone()
        # Deliberate absence trap: nothing in the project establishes a deletion-processing SLA.
        assert not conn.execute("SELECT id FROM evidence WHERE lower(content) LIKE '%deletion sla%'").fetchone()
    finally:
        conn.close()


def test_ask_meeting_prep_enforces_review_and_blocker_visibility(tmp_path):
    conn = seeded_connection(tmp_path)
    provider = FakeAskProvider()
    try:
        result = run_ask(conn, provider, "Prep me for the security meeting.")
        selection = result["selection"]
        assert "demo-review-retention" in selection["review_ids"]  # auto-added from selected k-data
        answer = result["answer"]
        review_items = [i for s in answer["sections"] for i in s["items"] if i["record_type"] == "review"]
        assert any(i["record_id"] == "demo-review-retention" for i in review_items)
        blocker_items = [i for s in answer["sections"] for i in s["items"] if i["record_type"] == "blocking_question"]
        blocker = next(i for i in blocker_items if i["record_id"] == "q-retention")
        assert blocker["detail"] == "Security approval for pilot data flow"
        # Negative relevance: the selector did not choose recent demo-copy noise.
        assert "ask-evidence-demo-noise" not in selection["evidence_ids"]
        assert result["open_items_remaining"]["count"] > 0
    finally:
        conn.close()


def test_ask_selector_cannot_invent_blocker_status(tmp_path):
    conn = seeded_connection(tmp_path)
    provider = FakeAskProvider(selection={
        "job": "meeting_prep",
        "state_ids": ["k-security"],
        "review_ids": [],
        "blocking_question_ids": ["q-ask-named-access"],  # ordinary question, invalid here
        "question_ids": [],
        "history_ids": [],
        "evidence_ids": ["ask-evidence-security-meeting"],
    })
    try:
        result = run_ask(conn, provider, "Prep me for security")
        assert result["selection"]["blocking_question_ids"] == []
        assert not any(
            i["record_type"] == "blocking_question" and i["record_id"] == "q-ask-named-access"
            for s in result["answer"]["sections"] for i in s["items"]
        )
    finally:
        conn.close()


def test_api_ask_vertical_slice_uses_injected_provider(tmp_path):
    provider = FakeAskProvider()
    settings = Settings(database_path=str(tmp_path / "api.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=provider)
    with TestClient(app) as client:
        response = client.post("/api/ask", json={"query": "Prep me for the security meeting."})
        assert response.status_code == 200
        payload = response.json()
        assert payload["answer"]["job"] == "meeting_prep"
        assert "demo-review-retention" in payload["selection"]["review_ids"]
        assert len(provider.prompts) == 2


def test_api_ask_fails_closed_when_provider_fails(tmp_path):
    provider = FakeAskProvider(fail=True)
    settings = Settings(database_path=str(tmp_path / "api.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=provider)
    with TestClient(app) as client:
        response = client.post("/api/ask", json={"query": "Prep me for the security meeting."})
        assert response.status_code == 503
        assert "temporarily unavailable" in response.json()["detail"]

class FakeOneCallAskProvider:
    def __init__(self):
        self.calls = []

    def run(self, prompt):
        self.calls.append(prompt)
        return {
            "selection": {
                "job": "meeting_prep",
                "state_ids": ["k-data", "k-security", "k-pilot"],
                "review_ids": [],
                "blocking_question_ids": ["q-retention"],
                "question_ids": ["q-ask-named-access"],
                "history_ids": ["demo-history-data-boundary"],
                "evidence_ids": ["ask-evidence-security-meeting"],
            },
            "answer": {
                "job": "meeting_prep",
                "headline": "Security meeting prep",
                "summary": "The pilot remains bounded and human-reviewed; retention authority still needs resolution.",
                "sections": [
                    {"kind": "established", "title": "Decisions already made", "items": [
                        {"text": "The pilot remains read-only.", "record_type": "state", "record_id": "k-data", "detail": None}
                    ]},
                    {"kind": "questions", "title": "Get these answered", "items": [
                        {"text": "Does security require named-agent access?", "record_type": "question", "record_id": "q-ask-named-access", "detail": None}
                    ]},
                ],
                "source_ids": ["k-data", "ask-evidence-security-meeting"],
                "uncertainty_ids": ["q-retention"],
                "suggested_refinements": ["Turn into agenda"],
            },
        }


def test_ask_r91_one_call_pipeline_preserves_authority_guards(tmp_path):
    conn = seeded_connection(tmp_path)
    provider = FakeOneCallAskProvider()
    try:
        result = run_ask(conn, provider, "Prep me for the security meeting.")
        assert len(provider.calls) == 1
        assert result["timing"]["pipeline"] == "one_call"
        assert result["timing"]["provider_ms"] >= 0
        assert result["timing"]["total_ms"] >= result["timing"]["provider_ms"]
        assert "demo-review-retention" in result["selection"]["review_ids"]
        review_ids = [i["record_id"] for s in result["answer"]["sections"] for i in s["items"] if i["record_type"] == "review"]
        assert "demo-review-retention" in review_ids
        blocker = next(i for s in result["answer"]["sections"] for i in s["items"] if i["record_type"] == "blocking_question")
        assert blocker["record_id"] == "q-retention"
        assert blocker["detail"] == "Security approval for pilot data flow"
    finally:
        conn.close()


def test_api_r91_one_call_provider_is_invoked_once(tmp_path):
    provider = FakeOneCallAskProvider()
    settings = Settings(database_path=str(tmp_path / "api-r91.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=provider)
    with TestClient(app) as client:
        response = client.post("/api/ask", json={"query": "Prep me for the security meeting."})
        assert response.status_code == 200
        payload = response.json()
        assert payload["timing"]["pipeline"] == "one_call"
        assert len(provider.calls) == 1
