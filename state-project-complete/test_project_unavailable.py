"""#709: a request for a project that no longer exists is refused, never sent to another project.

Found Nov 17 on staging: a tab working in a user-created project kept sending its
project id after the project was gone (the free staging database had re-seeded).
The server quietly used the shared active project instead -- Northstar -- so two
notes meant for the missing project landed in Northstar, and the tab switched to
Northstar on its next load without saying so.

No model calls: the fixture provider answers intake offline.
"""
from __future__ import annotations

import os
import socket
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api
from db import connect
from test_baseline_setup_lifecycle import BaselineFixtureProvider

NOTE = "Test note meant for the project that was deleted."


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("network attempted")

    monkeypatch.setattr(socket.socket, "connect", refuse)


@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request):
    """SQLite always; Postgres on its own schema when STATE_TEST_POSTGRES_URL is set (CI)."""
    if request.param == "sqlite":
        with tempfile.TemporaryDirectory() as tempdir:
            yield "sqlite://" + str(Path(tempdir) / "state.db")
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    schema = "test_unavailable_" + uuid.uuid4().hex
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
def setup(db_url):
    settings = api.Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True)
    with TestClient(api.create_app(settings=settings, provider=BaselineFixtureProvider())) as client:
        project = client.post("/api/projects", json={"name": "Lantern"}).json()
        headers = {"X-State-Project-Id": project["id"]}
        assert client.delete(f"/api/projects/{project['id']}", headers=headers).status_code == 200
        yield client, project["id"], headers


def _northstar_evidence(client):
    return [item["content"] for item in client.get("/api/evidence", headers={"X-State-Project-Id": "northstar"}).json()["items"]]


def _assert_unavailable(response, project_id):
    assert response.status_code == 404, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "project_unavailable"
    assert detail["project_id"] == project_id


def test_a_note_for_a_deleted_project_is_refused_and_lands_nowhere(setup):
    client, project_id, headers = setup
    before = _northstar_evidence(client)
    _assert_unavailable(client.post("/api/evidence", headers=headers, json={"content": NOTE, "source_type": "manual_note"}), project_id)
    assert _northstar_evidence(client) == before
    assert NOTE not in _northstar_evidence(client)
    juniper = client.get("/api/evidence", headers={"X-State-Project-Id": "juniper"}).json()["items"]
    assert NOTE not in [item["content"] for item in juniper]


@pytest.mark.parametrize("path", ["/api/bootstrap", "/api/evidence", "/api/state", "/api/reviews", "/api/questions", "/api/history", "/api/attention"])
def test_reads_for_a_deleted_project_are_refused_not_answered_with_northstar(setup, path):
    client, project_id, headers = setup
    _assert_unavailable(client.get(path, headers=headers), project_id)


def test_a_project_id_that_never_existed_is_refused(setup):
    client, _, _ = setup
    _assert_unavailable(client.get("/api/evidence", headers={"X-State-Project-Id": "no-such-project"}), "no-such-project")


def test_demo_reset_for_a_deleted_project_does_not_reset_northstar(setup):
    client, project_id, headers = setup
    client.post("/api/evidence", headers={"X-State-Project-Id": "northstar"}, json={"content": NOTE, "source_type": "manual_note"})
    _assert_unavailable(client.post("/api/demo/reset", headers=headers), project_id)
    assert NOTE in _northstar_evidence(client)


def test_baseline_routes_refuse_a_deleted_project_the_same_way(setup):
    client, project_id, headers = setup
    _assert_unavailable(client.get("/api/baseline/draft", headers=headers), project_id)
    _assert_unavailable(client.post("/api/baseline/evidence", headers=headers, json={"content": NOTE, "source_type": "manual_note"}), project_id)
    assert NOTE not in _northstar_evidence(client)


def test_a_tab_whose_project_is_gone_can_still_list_and_choose_projects(setup):
    client, _, headers = setup
    listed = client.get("/api/projects", headers=headers)
    assert listed.status_code == 200
    assert {p["id"] for p in listed.json()["items"]} == {"northstar", "juniper"}
    switched = client.post("/api/projects/switch", headers=headers, json={"project_id": "juniper"})
    assert switched.status_code == 200 and switched.json()["id"] == "juniper"
    created = client.post("/api/projects", headers=headers, json={"name": "Lantern again"})
    assert created.status_code in (200, 201)


def test_no_header_still_opens_the_default_project(setup):
    client, _, _ = setup
    response = client.get("/api/bootstrap")
    assert response.status_code == 200
    assert response.json()["project"]["id"] == "northstar"


def test_an_existing_project_header_still_works(setup):
    client, _, _ = setup
    response = client.get("/api/bootstrap", headers={"X-State-Project-Id": "juniper"})
    assert response.status_code == 200
    assert response.json()["project"]["id"] == "juniper"
