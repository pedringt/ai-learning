"""#136 (option C, no schema change): area ids stay collision-free, and a collision can never be silent.

`project_areas.id` is still a global primary key (migration 012; see
docs/architecture/PROPOSAL_136_PROJECT_SCOPED_AREA_IDS.md). Nothing can collide today, and these tests pin
why: hand-seeded ids are unique across the seeded projects, user-created projects generate `area_<uuid>` ids,
and seeding a project whose area id is already taken raises instead of silently skipping the insert.

Runs on SQLite locally and on Postgres in CI (shared `db` fixture).
"""
import re

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from seed_demo import AREAS, JUNIPER_AREAS, _bootstrap_project, bootstrap_demo_data, bootstrap_juniper_demo_data
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def test_hand_seeded_area_ids_are_unique_across_the_seeded_projects():
    ids = [area[0] for area in [*AREAS, *JUNIPER_AREAS]]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    assert duplicates == [], (
        f"seeded area ids {duplicates} are used by more than one seeded project; project_areas.id is a global key "
        "(#136), so a second project reusing an id would collide. Use distinct ids."
    )


def _empty_project(connection, project_id, areas):
    return _bootstrap_project(connection, project_id=project_id, project_name=project_id, areas=areas, items=[],
                              questions=[], reviews=[], resolved_reviews=[])


def test_seeding_a_project_with_a_taken_area_id_raises_instead_of_skipping_silently(db):
    bootstrap_juniper_demo_data(db)            # owns "budget"
    db.commit()
    with pytest.raises(RuntimeError, match=r"'budget'.*'third'.*'juniper'|'budget'.*already used by project 'juniper'"):
        _empty_project(db, "third", [("budget", "Budget", "", 1)])
    db.rollback()
    owners = db.execute("SELECT project_id FROM project_areas WHERE id='budget'").fetchall()
    assert [r["project_id"] for r in owners] == ["juniper"], "the failed seed must not have touched the existing area"


def test_reseeding_the_same_project_is_still_idempotent(db):
    bootstrap_demo_data(db)
    db.commit()
    first = db.execute("SELECT count(*) AS n FROM project_areas WHERE project_id='northstar'").fetchone()["n"]
    bootstrap_demo_data(db)
    db.commit()
    assert db.execute("SELECT count(*) AS n FROM project_areas WHERE project_id='northstar'").fetchone()["n"] == first == len(AREAS)


def test_user_created_projects_generate_area_uuid_ids(tmp_path):
    """The reason nothing can collide today: people and the model never choose an area id."""
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
