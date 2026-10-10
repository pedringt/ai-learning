"""#476: Ask's "today" is the asker's local day, not the server's UTC day.

Cowork, Oct 9 at 5:40 pm PDT (00:40 UTC Oct 10): Ask said "Project changes made today
(2026-10-10)". The browser now sends its local date as client_date; the server uses it
only within a day of its own date. No model calls (fake provider).
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

import ask_service
from api import Settings, create_app
from ask_service import ask_today
from test_ask_r9 import FakeAskProvider


def _client(tmp_path):
    provider = FakeAskProvider()
    settings = Settings(database_path=str(tmp_path / "date.db"), cors_origins=[], demo_bootstrap=True)
    return provider, TestClient(create_app(settings, provider=None, ask_provider=provider))


def test_a_client_date_within_a_day_is_used():
    server = date.today()
    assert ask_today(server - timedelta(days=1)) == server - timedelta(days=1)
    assert ask_today(server + timedelta(days=1)) == server + timedelta(days=1)


def test_a_far_off_or_missing_client_date_falls_back_to_the_server():
    server = date.today()
    assert ask_today(server - timedelta(days=5)) == server
    assert ask_today(None) == server


def test_the_prompt_states_the_askers_day(tmp_path):
    provider, client = _client(tmp_path)
    yesterday = date.today() - timedelta(days=1)
    with client:
        response = client.post("/api/ask", json={"query": "What changed today?", "client_date": yesterday.isoformat()})
        assert response.status_code == 200
    prompts = "\n".join(prompt for _kind, prompt in provider.prompts)
    assert f"Today's date is {yesterday.isoformat()}" in prompts
    assert f"Today's date is {date.today().isoformat()}" not in prompts


def test_a_request_without_client_date_still_works(tmp_path):
    provider, client = _client(tmp_path)
    with client:
        response = client.post("/api/ask", json={"query": "What changed today?"})
        assert response.status_code == 200
    assert f"Today's date is {date.today().isoformat()}" in "\n".join(prompt for _kind, prompt in provider.prompts)


def test_the_cache_keys_on_the_askers_day(tmp_path):
    provider, client = _client(tmp_path)
    today, yesterday = date.today(), date.today() - timedelta(days=1)
    with client:
        q = {"query": "What changed today?"}
        assert client.post("/api/ask", json={**q, "client_date": yesterday.isoformat()}).status_code == 200
        calls = len(provider.prompts)
        client.post("/api/ask", json={**q, "client_date": today.isoformat()})
        assert len(provider.prompts) > calls, "a different day must not reuse the cached answer"


def test_the_stream_endpoint_accepts_client_date(tmp_path):
    provider, client = _client(tmp_path)
    yesterday = date.today() - timedelta(days=1)
    with client:
        response = client.post("/api/ask/stream", json={"query": "What changed today?", "client_date": yesterday.isoformat()})
        assert response.status_code == 200
        assert "event: final" in response.text
