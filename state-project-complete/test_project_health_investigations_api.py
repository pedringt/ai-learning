"""Project Health investigation records (DEC-025): public read, server-written records, key-only outcomes.

Runs on SQLite and, when STATE_TEST_POSTGRES_URL is set, on a throwaway Postgres database (production is SQLite, but
the code still supports Postgres and CI runs every test on it).
"""
import json
import os
import uuid
from urllib.parse import urlsplit, urlunsplit

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from db import connect
from test_baseline_setup_lifecycle import BaselineFixtureProvider

USAGE = {"X-Project-Health-Usage-Key": "usage"}
DECISION = {"X-Project-Health-Decision-Key": "owner"}
RECORD = {"project": "tastemake", "problem_key": "vercel", "trigger": "Deployment failure",
          "summary": "The build failed while compiling the profile page.", "evidence": ["Vercel deployment", "Commit message"]}


@pytest.fixture(params=["sqlite", "postgres"])
def database(request, tmp_path):
    if request.param == "sqlite":
        yield {"database_path": str(tmp_path / "investigations.db")}
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    name = "phinv_" + uuid.uuid4().hex[:12]
    admin = connect(url)
    admin._conn.autocommit = True
    admin.execute(f"CREATE DATABASE {name}")
    parts = urlsplit(url)
    yield {"database_url": urlunsplit(parts._replace(path="/" + name))}
    admin.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
    admin.close()


@pytest.fixture
def client(database, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "usage")
    monkeypatch.setenv("PROJECT_HEALTH_DECISION_KEY", "owner")
    settings = Settings(**database, cors_origins=[], demo_bootstrap=False)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as test_client:
        test_client.settings = settings
        yield test_client


def add_eval_run(settings, suite, failures, created_at, build="42db6a9abc"):
    connection = connect(settings.connection_url())
    try:
        connection.execute(
            "INSERT INTO product_eval_runs(id,suite,run_kind,build,total,created_at,failure_details_json) VALUES (?,?,?,?,?,?,?)",
            (f"run_{uuid.uuid4().hex[:8]}", suite, "controlled_eval", build, 16, created_at,
             json.dumps([{"scenario_id": sid, "severity": "high"} for sid in failures])),
        )
        connection.commit()
    finally:
        connection.close()


def test_only_the_server_key_writes_records(client):
    assert client.post("/api/admin/project-health-investigations", json=RECORD).status_code == 403
    assert client.post("/api/admin/project-health-investigations", json=RECORD, headers={"X-Project-Health-Usage-Key": "wrong"}).status_code == 403
    response = client.post("/api/admin/project-health-investigations", json=RECORD, headers=USAGE)
    assert response.status_code == 200
    assert response.json()["created"] is True
    record = response.json()["record"]
    assert record["outcome"] is None
    assert record["evidence"] == ["Vercel deployment", "Commit message"]


def test_one_open_record_per_project_and_problem(client):
    first = client.post("/api/admin/project-health-investigations", json=RECORD, headers=USAGE).json()
    again = client.post("/api/admin/project-health-investigations", json={**RECORD, "summary": "Different text"}, headers=USAGE).json()
    assert again["created"] is False
    assert again["record"]["id"] == first["record"]["id"]
    assert again["record"]["summary"] == RECORD["summary"], "a repeat touches the open record; it does not rewrite it"
    assert again["record"]["lastSeenAt"] >= first["record"]["lastSeenAt"]
    other = client.post("/api/admin/project-health-investigations", json={**RECORD, "problem_key": "github-check"}, headers=USAGE).json()
    assert other["created"] is True
    listed = client.get("/api/project-health-investigations", params={"project": "tastemake"}).json()["records"]
    assert len(listed) == 2
    assert client.get("/api/project-health-investigations", params={"project": "state"}).json()["records"] == []


def test_outcomes_need_the_owner_key_and_closed_records_allow_a_new_one(client):
    record = client.post("/api/admin/project-health-investigations", json=RECORD, headers=USAGE).json()["record"]
    path = f"/api/project-health-investigations/{record['id']}/outcome"
    assert client.post(path, json={"outcome": "resolved"}).status_code == 403
    assert client.post(path, json={"outcome": "resolved"}, headers=USAGE | {"X-Project-Health-Decision-Key": "usage"}).status_code == 403
    assert client.post(path, json={"outcome": "fixed"}, headers=DECISION).status_code == 422
    investigating = client.post(path, json={"outcome": "investigating"}, headers=DECISION).json()
    assert investigating["outcome"] == "investigating"
    # Investigating is still open: a repeat touches it.
    assert client.post("/api/admin/project-health-investigations", json=RECORD, headers=USAGE).json()["created"] is False
    resolved = client.post(path, json={"outcome": "resolved", "note": "  Fixed in 65de327.  "}, headers=DECISION).json()
    assert resolved["outcome"] == "resolved"
    assert resolved["outcomeNote"] == "Fixed in 65de327."
    assert resolved["outcomeAt"]
    # A closed record no longer absorbs the problem: it happening again opens a new record.
    assert client.post("/api/admin/project-health-investigations", json=RECORD, headers=USAGE).json()["created"] is True
    assert client.post("/api/project-health-investigations/phinv_0000000000000000/outcome", json={"outcome": "resolved"}, headers=DECISION).status_code == 404


def test_state_eval_record_needs_a_recorded_failure_and_is_written_by_the_server(client):
    url = "/api/project-health-investigations/state-eval"
    assert client.post(url, json={}).status_code == 409
    add_eval_run(client.settings, "review_interpretation", ["review_direct_reversal"], "2026-11-07 17:15:26")
    add_eval_run(client.settings, "review_interpretation", [], "2026-11-09 23:29:08")
    assert client.post(url, json={}).status_code == 409, "only the latest run per suite counts"
    add_eval_run(client.settings, "ask_quality", ["ask_unknown_reason"], "2026-11-09 23:29:09")
    assert client.post(url, json={"scenario_id": "review_direct_reversal"}).status_code == 409
    assert client.post(url, json={"summary": "anything"}).status_code == 422, "browsers never send summary text"
    response = client.post(url, json={"scenario_id": "ask_unknown_reason"})
    assert response.status_code == 200
    record = response.json()["record"]
    assert record["project"] == "state"
    assert record["trigger"] == "AI eval failure · ask_unknown_reason"
    assert record["summary"] == "Latest Answer quality run (build 42db6a9) failed 1 scenario: ask_unknown_reason"
    assert record["evidence"] == ["Answer quality eval run"]
    assert client.post(url, json={}).json()["created"] is False
