"""#136: how project areas behave, and that an area's identity belongs to its project.

The first part characterizes today's area behaviour so the schema change in #136 can be shown not to
alter it: seeded area assignments, filing an accepted fact under its proposed area, the General
fallback, Baseline area hints, coverage counts, Ask candidates, History, project reset and delete.

Every test runs on SQLite and, when STATE_TEST_POSTGRES_URL is set, on its own Postgres schema.
"""
from __future__ import annotations

import os
import re
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from ask_service import _compact_candidates
from db import connect
from review_service import list_history, list_project_areas, list_state, resolve_review
from seed_demo import (
    AREAS, JUNIPER_AREAS, _bootstrap_project, bootstrap_juniper_demo_data, delete_project_data, reset_demo_data,
)
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_project_isolation import both_projects, db  # noqa: F401  (SQLite + Postgres connection fixtures)

AREA_UUID = re.compile(r"area_[0-9a-f]{12}")


@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request):
    """A database URL for the real app: a temporary SQLite file, or a fresh Postgres schema."""
    if request.param == "sqlite":
        with tempfile.TemporaryDirectory() as tempdir:
            yield "sqlite://" + str(Path(tempdir) / "state.db")
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    schema = "test_area_identity_" + uuid.uuid4().hex
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


def _areas_by_id(connection, project_id):
    connection.project_id = project_id
    return {a["id"]: a["name"] for a in list_project_areas(connection)}


def _state_by_id(connection, project_id):
    connection.project_id = project_id
    return {s["id"]: s for s in list_state(connection)}


# --- characterization: today's behaviour --------------------------------------------------------


def test_seeded_facts_carry_their_own_projects_area(both_projects):
    db = both_projects
    northstar = _state_by_id(db, "northstar")
    juniper = _state_by_id(db, "juniper")
    assert (northstar["k-pilot"]["area_id"], northstar["k-pilot"]["area_name"]) == ("scope-workflow", "Scope & workflow")
    assert (juniper["j-budget-amount"]["area_id"], juniper["j-budget-amount"]["area_name"]) == ("budget", "Budget")
    assert juniper["j-move-date"]["area_sort_order"] == 40
    # A universal fact has no area and falls back to the generic General bucket.
    assert (northstar["k-stage"]["area_id"], northstar["k-stage"]["area_name"]) == ("general", "General")
    assert _areas_by_id(db, "northstar") == {a[0]: a[1] for a in AREAS}
    assert _areas_by_id(db, "juniper") == {a[0]: a[1] for a in JUNIPER_AREAS}


def test_accepting_a_create_proposal_files_the_fact_under_its_proposed_area(both_projects):
    db = both_projects
    before = set(_state_by_id(db, "juniper"))
    db.project_id = "juniper"
    resolve_review(db, "demo-juniper-review-internet-date", "accept")
    after = _state_by_id(db, "juniper")
    (new_id,) = set(after) - before
    assert (after[new_id]["area_id"], after[new_id]["area_name"]) == ("timeline", "Timeline & dependencies")


def test_a_proposed_area_from_another_project_falls_back_to_general(both_projects):
    db = both_projects
    db.execute("UPDATE proposed_state_changes SET proposed_area_id='timeline' WHERE review_id='demo-review-create-budget'")
    db.commit()
    before = set(_state_by_id(db, "northstar"))
    db.project_id = "northstar"
    resolve_review(db, "demo-review-create-budget", "accept")
    after = _state_by_id(db, "northstar")
    (new_id,) = set(after) - before
    assert (after[new_id]["area_id"], after[new_id]["area_name"]) == ("general", "General")


def test_ask_candidates_and_history_stay_in_their_own_project(both_projects):
    db = both_projects
    db.project_id = "juniper"
    resolve_review(db, "demo-juniper-review-internet-date", "accept")
    juniper_ids = set(_state_by_id(db, "juniper"))
    db.project_id = "juniper"
    juniper_candidates = {c["id"] for c in _compact_candidates(db)["state"]}
    juniper_history = list_history(db)
    db.project_id = "northstar"
    northstar_candidates = {c["id"] for c in _compact_candidates(db)["state"]}
    assert juniper_candidates == juniper_ids
    assert not (juniper_candidates & northstar_candidates)
    assert [h["state_item_id"] for h in juniper_history if h["state_item_id"] in juniper_ids]
    assert len(list_history(db)) == 10  # Northstar's own seeded History only


def test_resetting_a_seeded_project_keeps_every_projects_areas(both_projects):
    db = both_projects
    northstar_before = _state_by_id(db, "northstar")
    db.project_id = "juniper"
    resolve_review(db, "demo-juniper-review-internet-date", "accept")
    reset_demo_data(db, "juniper")
    assert _areas_by_id(db, "juniper") == {a[0]: a[1] for a in JUNIPER_AREAS}
    assert _state_by_id(db, "juniper")["j-budget-amount"]["area_name"] == "Budget"
    assert _areas_by_id(db, "northstar") == {a[0]: a[1] for a in AREAS}
    assert _state_by_id(db, "northstar") == northstar_before


