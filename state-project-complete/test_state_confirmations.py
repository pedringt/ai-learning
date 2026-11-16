"""#678 / DEC-026: last-confirmed dates and re-check reminders; #679 / DEC-027: Review impact order.

Runs the real app on SQLite and, when STATE_TEST_POSTGRES_URL is set, on its own Postgres schema. No model calls.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from api import Settings, create_app
from test_area_identity import db_url  # noqa: F401  (SQLite + Postgres database URL fixture)
from test_baseline_setup_lifecycle import BaselineFixtureProvider

H = {"X-State-Project-Id": "northstar"}


def _client(db_url):
    return TestClient(create_app(Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True),
                                 provider=BaselineFixtureProvider()))


def _items(client, headers=H):
    body = client.get("/api/state", headers=headers).json()
    return body, {item["id"]: item for item in body["items"]}


def test_demo_projects_seed_reminders_with_a_few_old_items(db_url):
    with _client(db_url) as client:
        body, items = _items(client)
        assert body["recheck_days"] == 60
        assert items["k-escalation"]["needs_recheck"] and items["k-vip"]["needs_recheck"]
        assert not items["k-access"]["needs_recheck"] and not items["k-pilot"]["needs_recheck"]
        assert all(item["last_confirmed_at"] for item in items.values())
        assert sum(item["needs_recheck"] for item in items.values()) == 2
        bootstrap = client.get("/api/bootstrap", headers=H).json()
        assert bootstrap["recheck_days"] == 60 and bootstrap["confirmations"] == []
        _, juniper = _items(client, {"X-State-Project-Id": "juniper"})
        assert [i for i, item in juniper.items() if item["needs_recheck"]] == ["j-storage"]


def test_new_projects_start_with_reminders_off(db_url):
    with _client(db_url) as client:
        project = client.post("/api/projects", json={"name": "Blank"}).json()
        body, _ = _items(client, {"X-State-Project-Id": project["id"]})
        assert body["recheck_days"] is None


def test_still_true_moves_the_date_and_adds_a_history_entry(db_url):
    with _client(db_url) as client:
        before = _items(client)[1]["k-escalation"]
        response = client.post("/api/state/k-escalation/confirm", json={"note": "  Checked with Support  "}, headers=H)
        assert response.status_code == 200
        after = {i["id"]: i for i in response.json()["state"]}["k-escalation"]
        assert after["last_confirmed_at"] > before["last_confirmed_at"] and not after["needs_recheck"]
        assert after["statement"] == before["statement"] and after["version"] == before["version"]
        confirmations = client.get("/api/history", headers=H).json()["confirmations"]
        assert confirmations[0]["state_item_id"] == "k-escalation" and confirmations[0]["note"] == "Checked with Support"
        assert client.post("/api/state/missing/confirm", json={}, headers=H).status_code == 404


def test_leave_unchanged_and_dismiss_concern_confirm_but_keep_tracking_does_not(db_url):
    with _client(db_url) as client:
        _, before = _items(client)
        kept = client.post("/api/reviews/demo-review-access/resolve", json={"decision": "keep"}, headers=H)
        assert kept.status_code == 200
        state = {i["id"]: i for i in kept.json()["state"]}
        assert state["k-access"]["last_confirmed_at"] > before["k-access"]["last_confirmed_at"]
        assert state["k-access"]["statement"] == before["k-access"]["statement"]

        risk_items = [s["id"] for s in next(r for r in client.get("/api/reviews", headers=H).json()["items"]
                                            if r["id"] == "demo-review-retention")["affected_state_items"]]
        assert risk_items
        tracked = client.post("/api/reviews/demo-review-retention/resolve", json={"decision": "keep"}, headers=H)
        assert tracked.status_code == 200
        state = {i["id"]: i for i in tracked.json()["state"]}
        assert all(state[i]["last_confirmed_at"] == before[i]["last_confirmed_at"] for i in risk_items)


def test_dismiss_concern_confirms_the_items_at_risk(db_url):
    with _client(db_url) as client:
        _, before = _items(client)
        reviews = client.get("/api/reviews", headers=H).json()["items"]
        risk_items = [s["id"] for s in next(r for r in reviews if r["id"] == "demo-review-retention")["affected_state_items"]]
        dismissed = client.post("/api/reviews/demo-review-retention/resolve", json={"decision": "reject"}, headers=H)
        assert dismissed.status_code == 200
        state = {i["id"]: i for i in dismissed.json()["state"]}
        assert all(state[i]["last_confirmed_at"] > before[i]["last_confirmed_at"] for i in risk_items)


def test_project_and_item_intervals(db_url):
    with _client(db_url) as client:
        off = client.patch("/api/project/recheck", json={"days": None}, headers=H).json()
        assert off["recheck_days"] is None and not any(i["needs_recheck"] for i in off["state"])
        item = client.patch("/api/state/k-escalation/recheck", json={"days": 30}, headers=H).json()
        escalation = {i["id"]: i for i in item["state"]}["k-escalation"]
        assert escalation["recheck_days"] == 30 and escalation["effective_recheck_days"] == 30 and escalation["needs_recheck"]
        assert client.patch("/api/project/recheck", json={"days": 45}, headers=H).status_code == 422
        on = client.patch("/api/project/recheck", json={"days": 180}, headers=H).json()
        by_id = {i["id"]: i for i in on["state"]}
        assert by_id["k-escalation"]["effective_recheck_days"] == 30 and by_id["k-vip"]["effective_recheck_days"] == 180
        assert not by_id["k-vip"]["needs_recheck"]


def test_open_reviews_follow_the_impact_order(db_url):
    with _client(db_url) as client:
        reviews = client.get("/api/reviews", headers=H).json()["items"]
        questions = client.get("/api/questions", headers=H).json()["items"]
        blocking = {q["id"] for q in questions if q.get("blocking")}

        def tier(r):
            linked = set(r.get("resolves_question_ids") or []) | {(r.get("question_to_create") or {}).get("existing_question_id")}
            if linked & blocking:
                return 0
            if r["review_type"] == "state_at_risk":
                return 1
            if any(p.get("operation") in ("update", "retire") and p.get("state_item_id") for p in r["proposals"]):
                return 2
            return 3

        tiers = [tier(r) for r in reviews]
        assert tiers == sorted(tiers), [(r["id"], tier(r)) for r in reviews]
        assert len(set(tiers)) > 1
