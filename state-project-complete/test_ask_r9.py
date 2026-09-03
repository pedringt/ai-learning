from __future__ import annotations

from copy import deepcopy

from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data
from ask_service import run_ask, _selection_from_raw


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


def test_r92_security_meeting_context_is_bounded_and_omits_demo_noise(tmp_path):
    from ask_service import _compact_candidates, _trim_candidates_for_query
    conn = seeded_connection(tmp_path)
    try:
        full = _compact_candidates(conn)
        trimmed = _trim_candidates_for_query("Prep me for the security meeting.", full)
        assert len(trimmed["state"]) <= 14
        assert len(trimmed["questions"]) <= 12
        assert len(trimmed["evidence"]) <= 12
        assert not any(x["id"] == "ask-evidence-demo-noise" for x in trimmed["evidence"])
        assert any(x["id"] == "ask-evidence-security-meeting" for x in trimmed["evidence"])
        assert any(x["id"] == "demo-review-retention" for x in trimmed["reviews"])
    finally:
        conn.close()


def test_r92_meeting_prep_merges_repeated_sections_caps_state_and_cleans_blocks_prefix(tmp_path):
    provider = FakeOneCallAskProvider()
    provider.run = lambda prompt: {
        "selection": {
            "job": "meeting_prep", "state_ids": ["k-data", "k-security", "k-pilot", "k-sensitive"],
            "review_ids": ["demo-review-retention"], "blocking_question_ids": ["q-retention"],
            "question_ids": ["q-ask-named-access"], "history_ids": [], "evidence_ids": ["ask-evidence-security-meeting"]
        },
        "answer": {
            "job": "meeting_prep", "headline": "Security meeting prep", "summary": "A concise security briefing.",
            "sections": [
                {"kind":"established","title":"Security Boundaries Holding Firm","items":[
                    {"text":"Data is read-only.","record_type":"state","record_id":"k-data","detail":None},
                    {"text":"Human review remains required.","record_type":"state","record_id":"k-security","detail":None}]},
                {"kind":"established","title":"Evaluation and Access Authority in Focus","items":[
                    {"text":"Pilot remains bounded.","record_type":"state","record_id":"k-pilot","detail":None},
                    {"text":"Sensitive actions are excluded.","record_type":"state","record_id":"k-sensitive","detail":None}]},
                {"kind":"questions","title":"Critical Blockers","items":[
                    {"text":"What are the retention terms?","record_type":"blocking_question","record_id":"q-retention","detail":"Blocks: Security approval for pilot data flow"}]},
                {"kind":"questions","title":"Questions to Clarify","items":[
                    {"text":"What are the retention terms?","record_type":"blocking_question","record_id":"q-retention","detail":"Security approval for pilot data flow"},
                    {"text":"Does security require named access?","record_type":"question","record_id":"q-ask-named-access","detail":None}]},
                {"kind":"needs_review","title":"Open Reviews Qualifying Current State","items":[
                    {"text":"Confirm vendor retention authority.","record_type":"review","record_id":"demo-review-retention","detail":"Pending authority decision"}]}
            ],
            "source_ids":["k-data","k-security","k-pilot","k-sensitive","q-retention","q-ask-named-access","demo-review-retention"],
            "uncertainty_ids":["q-retention","demo-review-retention"], "suggested_refinements":["Make shorter"]
        }
    }
    conn = seeded_connection(tmp_path)
    try:
        result = run_ask(conn, provider, "Prep me for the security meeting.")
        answer = result["answer"]
        assert len(answer["sections"]) <= 4
        established = [s for s in answer["sections"] if s["kind"] == "established"]
        assert len(established) == 1
        assert established[0]["title"] == "Useful context"
        assert len(established[0]["items"]) == 3
        blockers = [i for s in answer["sections"] for i in s["items"] if i["record_type"] == "blocking_question"]
        assert len([i for i in blockers if i["record_id"] == "q-retention"]) == 1
        assert blockers[0]["detail"] == "Security approval for pilot data flow"
    finally:
        conn.close()

class FakeFastMeetingProvider(FakeOneCallAskProvider):
    def __init__(self):
        super().__init__()
        self.fast_prompts = []

    def synthesize_selected(self, prompt):
        self.fast_prompts.append(prompt)
        return deepcopy(self.run("seed")["answer"])


