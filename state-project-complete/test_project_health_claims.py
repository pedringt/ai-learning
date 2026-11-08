"""DEC-012 guards (Nov 8): Project Health's cooldown claims hold across parallel requests.

The claim logic runs on SQLite and, when STATE_TEST_POSTGRES_URL is set, on its own Postgres schema.
"""
import os
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect
from project_health_usage_api import claim, release
from test_baseline_setup_lifecycle import BaselineFixtureProvider

KEY = {"X-Project-Health-Usage-Key": "right"}
NOW = datetime(2026, 11, 8, 12, 0, 0, tzinfo=timezone.utc)


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
    schema = "test_ph_claims_" + uuid.uuid4().hex
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
def db(db_url):
    connection = connect(db_url)
    initialize_db(connection)
    yield db_url
    connection.close()


def test_a_held_claim_blocks_until_it_expires(db):
    with connect(db) as connection:
        token, seconds = claim(connection, "investigate:state:production:abc:github-check", 300, now=NOW)
        assert token and seconds == 300
        assert claim(connection, "investigate:state:production:abc:github-check", 300, now=NOW + timedelta(seconds=60)) == (None, 240)
        # Another failure has its own key.
        assert claim(connection, "investigate:state:production:def:github-check", 300, now=NOW + timedelta(seconds=60))[0]
        assert claim(connection, "investigate:state:production:abc:github-check", 300, now=NOW + timedelta(seconds=300))[0]


def test_only_the_holder_can_release_early(db):
    with connect(db) as connection:
        token, _ = claim(connection, "run:state:production", 600, now=NOW)
        assert not release(connection, "run:state:production", "0" * 32)
        assert claim(connection, "run:state:production", 600, now=NOW)[0] is None
        assert release(connection, "run:state:production", token)
        assert claim(connection, "run:state:production", 600, now=NOW)[0]


def test_parallel_claims_have_one_winner(db):
    results, start = [], threading.Barrier(8)

    def take():
        connection = connect(db)
        try:
            start.wait()
            results.append(claim(connection, "run:state:staging", 600, now=NOW)[0] is not None)
        finally:
            connection.close()

    threads = [threading.Thread(target=take) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == [False] * 7 + [True]


def test_endpoint_needs_the_key_and_reports_the_wait(tmp_path, monkeypatch):
    settings = Settings(database_path=str(tmp_path / "claims.db"), cors_origins=[], demo_bootstrap=False)
    client = TestClient(create_app(settings, provider=BaselineFixtureProvider()))
    body = {"claim_key": "run:state:production", "ttl_seconds": 600}
    with client:
        monkeypatch.delenv("PROJECT_HEALTH_USAGE_KEY", raising=False)
        assert client.post("/api/admin/project-health-claims", json=body).status_code == 503
        monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "right")
        assert client.post("/api/admin/project-health-claims", json=body, headers={"X-Project-Health-Usage-Key": "wrong"}).status_code == 403
        first = client.post("/api/admin/project-health-claims", json=body, headers=KEY)
        assert first.status_code == 200 and first.json()["claimed"] is True and first.json()["ttl_seconds"] == 600
        second = client.post("/api/admin/project-health-claims", json=body, headers=KEY)
        assert second.status_code == 409 and second.json()["claimed"] is False
        assert 0 < second.json()["retry_after_seconds"] <= 600 and second.headers["Retry-After"]
        release = {"claim_key": "run:state:production", "token": first.json()["token"]}
        assert client.post("/api/admin/project-health-claims/release", json=release, headers=KEY).json() == {"released": True}
        assert client.post("/api/admin/project-health-claims", json=body, headers=KEY).status_code == 200
        # Keys are identifiers only: no free text or content.
        assert client.post("/api/admin/project-health-claims", json={**body, "claim_key": "The build failed because"}, headers=KEY).status_code == 422
        assert client.post("/api/admin/project-health-claims", json={**body, "ttl_seconds": 0}, headers=KEY).status_code == 422
