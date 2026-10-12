"""Characterization tests for how ``api`` composes Baseline Setup into State (#502).

These pin the behaviour of the composed deployment app, not of any one module,
so they must pass unchanged whether the composition is done by runtime patches
or by explicit extension points. Each test names the adapter it pins.

The provider-stack tests drive the real Anthropic adapter classes end to end
(route -> composed process_evidence -> fact recovery -> Baseline chunking ->
max_tokens resilience -> base adapter -> prompt builder) with a fake Messages
client, so no model is ever called.
"""
from __future__ import annotations

import json
import os
import socket
import uuid
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import anthropic_provider
import api
import api_core
import ask_service
import baseline_async_intake
import baseline_setup
import database_migration_backed
import review_service
import seed_demo
from db import connect
from test_baseline_setup_lifecycle import BaselineFixtureProvider

QUALITY_TAG = "<baseline_setup_quality_checks>"
RECOVERY_TAG = "<baseline_fact_recovery>"
SETUP_MODE_TAG = "<baseline_setup_mode>"


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("network attempted")

    monkeypatch.setattr(socket.socket, "connect", refuse)


@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request):
    """Each test runs on SQLite and, when STATE_TEST_POSTGRES_URL is set, on its own Postgres schema."""
    if request.param == "sqlite":
        with tempfile.TemporaryDirectory() as tempdir:
            yield "sqlite://" + str(Path(tempdir) / "state.db")
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    schema = "test_composition_" + uuid.uuid4().hex
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


def _settings(url):
    return api.Settings(database_url=url, cors_origins=[], demo_bootstrap=True)


def _create_project(client, name="Composition Test"):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["id"]


# --- fake Anthropic Messages client -------------------------------------------------------------


def _fact_payload(statement, *, area=None, topic=None):
    proposal = {
        "operation": "create",
        "proposed_statement": statement,
        "rationale": "The Evidence states this directly.",
    }
    if area is not None:
        proposal["proposed_area_name"] = area
        proposal["proposed_topic"] = topic or "Fact"
    return {
        "summary": "The evidence establishes a durable baseline fact.",
        "topics": ["baseline"],
        "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create",
            "review_type": "missing_understanding",
            "decision_question": f"Should Current State record: {statement}?",
            "why_consequential": "The fact is needed to understand the project baseline.",
            "affected_state_item_ids": [],
            "proposed_changes": [proposal],
        }],
    }


def _question_payload(question):
    return {
        "summary": "The evidence states an unresolved product question.",
        "topics": ["product questions"],
        "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create",
            "review_type": "open_question",
            "decision_question": question,
            "why_consequential": "The question is not settled.",
            "affected_state_item_ids": [],
            "proposed_changes": [],
        }],
    }


_NO_REVIEW = {
    "summary": "Nothing consequential.",
    "topics": [],
    "outcome": "no_review",
    "review_recommendations": [],
    "no_review_explanation": "Preamble only.",
}


class _FakeMessages:
    def __init__(self, respond):
        self.respond = respond
        self.prompts: list[str] = []

    def create(self, **kwargs):
        prompt = kwargs["messages"][0]["content"]
        self.prompts.append(prompt)
        stop_reason, payload = self.respond(prompt, len(self.prompts))
        return SimpleNamespace(
            content=[SimpleNamespace(text=json.dumps(payload))],
            stop_reason=stop_reason,
            usage=SimpleNamespace(input_tokens=1, output_tokens=1),
        )


def _with_fake_client(provider, respond):
    messages = _FakeMessages(respond)
    provider._client = SimpleNamespace(messages=messages)
    return messages


