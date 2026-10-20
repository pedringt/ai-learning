"""Project Health investigator usage: keyed ingest, aggregate-only read, kept out of State's AI metrics."""
import sqlite3
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from api import Settings, create_app
from product_analytics import _aggregate
from project_health_usage_api import OPERATION_PREFIX, usage_summary
from test_baseline_setup_lifecycle import BaselineFixtureProvider

USAGE = {"project": "tastemake", "model_identifier": "claude-haiku-5-5", "duration_ms": 2500, "input_tokens": 2000, "output_tokens": 300}


def _client(tmp_path):
    settings = Settings(database_path=str(tmp_path / "usage.db"), cors_origins=[], demo_bootstrap=False)
    return TestClient(create_app(settings, provider=BaselineFixtureProvider())), settings


def test_ingest_needs_the_key(tmp_path, monkeypatch):
    client, _ = _client(tmp_path)
    with client:
        monkeypatch.delenv("PROJECT_HEALTH_USAGE_KEY", raising=False)
        assert client.post("/api/admin/project-health-usage", json=USAGE).status_code == 503
        monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "right")
        assert client.post("/api/admin/project-health-usage", json=USAGE, headers={"X-Project-Health-Usage-Key": "wrong"}).status_code == 403
        assert client.post("/api/admin/project-health-usage", json=USAGE, headers={"X-Project-Health-Usage-Key": "right"}).status_code == 201


def test_ingest_rejects_content_and_unknown_projects(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "right")
    client, _ = _client(tmp_path)
    headers = {"X-Project-Health-Usage-Key": "right"}
    with client:
        assert client.post("/api/admin/project-health-usage", json={**USAGE, "report": "The build failed because"}, headers=headers).status_code == 422
        assert client.post("/api/admin/project-health-usage", json={**USAGE, "project": "northstar"}, headers=headers).status_code == 422


def test_read_is_aggregate_only_and_priced(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "right")
    client, _ = _client(tmp_path)
    headers = {"X-Project-Health-Usage-Key": "right"}
    with client:
        for project in ("tastemake", "tastemake", "narc"):
            assert client.post("/api/admin/project-health-usage", json={**USAGE, "project": project}, headers=headers).status_code == 201
        body = client.get("/api/admin/project-health-usage?days=30").json()
    assert body["calls"] == 3
    assert body["by_project"]["tastemake"]["calls"] == 2
    assert body["input_tokens"] == 6000 and body["output_tokens"] == 900
    # Haiku 5.5: $0.10 / $0.50 per million tokens (product_analytics pricing).
    assert abs(body["estimated_usd"] - 3 * (2000 * 0.10 + 300 * 0.50) / 1_000_000) < 1e-9
    assert body["privacy"] == {"content_included": False}
    assert set(body) == {"days", "calls", "input_tokens", "output_tokens", "estimated_usd", "unpriced_calls", "pricing_as_of", "by_project", "privacy"}


def test_state_ai_metrics_leave_project_health_calls_out(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_HEALTH_USAGE_KEY", "right")
    client, settings = _client(tmp_path)
    with client:
        client.post("/api/admin/project-health-usage", json=USAGE, headers={"X-Project-Health-Usage-Key": "right"})
    connection = sqlite3.connect(settings.database_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute("SELECT operation FROM model_call_metrics").fetchall()
        assert [r["operation"] for r in rows] == [OPERATION_PREFIX + "tastemake"]
        aggregate = _aggregate(connection, None, datetime.now(timezone.utc))
    finally:
        connection.close()
    reliability = aggregate["reliability"]
    assert reliability["token_usage"]["sample_size"] == 0, "State's token usage must not count Project Health calls"
    assert not any(op.startswith("project_health") for op in reliability["model_calls_by_operation"])
    assert reliability["model_cost"]["priced_calls"] == 0


def test_usage_summary_counts_unpriced_models():
    summary = usage_summary([{"operation": OPERATION_PREFIX + "state", "model_identifier": "some-future-model", "input_tokens": 1, "output_tokens": 1}], 30)
    assert summary["calls"] == 1 and summary["unpriced_calls"] == 1 and summary["estimated_usd"] == 0