def test_deleting_a_user_project_removes_only_its_own_areas(both_projects):
    db = both_projects
    db.execute("INSERT INTO projects(id, name) VALUES ('project_scratch', 'Scratch')")
    db.execute("INSERT INTO project_areas(id, name, description, sort_order, project_id) "
               "VALUES ('area_0123456789ab', 'Scratch area', '', 10, 'project_scratch')")
    db.execute("INSERT INTO current_state_items(id, topic, statement, version, area_id, project_id) "
               "VALUES ('s-scratch', 'Scratch', 'A scratch fact.', 1, 'area_0123456789ab', 'project_scratch')")
    db.commit()
    assert _state_by_id(db, "project_scratch")["s-scratch"]["area_name"] == "Scratch area"
    delete_project_data(db, "project_scratch")
    assert db.execute("SELECT count(*) AS n FROM project_areas WHERE project_id='project_scratch'").fetchone()["n"] == 0
    assert _areas_by_id(db, "juniper") == {a[0]: a[1] for a in JUNIPER_AREAS}
    assert _areas_by_id(db, "northstar") == {a[0]: a[1] for a in AREAS}


def test_baseline_area_hints_file_accepted_facts_and_count_coverage(db_url):
    """Through the real app: Baseline hints become a generated area on accept, per project."""
    settings = Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        seen_area_ids = []
        for name in ("Project A", "Project B"):
            project = client.post("/api/projects", json={"name": name}).json()
            headers = {"X-State-Project-Id": project["id"]}
            submitted = client.post("/api/evidence", headers=headers,
                                    json={"content": "First baseline note about what State is.", "source_type": "manual_note"})
            assert submitted.status_code == 201, submitted.text
            evidence_id = submitted.json()["evidence_id"]
            assert client.get("/api/project-areas", headers=headers).json()["items"] == []  # hints are not areas yet
            draft = client.get("/api/baseline/draft", headers=headers).json()
            review_id = next(i["review_id"] for i in draft["draft"]["items"] if i["kind"] == "proposed")
            assert client.post(f"/api/reviews/{review_id}/resolve", headers=headers,
                               json={"decision": "accept"}).status_code == 200

            areas = client.get("/api/project-areas", headers=headers).json()["items"]
            assert [a["name"] for a in areas] == ["Product"]
            assert AREA_UUID.fullmatch(areas[0]["id"])
            seen_area_ids.append(areas[0]["id"])
            state = client.get("/api/state", headers=headers).json()["items"]
            assert [(s["area_id"], s["area_name"], s["topic"]) for s in state] == [(areas[0]["id"], "Product", "Purpose")]

            baseline = client.get("/api/baseline", headers=headers).json()
            assert baseline["counts"]["project_areas"] == 1 and baseline["counts"]["current_state"] == 1
            coverage = {c["evidence_id"]: c for c in baseline["coverage"]}
            assert (coverage[evidence_id]["chunk_count"], coverage[evidence_id]["represented_chunks"]) == (1, 1)
        assert seen_area_ids[0] != seen_area_ids[1], "each project gets its own area, even with the same name"
        # The seeded projects are untouched.
        northstar = client.get("/api/project-areas", headers={"X-State-Project-Id": "northstar"}).json()["items"]
        assert {a["id"] for a in northstar} == {a[0] for a in AREAS}