def _baseline_anthropic_provider(monkeypatch):
    """The provider the deployed app builds from the environment (composed factory)."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-not-a-key")
    return api_core._provider_from_env(SimpleNamespace(provider="anthropic"))


def _submit(client, project_id, content):
    return client.post(
        "/api/evidence",
        headers={"X-State-Project-Id": project_id},
        json={"content": content, "source_type": "manual_note"},
    )


def _coverage_rows(url, evidence_id):
    connection = connect(url)
    try:
        return [dict(row) for row in connection.execute(
            "SELECT chunk_count, represented_chunks, unrepresented_chunks FROM baseline_evidence_coverage "
            "WHERE evidence_id=?",
            (evidence_id,),
        ).fetchall()]
    finally:
        connection.close()


def _draft_items(client, project_id):
    response = client.get("/api/baseline/draft", headers={"X-State-Project-Id": project_id})
    assert response.status_code == 200, response.text
    return response.json()["draft"]["items"]


# --- install_baseline_extensions: provider factory ----------------------------------------------


def test_composed_provider_factory_builds_the_baseline_anthropic_provider(monkeypatch, db_url):
    provider = _baseline_anthropic_provider(monkeypatch)
    assert type(provider).__name__ == "BaselineAnthropicProvider"
    assert isinstance(provider, anthropic_provider.AnthropicProvider)

    # The app's lifespan and the async Baseline intake both use the composed factory.
    with TestClient(api.create_app(settings=_settings(db_url))) as client:
        assert type(client.app.state.provider).__name__ == "BaselineAnthropicProvider"
        client.app.state.provider = None
        selected = baseline_async_intake._selected_provider(client.app, client.app.state.settings)
        assert type(selected).__name__ == "BaselineAnthropicProvider"


# --- install_baseline_extensions: process_evidence and resolve_review ---------------------------


def test_sync_evidence_route_persists_baseline_metadata_and_accept_organizes_the_fact(db_url):
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)
        headers = {"X-State-Project-Id": project_id}
        created = _submit(client, project_id, "First baseline note about what State is.")
        assert created.status_code == 201, created.text
        evidence_id = created.json()["evidence_id"]
        assert _coverage_rows(db_url, evidence_id) == [
            {"chunk_count": 1, "represented_chunks": 1, "unrepresented_chunks": 0}
        ]

        review_id = _draft_items(client, project_id)[0]["review_id"]
        accepted = client.post(f"/api/reviews/{review_id}/resolve", headers=headers, json={"decision": "accept"})
        assert accepted.status_code == 200, accepted.text
        state = client.get("/api/state", headers=headers).json()["items"]
        assert [(item["area_name"], item["topic"]) for item in state] == [("Product", "Purpose")]


def test_async_baseline_intake_runs_the_composed_process_evidence(db_url):
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)
        queued = client.post(
            "/api/baseline/evidence",
            headers={"X-State-Project-Id": project_id},
            json={"content": "First baseline note about what State is."},
        )
        assert queued.status_code == 202, queued.text
        evidence_id = queued.json()["evidence_id"]
        assert _coverage_rows(db_url, evidence_id) == [
            {"chunk_count": 1, "represented_chunks": 1, "unrepresented_chunks": 0}
        ]
        assert _draft_items(client, project_id)[0]["area_name"] == "Product"


def test_manual_starting_state_runs_the_composed_process_evidence(db_url):
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)
        created = client.post(
            "/api/baseline/manual",
            headers={"X-State-Project-Id": project_id},
            json={"items": [{"statement": "State is a portfolio project.", "area_name": "Scope", "topic": "Boundary"}]},
        )
        assert created.status_code == 201, created.text
        assert len(_coverage_rows(db_url, created.json()["evidence_id"])) == 1
        assert _draft_items(client, project_id)[0]["area_name"] == "Scope"


def test_baseline_migration_is_expected_exactly_once():
    assert database_migration_backed._EXPECTED_MIGRATIONS.count("015_baseline_setup.sql") == 1


# --- prompt hardening + fact recovery: prompt guidance order ------------------------------------


def _guidance(url, project_id, **evidence_extra):
    connection = connect(url)
    try:
        connection.project_id = project_id
        return baseline_setup.baseline_prompt_guidance(
            connection, {"id": "evidence_prompt", "content": "Starting material", **evidence_extra}
        )
    finally:
        connection.close()


def test_prompt_guidance_layers_apply_in_order(db_url):
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)

    plain = _guidance(db_url, project_id)
    assert plain.index(SETUP_MODE_TAG) < plain.index(QUALITY_TAG)
    assert RECOVERY_TAG not in plain

    recovery = _guidance(db_url, project_id, _state_baseline_fact_recovery=True)
    assert recovery.index(SETUP_MODE_TAG) < recovery.index(QUALITY_TAG) < recovery.index(RECOVERY_TAG)

    # Outside Baseline Setup: no setup mode, no quality checks; the recovery flag alone still appends.
    assert _guidance(db_url, "northstar") == ""
    assert _guidance(db_url, "northstar", _state_baseline_fact_recovery=True).startswith(RECOVERY_TAG)


# --- dogfood fixes ------------------------------------------------------------------------------


def test_section_aware_splitter_is_what_baseline_setup_exposes():
    source = "Notes\n\n1. Product overview\nAlpha.\n\n2. Product principles\nBravo.\n"
    assert baseline_setup.split_evidence_text(source, max_chars=5000) == [
        "Notes",
        "1. Product overview\nAlpha.",
        "2. Product principles\nBravo.",
    ]


def test_project_delete_clears_baseline_coverage_before_evidence(db_url):
    assert seed_demo._PROJECT_DEPENDENT_TABLES[0][0] == "baseline_evidence_coverage"
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)
        evidence_id = _submit(client, project_id, "First baseline note about what State is.").json()["evidence_id"]
        assert _coverage_rows(db_url, evidence_id)
        deleted = client.delete(f"/api/projects/{project_id}", headers={"X-State-Project-Id": project_id})
        assert deleted.status_code == 200, deleted.text
        assert _coverage_rows(db_url, evidence_id) == []


def test_background_analysis_skips_a_deleted_project(db_url):
    class FailIfCalled:
        name = "fail"
        model_identifier = "fail"

        def interpret(self, **_kwargs):
            raise AssertionError("provider must not be called")

    settings = _settings(db_url)
    with TestClient(api.create_app(settings=settings)):
        pass
    baseline_async_intake._analyze_in_background(settings, FailIfCalled(), "project_gone", "evidence_gone")


# --- review visibility --------------------------------------------------------------------------


def test_routine_starting_state_reviews_are_hidden_from_api_and_ask_but_not_from_raw_rows(db_url):
    with TestClient(api.create_app(settings=_settings(db_url), provider=BaselineFixtureProvider())) as client:
        project_id = _create_project(client)
        headers = {"X-State-Project-Id": project_id}
        _submit(client, project_id, "First baseline note about what State is.")
        assert client.get("/api/reviews", headers=headers).json()["items"] == []

    connection = connect(db_url)
    try:
        connection.project_id = project_id
        assert len(review_service.list_reviews(connection, "open")) == 1
        assert api_core.list_reviews(connection, "open") == []
        assert ask_service._compact_candidates(connection)["reviews"] == []
    finally:
        connection.close()


# --- provider stack: dogfood splitter + hardening + resilience + fact recovery ------------------


def test_baseline_provider_chunks_by_source_section_with_quality_guidance(monkeypatch, db_url):
    provider = _baseline_anthropic_provider(monkeypatch)
    markers = {"ZXALPHA": "Alpha is durable.", "ZXBRAVO": "Bravo is durable.", "ZXCHARLIE": "Charlie is durable."}

    def respond(prompt, _call):
        for marker, statement in markers.items():
            if marker in prompt:
                return "end_turn", _fact_payload(statement, area="Product", topic=marker)
        return "end_turn", _NO_REVIEW

    messages = _with_fake_client(provider, respond)
    source = (
        "Project notes\n\n1. Product overview\nZXALPHA fact.\n\n"
        "2. Product principles\nZXBRAVO fact.\n\n3. Technical approach\nZXCHARLIE fact.\n"
    )
    with TestClient(api.create_app(settings=_settings(db_url), provider=provider)) as client:
        project_id = _create_project(client)
        created = _submit(client, project_id, source)
        assert created.status_code == 201, created.text
        statements = sorted(item["statement"] for item in _draft_items(client, project_id))
        assert _coverage_rows(db_url, created.json()["evidence_id"]) == [
            {"chunk_count": 4, "represented_chunks": 3, "unrepresented_chunks": 1}
        ]

    assert len(messages.prompts) == 4
    assert all(QUALITY_TAG in prompt and RECOVERY_TAG not in prompt for prompt in messages.prompts)
    assert [f"chunk {i} of 4" in prompt for i, prompt in enumerate(messages.prompts, start=1)] == [True] * 4
    assert statements == sorted(markers.values())


def _two_paragraph_source(marker):
    """Two equal paragraphs (~730 chars each): one retry split yields exactly these two pieces."""
    body = " ".join(["durable"] * 90) + "."
    return f"{marker}ONE {body}\n\n{marker}TWO {body}"


def test_baseline_provider_retries_a_max_tokens_chunk_in_smaller_pieces(monkeypatch, db_url):
    provider = _baseline_anthropic_provider(monkeypatch)

    def respond(_prompt, call):
        if call == 1:
            return "max_tokens", _NO_REVIEW
        return "end_turn", _fact_payload(f"Piece {call} is durable.", area="Product", topic="Piece")

    messages = _with_fake_client(provider, respond)
    with TestClient(api.create_app(settings=_settings(db_url), provider=provider)) as client:
        project_id = _create_project(client)
        created = _submit(client, project_id, _two_paragraph_source("ZXRETRY"))
        assert created.status_code == 201, created.text
        statements = sorted(item["statement"] for item in _draft_items(client, project_id))

    assert len(messages.prompts) == 3
    assert "ZXRETRYONE" in messages.prompts[0] and "ZXRETRYTWO" in messages.prompts[0]
    assert "ZXRETRYONE" in messages.prompts[1] and "ZXRETRYTWO" not in messages.prompts[1]
    assert "ZXRETRYONE" not in messages.prompts[2] and "ZXRETRYTWO" in messages.prompts[2]
    assert all(QUALITY_TAG in prompt for prompt in messages.prompts)
    assert statements == ["Piece 2 is durable.", "Piece 3 is durable."]


def test_plain_anthropic_adapter_also_retries_on_a_baseline_project(monkeypatch, db_url):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-not-a-key")
    provider = anthropic_provider.AnthropicProvider()

    def respond(_prompt, call):
        if call == 1:
            return "max_tokens", _NO_REVIEW
        return "end_turn", _fact_payload(f"Piece {call} is durable.")

    messages = _with_fake_client(provider, respond)
    with TestClient(api.create_app(settings=_settings(db_url), provider=provider)) as client:
        project_id = _create_project(client)
        assert _submit(client, project_id, _two_paragraph_source("ZXPLAIN")).status_code == 201
    assert len(messages.prompts) == 3


def test_max_tokens_is_not_retried_outside_baseline_setup(monkeypatch, db_url):
    provider = _baseline_anthropic_provider(monkeypatch)
    messages = _with_fake_client(provider, lambda _prompt, _call: ("max_tokens", _NO_REVIEW))
    with TestClient(api.create_app(settings=_settings(db_url), provider=provider)) as client:
        response = _submit(client, "northstar", _two_paragraph_source("ZXNORTH"))
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "provider_error"
    assert len(messages.prompts) == 1
    assert QUALITY_TAG not in messages.prompts[0]


def test_baseline_provider_recovers_facts_when_the_first_pass_found_only_questions(monkeypatch, db_url):
    provider = _baseline_anthropic_provider(monkeypatch)

    def respond(prompt, _call):
        if RECOVERY_TAG in prompt:
            return "end_turn", _fact_payload("Recovered fact is durable.", area="Recovered", topic="Fact")
        return "end_turn", _question_payload("Which launch date is current?")

    messages = _with_fake_client(provider, respond)
    source = " ".join(["State keeps a durable record of the project baseline."] * 26) + " Which launch date is current?"
    assert 1200 <= len(source) <= 2600
    with TestClient(api.create_app(settings=_settings(db_url), provider=provider)) as client:
        project_id = _create_project(client)
        created = _submit(client, project_id, source)
        assert created.status_code == 201, created.text
        review_types = [review["review_type"] for review in created.json()["reviews"]]
        items = _draft_items(client, project_id)

    assert len(messages.prompts) == 2
    assert RECOVERY_TAG not in messages.prompts[0]
    assert messages.prompts[1].index(QUALITY_TAG) < messages.prompts[1].index(RECOVERY_TAG)
    assert review_types == ["open_question"]
    assert [(item["statement"], item["area_name"]) for item in items] == [("Recovered fact is durable.", "Recovered")]


# --- public module contract ---------------------------------------------------------------------


def test_public_entrypoints_expose_the_composed_app():
    import baseline_api

    for application in (api.app, api.create_app(), baseline_api.app, baseline_api.create_app()):
        paths = {route.path for route in application.routes}
        for path in ("/api/baseline", "/api/baseline/draft", "/api/baseline/evidence", "/api/baseline/manual",
                     "/api/evidence", "/api/ask", "/api/attention"):
            assert path in paths
    assert baseline_api.Settings is api.Settings


# --- explicit composition (#502) ----------------------------------------------------------------


def test_composition_declares_every_layer_once_in_order():
    from baseline_composition import compose_baseline_runtime

    compose_baseline_runtime()  # idempotent: a second call adds nothing
    assert api_core.process_evidence.layers == ("baseline_metadata",)
    assert api_core.resolve_review.layers == ("baseline_organization",)
    assert api_core._provider_from_env.layers == ("baseline_providers",)
    assert baseline_setup.split_evidence_text.layers == ("section_aware",)
    assert baseline_setup.baseline_prompt_guidance.layers == ("quality_checks", "fact_recovery")
    assert baseline_setup.baseline_interpret.layers == ("fact_recovery",)
    assert review_service.list_presented_reviews.layers == ("baseline_actionable",)
    assert anthropic_provider.interpret_call.layers == ("baseline_max_tokens_retry",)


def test_api_is_an_ordinary_module_not_an_alias_of_api_core():
    assert api is not api_core
    assert api.create_app is not api_core.create_app
    assert api.Settings is api_core.Settings


def test_extension_point_layers_wrap_in_order_and_ignore_repeats():
    from extension_points import ExtensionPoint

    point = ExtensionPoint("demo", lambda value: [value])
    assert point.add_layer("a", lambda inner: lambda value: inner(value) + ["a"])
    assert point.add_layer("b", lambda inner: lambda value: inner(value) + ["b"])
    assert not point.add_layer("a", lambda inner: lambda value: ["replaced"])
    assert point(0) == [0, "a", "b"]
    assert point.layers == ("a", "b")
