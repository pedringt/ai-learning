from pathlib import Path
import sqlite3
import tempfile

from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from seed_demo import bootstrap_demo_data


class NoopProvider:
    name = "noop"
    model_identifier = "noop"
    def interpret(self, *, context, evidence):
        return {"summary":"No material change","topics":[],"outcome":"no_review","no_review_explanation":"No change","review_recommendations":[]}


def make_client():
    temp = tempfile.TemporaryDirectory()
    db_path = str(Path(temp.name) / "state.db")
    app = create_app(Settings(database_path=db_path, cors_origins=["https://example.test"]), provider=NoopProvider())
    context = TestClient(app)
    client = context.__enter__()
    return temp, context, client


def test_cors_allows_rule_delete_and_question_patch():
    temp, context, client = make_client()
    try:
        for method, path in [("DELETE", "/api/rules/rule-x"), ("PATCH", "/api/questions/q-x/blocking")]:
            response = client.options(path, headers={
                "Origin":"https://example.test",
                "Access-Control-Request-Method":method,
                "Access-Control-Request-Headers":"content-type",
            })
            assert response.status_code == 200
            allowed = response.headers.get("access-control-allow-methods", "")
            assert method in allowed
    finally:
        context.__exit__(None, None, None)
        temp.cleanup()


def test_draft_notes_persist_and_are_editable_until_submitted():
    temp, context, client = make_client()
    try:
        created = client.post("/api/drafts", json={"title":"Scratch", "content":"Working thought"})
        assert created.status_code == 201
        draft = created.json()
        assert client.get("/api/drafts").json()["items"][0]["id"] == draft["id"]
        updated = client.patch(f"/api/drafts/{draft['id']}", json={"title":"Updated", "content":"Revised thought"})
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated"
        assert updated.json()["content"] == "Revised thought"
        assert client.delete(f"/api/drafts/{draft['id']}").status_code == 200
        assert client.get("/api/drafts").json()["items"] == []
    finally:
        context.__exit__(None, None, None)
        temp.cleanup()


def test_blocking_question_requires_and_preserves_concrete_dependency():
    temp, context, client = make_client()
    try:
        q = client.post("/api/questions", json={"text":"Which vendor terms govern?"}).json()
        missing = client.patch(f"/api/questions/{q['id']}/blocking", json={"blocking":True})
        assert missing.status_code == 422
        blocked = client.patch(f"/api/questions/{q['id']}/blocking", json={"blocking":True, "blocks":"Security approval"})
        assert blocked.status_code == 200
        assert bool(blocked.json()["blocking"]) is True
        assert blocked.json()["blocks"] == "Security approval"
        unblocked = client.patch(f"/api/questions/{q['id']}/blocking", json={"blocking":False, "blocks":None})
        assert unblocked.status_code == 200
        assert bool(unblocked.json()["blocking"]) is False
        assert unblocked.json()["blocks"] is None
    finally:
        context.__exit__(None, None, None)
        temp.cleanup()


def test_new_demo_seed_evidence_uses_historical_dates(tmp_path):
    db = tmp_path / "demo.db"
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    initialize_db(conn)
    bootstrap_demo_data(conn)
    rows = conn.execute("SELECT submitted_at FROM evidence WHERE source_type='demo_seed' ORDER BY id").fetchall()
    assert len(rows) == 4
    assert all(str(row["submitted_at"]).startswith("2026-08-") for row in rows)
    conn.close()