def test_deleting_a_project_through_the_api_keeps_other_projects_areas(db_url):
    settings = Settings(database_url=db_url, cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project = client.post("/api/projects", json={"name": "Doomed"}).json()
        headers = {"X-State-Project-Id": project["id"]}
        assert client.post("/api/baseline/manual", headers=headers, json={"items": [
            {"area_name": "Budget", "topic": "Cap", "statement": "The budget cap is $10,000."}]}).status_code == 201
        draft = client.get("/api/baseline/draft", headers=headers).json()
        proposals = [i for i in draft["draft"]["items"] if i["kind"] == "proposed"]
        assert client.post("/api/baseline/confirm", headers=headers, json={"items": [
            {"proposal_id": p["proposal_id"], "decision": "accept", "statement": p["statement"], "topic": p["topic"],
             "area_name": p["area_name"]} for p in proposals]}).status_code == 200
        assert [a["name"] for a in client.get("/api/project-areas", headers=headers).json()["items"]] == ["Budget"]

        assert client.delete(f"/api/projects/{project['id']}").status_code == 200
        juniper = client.get("/api/project-areas", headers={"X-State-Project-Id": "juniper"}).json()["items"]
        assert [(a["id"], a["name"]) for a in juniper] == [(a[0], a[1]) for a in JUNIPER_AREAS]


# --- #136: an area id is local to its project ---------------------------------------------------
# These fail on the schema before #136, where project_areas.id was a global primary key.


def _add_project_with_area(connection, project_id, area_id, area_name, fact_id=None):
    connection.execute("INSERT INTO projects(id, name) VALUES (?, ?)", (project_id, project_id))
    connection.execute("INSERT INTO project_areas(id, name, description, sort_order, project_id) VALUES (?, ?, '', 10, ?)",
                       (area_id, area_name, project_id))
    if fact_id:
        connection.execute("INSERT INTO current_state_items(id, topic, statement, version, area_id, project_id) "
                           "VALUES (?, 'Cap', 'A fact filed under a shared area id.', 1, ?, ?)", (fact_id, area_id, project_id))
    connection.commit()


def test_two_projects_can_each_define_the_same_area_id(both_projects):
    db = both_projects
    _add_project_with_area(db, "project_other", "budget", "Spending", fact_id="o-cap")  # Juniper already has 'budget'
    assert _areas_by_id(db, "project_other") == {"budget": "Spending"}
    assert _areas_by_id(db, "juniper")["budget"] == "Budget"
    other = _state_by_id(db, "project_other")["o-cap"]
    assert (other["area_id"], other["area_name"]) == ("budget", "Spending")
    juniper = _state_by_id(db, "juniper")["j-budget-amount"]
    assert (juniper["area_id"], juniper["area_name"]) == ("budget", "Budget")


def test_a_proposed_area_id_resolves_inside_the_reviews_own_project(both_projects):
    db = both_projects
    db.execute("INSERT INTO project_areas(id, name, description, sort_order, project_id) "
               "VALUES ('timeline', 'Northstar timeline', '', 40, 'northstar')")  # Juniper also has 'timeline'
    db.execute("UPDATE proposed_state_changes SET proposed_area_id='timeline' WHERE review_id='demo-review-create-budget'")
    db.commit()
    for project_id, review_id, expected in (("northstar", "demo-review-create-budget", "Northstar timeline"),
                                            ("juniper", "demo-juniper-review-internet-date", "Timeline & dependencies")):
        before = set(_state_by_id(db, project_id))
        db.project_id = project_id
        resolve_review(db, review_id, "accept")
        after = _state_by_id(db, project_id)
        (new_id,) = set(after) - before
        assert (after[new_id]["area_id"], after[new_id]["area_name"]) == ("timeline", expected)


def test_seeding_a_project_that_reuses_a_seeded_area_id_gives_it_its_own_area(db):
    bootstrap_juniper_demo_data(db)
    db.commit()

    def seed_third():
        return _bootstrap_project(db, project_id="third", project_name="Third", areas=[("budget", "Third budget", "", 1)],
                                  items=[("t-cap", "Cap", "The third project's cap is set.", "budget")],
                                  questions=[], reviews=[], resolved_reviews=[])

    seed_third()
    seed_third()  # re-seeding stays idempotent
    assert _areas_by_id(db, "third") == {"budget": "Third budget"}
    assert _state_by_id(db, "third")["t-cap"]["area_name"] == "Third budget"
    assert _areas_by_id(db, "juniper") == {a[0]: a[1] for a in JUNIPER_AREAS}
    assert _state_by_id(db, "juniper")["j-budget-amount"]["area_name"] == "Budget"


def test_a_fact_cannot_point_at_another_projects_area(both_projects):
    """The database refuses a cross-project area reference (it used to accept any existing area id)."""
    db = both_projects
    with pytest.raises(Exception):
        db.execute("INSERT INTO current_state_items(id, topic, statement, version, area_id, project_id) "
                   "VALUES ('k-cross', 'Cross', 'Filed under a Juniper area.', 1, 'budget', 'northstar')")
    db.rollback()  # on Postgres a failed statement leaves the transaction aborted
    with pytest.raises(Exception):
        db.execute("UPDATE current_state_items SET area_id='budget' WHERE id='k-pilot'")
    db.rollback()
    assert _state_by_id(db, "northstar")["k-pilot"]["area_id"] == "scope-workflow"


def test_deleting_a_project_that_shares_an_area_id_keeps_the_other_projects_area(both_projects):
    db = both_projects
    _add_project_with_area(db, "project_other", "budget", "Spending", fact_id="o-cap")
    delete_project_data(db, "project_other")
    assert _areas_by_id(db, "project_other") == {}
    assert _areas_by_id(db, "juniper") == {a[0]: a[1] for a in JUNIPER_AREAS}
    assert _state_by_id(db, "juniper")["j-budget-amount"]["area_name"] == "Budget"