def test_r94_explicit_meeting_prep_uses_deterministic_selection_fast_path(tmp_path):
    from ask_service import _compact_candidates, _trim_candidates_for_query, _one_call_prompt
    conn = seeded_connection(tmp_path)
    provider = FakeFastMeetingProvider()
    try:
        query = "Prep me for the security meeting."
        candidates = _trim_candidates_for_query(query, _compact_candidates(conn))
        legacy_prompt_chars = len(_one_call_prompt(query, candidates, None))
        result = run_ask(conn, provider, query)

        assert result["timing"]["pipeline"] == "deterministic_select_one_call"
        assert len(provider.fast_prompts) == 1
        assert len(provider.fast_prompts[0]) < legacy_prompt_chars * 0.65
        assert "demo-review-retention" in result["selection"]["review_ids"]
        assert "q-retention" in result["selection"]["blocking_question_ids"]
        assert "ask-evidence-demo-noise" not in result["selection"]["evidence_ids"]
    finally:
        conn.close()


def test_r94_general_ask_keeps_model_selection_path(tmp_path):
    conn = seeded_connection(tmp_path)
    provider = FakeFastMeetingProvider()
    try:
        result = run_ask(conn, provider, "What changed about pilot scope?")
        assert result["timing"]["pipeline"] == "one_call"
        assert len(provider.fast_prompts) == 0
        assert len(provider.calls) == 1
    finally:
        conn.close()

class FakeInvalidFastMeetingProvider(FakeFastMeetingProvider):
    def synthesize_selected(self, prompt):
        self.fast_prompts.append(prompt)
        # Simulates truncated/malformed structured output that cannot satisfy
        # the Ask answer contract.
        return {"job": "meeting_prep", "headline": "Incomplete"}


def test_r94_invalid_fast_answer_falls_back_to_proven_one_call_path(tmp_path):
    conn = seeded_connection(tmp_path)
    provider = FakeInvalidFastMeetingProvider()
    try:
        result = run_ask(conn, provider, "Prep me for the security meeting.")
        assert result["timing"]["pipeline"] == "fast_path_fallback_one_call"
        assert len(provider.fast_prompts) == 1
        assert len(provider.calls) == 1
        assert result["answer"]["job"] == "meeting_prep"
        assert result["answer"]["headline"]
    finally:
        conn.close()


def test_openai_ask_uses_json_schema_structured_output():
    from types import SimpleNamespace
    from ask_provider import LiveAskProvider

    calls = []
    class Completions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"job":"meeting_prep","headline":"Ready","summary":"Summary","sections":[],"source_ids":[],"uncertainty_ids":[],"suggested_refinements":[]}'))])
    provider = SimpleNamespace(
        name="openai",
        model_identifier="gpt-4.1-mini",
        client=SimpleNamespace(chat=SimpleNamespace(completions=Completions())),
    )
    result = LiveAskProvider(provider).synthesize_selected("prompt")
    assert result["job"] == "meeting_prep"
    assert calls[0]["model"] == "gpt-4.1-mini"
    assert calls[0]["response_format"]["type"] == "json_schema"
    assert calls[0]["response_format"]["json_schema"]["strict"] is True
    assert "Return JSON only" not in calls[0]["messages"][0]["content"]


def test_openai_model_env_selects_benchmark_model(monkeypatch):
    import api
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
    settings = api.Settings(database_path=":memory:", provider="openai")
    provider = api._provider_from_env(settings)
    assert provider.name == "openai"
    assert provider.model_identifier == "gpt-4.1-mini"


def test_ask_provider_over_selection_is_bounded_before_contract_validation(tmp_path):
    conn = seeded_connection(tmp_path)
    try:
        rows = conn.execute("SELECT id FROM current_state_items ORDER BY id").fetchall()
        all_state_ids = [row["id"] for row in rows]
        preferred = ["k-data", "k-security", "k-pilot"]
        overlong = preferred + [sid for sid in all_state_ids if sid not in preferred][:10]
        assert len(overlong) == 13
        provider = FakeAskProvider(selection={
            "job": "meeting_prep",
            "state_ids": overlong,
            "review_ids": [],
            "blocking_question_ids": ["q-retention"],
            "question_ids": [],
            "history_ids": [],
            "evidence_ids": ["ask-evidence-security-meeting"],
        })
        normalized = _selection_from_raw(provider.selection)
        assert len(normalized.state_ids) == 12
        assert normalized.state_ids == overlong[:12]
        result = run_ask(conn, provider, "Summarize the project for the security meeting.")
        assert len(result["selection"]["state_ids"]) <= 12
    finally:
        conn.close()


def test_selector_json_schema_declares_contract_cardinality_limits():
    from ask_contract import SELECTOR_JSON_SCHEMA

    props = SELECTOR_JSON_SCHEMA["properties"]
    assert props["state_ids"]["maxItems"] == 12
    assert props["review_ids"]["maxItems"] == 8
    assert props["blocking_question_ids"]["maxItems"] == 8
    assert props["question_ids"]["maxItems"] == 10
    assert props["history_ids"]["maxItems"] == 12
    assert props["evidence_ids"]["maxItems"] == 12
