"""Project Health decision log: public read, key-only writes, bounded entries (Oct 27).

Runs on SQLite and, when STATE_TEST_POSTGRES_URL is set, on a throwaway Postgres database (production is SQLite, but
the code still supports Postgres and CI runs every test on it).
"""
import os
import uuid
from urllib.parse import urlsplit, urlunsplit

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from db import connect
from test_baseline_setup_lifecycle import BaselineFixtureProvider

ENTRY = {"project": "state", "type": "decision", "text": "Judge State's AI calls against a 15 s p95."}
KEY = {"X-Project-Health-Decision-Key": "right"}


@pytest.fixture(params=["sqlite", "postgres"])
def database(request, tmp_path):
    if request.param == "sqlite":
        yield {"database_path": str(tmp_path / "decisions.db")}
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    name = "phdec_" + uuid.uuid4().hex[:12]
    admin = connect(url)
    admin._conn.autocommit = True
    admin.execute(f"CREATE DATABASE {name}")
    parts = urlsplit(url)
    yield {"database_url": urlunsplit(parts._replace(path="/" + name))}
    admin.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
    admin.close()


@pytest.fixture
def make_client(database):
    def build(_tmp_path=None):
        settings = Settings(**database, cors_origins=[], demo_bootstrap=False)
        return TestClient(create_app(settings, provider=BaselineFixtureProvider()))
    return build


def test_writes_need_the_key(make_client, monkeypatch):
    client = make_client()
    with client:
        monkeypatch.delenv("PROJECT_HEALTH_DECISION_KEY", raising=False)
        assert client.post("/api/project-health-decisions", json=ENTRY, headers=KEY).status_code == 503
        monkeypatch.setenv("PROJECT_HEALTH_DECISION_KEY", "right")
        assert client.post("/api/project-health-decisions", json=ENTRY).status_code == 403
        assert client.post("/api/project-health-decisions", json=ENTRY, headers={"X-Project-Health-Decision-Key": "wrong"}).status_code == 403
        assert client.post("/api/project-health-decisions", json=ENTRY, headers=KEY).status_code == 201


def test_anyone_can_read_newest_first_per_project(make_client, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_DECISION_KEY", "right")
    client = make_client()
    with client:
        first = client.post("/api/project-health-decisions", json=ENTRY, headers=KEY).json()
        second = client.post("/api/project-health-decisions", json={**ENTRY, "type": "change", "text": "Second"}, headers=KEY).json()
        client.post("/api/project-health-decisions", json={**ENTRY, "project": "tastemake"}, headers=KEY)
        body = client.get("/api/project-health-decisions?project=state").json()
    assert [entry["id"] for entry in body["entries"]] == [second["id"], first["id"]]
    assert body["entries"][0] == {"id": second["id"], "type": "change", "text": "Second", "createdAt": second["createdAt"]}


def test_rejects_unknown_projects_types_extra_fields_and_long_text(make_client, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_DECISION_KEY", "right")
    client = make_client()
    with client:
        for bad in ({**ENTRY, "project": "northstar"}, {**ENTRY, "type": "rumour"}, {**ENTRY, "author": "x"},
                    {**ENTRY, "text": "x" * 1001}, {**ENTRY, "text": "   "}):
            assert client.post("/api/project-health-decisions", json=bad, headers=KEY).status_code == 422
        assert client.get("/api/project-health-decisions?project=northstar").status_code == 422


def test_remove_needs_the_key_and_an_existing_entry(make_client, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_DECISION_KEY", "right")
    client = make_client()
    with client:
        entry = client.post("/api/project-health-decisions", json=ENTRY, headers=KEY).json()
        assert client.delete(f"/api/project-health-decisions/{entry['id']}").status_code == 403
        assert client.delete(f"/api/project-health-decisions/{entry['id']}", headers=KEY).status_code == 200
        assert client.delete(f"/api/project-health-decisions/{entry['id']}", headers=KEY).status_code == 404
        assert client.get("/api/project-health-decisions?project=state").json()["entries"] == []
