"""The Ask response cache must never outlive a human decision.

The cache reuses a validated answer while every authority-bearing input is
unchanged. `test_ask_r9.py` already proves invalidation by mutating
`current_state_items` with raw SQL. That is not the path that matters.

Current State is only supposed to change one way: a human accepts a Review.
These tests exercise that path through the API, plus the two neighbouring cases
-- a human dismissing a Review, and new Evidence arriving -- because those also
qualify what the project currently treats as true.

If any of these start failing, the cache is serving pre-decision answers and
the product's central claim is broken. They are not style tests.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from api import Settings, create_app
from db import connect
from test_ask_r9 import FakeAskProvider


def _client(tmp_path, name):
    provider = FakeAskProvider()
    settings = Settings(database_path=str(tmp_path / name), cors_origins=[], demo_bootstrap=True)
    return provider, settings, TestClient(create_app(settings, provider=None, ask_provider=provider))


def test_repeat_question_is_served_from_cache_without_calling_the_provider(tmp_path):
    provider, _, client = _client(tmp_path, "repeat.db")
    with client:
        q = {"query": "Prep me for the security meeting."}
        first = client.post("/api/ask", json=q)
        assert first.status_code == 200
        assert first.json()["timing"].get("cache_hit") is not True
        after_first = len(provider.prompts)

        second = client.post("/api/ask", json=q)
        assert second.json()["timing"]["cache_hit"] is True
        assert len(provider.prompts) == after_first, "a cache hit must not call the provider"


def test_accepting_a_review_invalidates_the_cache(tmp_path):
    """The authority path. A human accepting a Review changes Current State, so
    the next identical question must reach the provider again."""
    provider, _, client = _client(tmp_path, "accept.db")
    with client:
        q = {"query": "Prep me for the security meeting."}
        client.post("/api/ask", json=q)
        assert client.post("/api/ask", json=q).json()["timing"]["cache_hit"] is True
        before = len(provider.prompts)

        open_reviews = client.get("/api/reviews?status=open").json()["items"]
        assert open_reviews, "the demo seed should provide an open review"
        resolved = client.post(f"/api/reviews/{open_reviews[0]['id']}/resolve", json={"decision": "accept"})
        assert resolved.status_code == 200, resolved.text

        after = client.post("/api/ask", json=q)
        assert after.json()["timing"].get("cache_hit") is not True, (
            "STALE ANSWER: the cache served a pre-decision answer after a human accepted a Review"
        )
        assert len(provider.prompts) > before


def test_dismissing_a_review_invalidates_the_cache(tmp_path):
    """A 'keep' decision changes no statement text, but it does remove an open
    Review -- and open Reviews qualify Current State. An answer naming a Review
    the human has already dismissed is stale."""
    provider, _, client = _client(tmp_path, "keep.db")
    with client:
        q = {"query": "What needs review?"}
        client.post("/api/ask", json=q)
        assert client.post("/api/ask", json=q).json()["timing"]["cache_hit"] is True

        rid = client.get("/api/reviews?status=open").json()["items"][0]["id"]
        assert client.post(f"/api/reviews/{rid}/resolve", json={"decision": "keep"}).status_code == 200

        after = client.post("/api/ask", json=q)
        assert after.json()["timing"].get("cache_hit") is not True, (
            "STALE: the cache named a Review the human has already dismissed"
        )


def test_new_evidence_invalidates_the_cache(tmp_path):
    """Submitting Evidence through the API runs the interpretation pipeline and
    needs a live provider, so the row is inserted directly. What is under test is
    only whether the cache key notices new Evidence, not how it arrived."""
    provider, settings, client = _client(tmp_path, "evidence.db")
    with client:
        q = {"query": "Prep me for the security meeting."}
        client.post("/api/ask", json=q)
        assert client.post("/api/ask", json=q).json()["timing"]["cache_hit"] is True
        before = len(provider.prompts)

        with connect(settings.connection_url()) as connection:
            connection.execute(
                "INSERT INTO evidence (id, content, source_type) VALUES (?, ?, ?)",
                (f"e-{uuid.uuid4().hex[:8]}", "Security confirmed a 30-day retention limit.", "manual_note"),
            )
            connection.commit()

        after = client.post("/api/ask", json=q)
        assert after.json()["timing"].get("cache_hit") is not True, (
            "STALE: the cache served an answer that predates newly recorded Evidence"
        )
        assert len(provider.prompts) > before


def test_a_cache_hit_reports_its_own_cost_not_the_original_call(tmp_path):
    """A hit used to carry the first request's timing forward, so a
    sub-millisecond response logged the original call's provider latency."""
    _, _, client = _client(tmp_path, "timing.db")
    with client:
        q = {"query": "Prep me for the security meeting."}
        client.post("/api/ask", json=q)
        timing = client.post("/api/ask", json=q).json()["timing"]
        assert timing["cache_hit"] is True
        assert timing["provider_ms"] == 0
        assert timing["total_ms"] == 0
