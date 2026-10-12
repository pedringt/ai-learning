"""#136: area ids are generated for user projects, and re-seeding a project is idempotent.

Since migration 020 an area's key is (project_id, id), so two projects may use the same area id (see
test_area_identity.py). Before that (option C, Sept 2026) these tests also pinned that hand-seeded ids were
unique across seeded projects and that a collision raised; both guards are gone with the global key.

Runs on SQLite locally and on Postgres in CI (shared `db` fixture).
"""
import re

from fastapi.testclient import TestClient

from api import Settings, create_app
from seed_demo import AREAS, bootstrap_demo_data
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def test_reseeding_the_same_project_is_still_idempotent(db):
    bootstrap_demo_data(db)
    db.commit()
    first = db.execute("SELECT count(*) AS n FROM project_areas WHERE project_id='northstar'").fetchone()["n"]
    bootstrap_demo_data(db)
    db.commit()
    assert db.execute("SELECT count(*) AS n FROM project_areas WHERE project_id='northstar'").fetchone()["n"] == first == len(AREAS)


def test_user_created_projects_generate_area_uuid_ids(tmp_path):
    """People and the model never choose an area id; a project's areas get generated ids."""
    settings = Settings(database_path=str(tmp_path / "areas.db"), cors_origins=[], demo_bootstrap=False)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project = client.post("/api/projects", json={"name": "Areas Project"}).json()
        headers = {"X-State-Project-Id": project["id"]}
        assert client.post("/api/baseline/evidence", headers=headers,
                           json={"content": "First baseline note about what State is.", "source_type": "manual_note"}).status_code == 202
        draft = client.get("/api/baseline/draft", headers=headers).json()
        assert draft["draft"]["items"], "the fixture provider proposes a fact with an area"
        assert client.post("/api/baseline/manual", headers=headers, json={"items": [
            {"area_name": "Budget", "topic": "Cap", "statement": "The budget cap is $10,000."}]}).status_code == 201
        draft = client.get("/api/baseline/draft", headers=headers).json()
        proposals = [i for i in draft["draft"]["items"] if i["kind"] == "proposed"]
        assert len(proposals) >= 2, "one analyzed fact plus one manually added fact"
        # Areas are created when facts are accepted (confirming the Starting State), not while they are proposals.
        confirm = client.post("/api/baseline/confirm", headers=headers, json={"items": [
            {"proposal_id": p["proposal_id"], "decision": "accept", "statement": p["statement"], "topic": p["topic"], "area_name": p["area_name"]}
            for p in proposals]})
        assert confirm.status_code == 200, confirm.text
        areas = client.get("/api/project-areas", headers=headers).json()["items"]
        assert len(areas) >= 2, "the analyzed fact's area and the manual 'Budget' area"
        assert all(re.fullmatch(r"area_[0-9a-f]{12}", a["id"]) for a in areas), [a["id"] for a in areas]
