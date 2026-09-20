"""#238: the open-Review uniqueness backstop must be per project, not global.

`uq_open_review_identity` was UNIQUE(review_type, lower(trim(decision_question))) WHERE status='open',
with no project_id. So an open Review in one project made another project's Evidence fail with a 500 when it
raised the same Review, even though the application-level check (`_matching_open_review_id`) is project
scoped and the documented intent is "one exact open decision per project". The startup repair that merges
duplicate open Reviews grouped across projects too.

Runs on SQLite locally and on Postgres in CI (the `db` fixture is shared with the isolation tests).
"""
import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)

QUESTION = "Should access exceptions be represented?"


def _insert_review(connection, review_id, project_id, question=QUESTION, status="open"):
    connection.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, project_id) "
        "VALUES (?, 'missing_understanding', ?, 'x', ?, ?)",
        (review_id, question, status, project_id),
    )


def _index_names(connection):
    if connection.is_postgres:
        rows = connection.execute("SELECT indexname AS name FROM pg_indexes WHERE tablename='review_issues'").fetchall()
    else:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='review_issues'").fetchall()
    return {r["name"] for r in rows}


def _open_count(connection, project_id):
    return connection.execute(
        "SELECT count(*) AS n FROM review_issues WHERE status='open' AND project_id=?", (project_id,)
    ).fetchone()["n"]


def test_two_projects_can_each_hold_the_same_open_review(db):
    _insert_review(db, "r-a", "northstar")
    _insert_review(db, "r-b", "juniper", question="  SHOULD access exceptions be represented?  ")  # same after normalizing
    db.commit()
    assert _open_count(db, "northstar") == 1 and _open_count(db, "juniper") == 1


def test_a_project_still_cannot_hold_the_same_open_review_twice(db):
    _insert_review(db, "r-a", "northstar")
    db.commit()
    with pytest.raises(Exception):
        _insert_review(db, "r-b", "northstar", question=" should access exceptions be represented? ")
    db.rollback()  # on Postgres a failed statement leaves the transaction aborted (Sept 14 lesson)
    assert _open_count(db, "northstar") == 1


def test_a_resolved_review_does_not_block_a_new_open_one_in_the_same_project(db):
    _insert_review(db, "r-a", "northstar", status="resolved")
    _insert_review(db, "r-b", "northstar")
    db.commit()
    assert _open_count(db, "northstar") == 1


def test_startup_replaces_the_old_global_index_and_keeps_existing_reviews(db):
    """An existing database (production) already has the project-unscoped index; startup must swap it."""
    db.execute("DROP INDEX IF EXISTS uq_open_review_identity_by_project")
    db.execute("DROP INDEX IF EXISTS uq_open_review_identity")
    db.execute("CREATE UNIQUE INDEX uq_open_review_identity ON review_issues(review_type, lower(trim(decision_question))) WHERE status='open'")
    _insert_review(db, "r-a", "northstar")
    db.commit()
    with pytest.raises(Exception):  # the legacy behavior this issue is about
        _insert_review(db, "r-x", "juniper")
    db.rollback()

    initialize_db(db)

    names = _index_names(db)
    assert "uq_open_review_identity" not in names and "uq_open_review_identity_by_project" in names
    _insert_review(db, "r-b", "juniper")
    db.commit()
    assert _open_count(db, "northstar") == 1 and _open_count(db, "juniper") == 1


def test_startup_repair_never_merges_reviews_across_projects(db):
    """Duplicates that predate the index are merged only within one project."""
    db.execute("DROP INDEX IF EXISTS uq_open_review_identity_by_project")
    db.execute("DROP INDEX IF EXISTS uq_open_review_identity")
    _insert_review(db, "r-a", "northstar")
    _insert_review(db, "r-b", "juniper")
    _insert_review(db, "r-c", "juniper", question=" should access exceptions be represented? ")  # a real duplicate in juniper
    db.commit()

    initialize_db(db)

    assert _open_count(db, "northstar") == 1, "another project's Review must never be merged into or out of this one"
    assert _open_count(db, "juniper") == 1, "the genuine duplicate inside one project is still merged"


def test_second_projects_evidence_is_not_blocked_by_another_projects_open_review(tmp_path):
    """The reported symptom, through the real API: project B used to get an HTTP 500."""
    settings = Settings(database_path=str(tmp_path / "scope.db"), cors_origins=[], demo_bootstrap=False)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project_ids = []
        for name in ("Project A", "Project B"):
            project = client.post("/api/projects", json={"name": name}).json()
            client.post("/api/baseline/finish", headers={"X-State-Project-Id": project["id"]}, json={})
            project_ids.append(project["id"])
        for project_id in project_ids:
            headers = {"X-State-Project-Id": project_id}
            response = client.post("/api/evidence", headers=headers,
                                   json={"content": "An open product question remains about coverage.", "source_type": "manual_note"})
            assert response.status_code == 201, response.text
            reviews = client.get("/api/reviews?status=open", headers=headers).json()
            assert len(reviews.get("items", reviews)) == 1


def test_startup_is_idempotent(db):
    """This runs on every boot, so a second (and third) run must change nothing and never fail."""
    _insert_review(db, "r-a", "northstar")
    _insert_review(db, "r-b", "juniper")
    db.commit()
    initialize_db(db)
    before = _index_names(db)
    initialize_db(db)
    initialize_db(db)
    assert _index_names(db) == before and "uq_open_review_identity_by_project" in before
    assert _open_count(db, "northstar") == 1 and _open_count(db, "juniper") == 1
