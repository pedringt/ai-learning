"""#136, migration 020: an existing database (schema up to 019, with data) migrates to project-scoped area keys.

Builds a database at the pre-#136 schema (every migration up to 019), fills it the way production and staging
are filled (both seeded projects, a user-created project with a generated area, an accepted Review filed under
an area, History), then runs the real startup migration and checks that nothing a person can see changed,
the keys are scoped, and a second startup is a no-op. Runs on SQLite and, when STATE_TEST_POSTGRES_URL is
set, on its own Postgres schema.
"""
from __future__ import annotations

import os
import uuid

import pytest

import database_migration_backed
from database_migration_backed import initialize_db
from db import connect, connect_sqlite
from project_area_scope_migration import (
    SCOPED_AREA_KEY, SCOPED_AREA_REFERENCE, postgres_area_key, postgres_area_references, scope_project_area_keys,
    sqlite_area_key, sqlite_area_references,
)
from review_service import list_history, list_project_areas, list_state, resolve_review
from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data

MIGRATION = "020_project_scoped_areas"
TABLES = ("projects", "project_areas", "current_state_items", "history_transitions", "review_issues",
          "proposed_state_changes", "questions", "evidence", "project_rules")


def _connect_at_019(monkeypatch, connection):
    """Apply every migration before 020, as the code before #136 did."""
    every = database_migration_backed._get_migration_files()
    # Cut at 020 by name: later migrations (021, Oct 27) come after it and run in the real startup below.
    before = every[:[path.stem for path in every].index(MIGRATION)]
    monkeypatch.setattr(database_migration_backed, "_get_migration_files", lambda: before)
    initialize_db(connection)
    monkeypatch.undo()
    return connection


@pytest.fixture(params=["sqlite", "postgres"])
def old_db(request, tmp_path, monkeypatch):
    if request.param == "sqlite":
        connection = connect_sqlite(str(tmp_path / "old.db"))
        yield _connect_at_019(monkeypatch, connection)
        connection.close()
        return
    url = os.getenv("STATE_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL service runs in CI")
    pytest.importorskip("psycopg2")
    schema = "test_migration_020_" + uuid.uuid4().hex
    with connect(url) as admin:
        admin.execute(f"CREATE SCHEMA {schema}")
        admin.commit()
    connection = connect(url)
    connection.execute(f"SET search_path TO {schema}")
    connection.commit()
    try:
        yield _connect_at_019(monkeypatch, connection)
    finally:
        connection.close()
        with connect(url) as admin:
            admin.execute(f"DROP SCHEMA {schema} CASCADE")
            admin.commit()


def _is_scoped(connection) -> bool:
    if connection.is_postgres:
        key = [k["columns"] for k in postgres_area_key(connection)]
        references = [r["columns"] for r in postgres_area_references(connection)]
        connection.commit()
        return key == [",".join(SCOPED_AREA_KEY)] and references == [",".join(SCOPED_AREA_REFERENCE)]
    return sqlite_area_key(connection) == SCOPED_AREA_KEY and sqlite_area_references(connection) == [SCOPED_AREA_REFERENCE]


def _fill_like_production(connection):
    bootstrap_demo_data(connection)
    bootstrap_juniper_demo_data(connection)
    # A user-created project with a generated area id and a fact filed under it.
    connection.execute("INSERT INTO projects(id, name) VALUES ('project_0a1b2c3d4e5f', 'Real Project')")
    connection.execute("INSERT INTO project_areas(id, name, description, sort_order, project_id) "
                       "VALUES ('area_00aa11bb22cc', 'Product', 'Baseline section.', 10, 'project_0a1b2c3d4e5f')")
    connection.execute("INSERT INTO current_state_items(id, topic, statement, version, area_id, project_id) "
                       "VALUES ('state_user1', 'Purpose', 'A user fact.', 1, 'area_00aa11bb22cc', 'project_0a1b2c3d4e5f')")
    connection.commit()
    # An accepted Review files a new fact under a seeded area and writes History.
    connection.project_id = "juniper"
    resolve_review(connection, "demo-juniper-review-internet-date", "accept")
    connection.project_id = "northstar"


def _snapshot(connection):
    snapshot = {"counts": {t: connection.execute(f"SELECT count(*) AS n FROM {t}").fetchone()["n"] for t in TABLES}}
    for project in ("northstar", "juniper", "project_0a1b2c3d4e5f"):
        connection.project_id = project
        snapshot[project] = {
            "state": list_state(connection),
            "areas": list_project_areas(connection),
            "history": [(h["id"], h["state_item_id"], h["new_statement"]) for h in list_history(connection)],
        }
    connection.project_id = "northstar"
    connection.commit()
    return snapshot


def _applied(connection):
    rows = connection.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    connection.commit()
    return [r["version"] for r in rows]


def test_an_existing_database_migrates_without_visible_change(old_db):
    _fill_like_production(old_db)
    assert not _is_scoped(old_db)
    assert MIGRATION not in _applied(old_db)
    before = _snapshot(old_db)

    initialize_db(old_db)

    assert _is_scoped(old_db)
    assert MIGRATION in _applied(old_db)
    assert _snapshot(old_db) == before
    if not old_db.is_postgres:
        assert old_db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert old_db.execute("PRAGMA foreign_keys").fetchone()[0] == 1, "foreign-key checks are back on"


def test_a_second_startup_and_a_direct_rerun_are_no_ops(old_db):
    _fill_like_production(old_db)
    initialize_db(old_db)
    after_first = (_snapshot(old_db), _applied(old_db))
    initialize_db(old_db)
    assert (_snapshot(old_db), _applied(old_db)) == after_first

    # The Python step on its own also leaves a migrated schema alone.
    if not old_db.is_postgres:
        definitions = old_db.execute("SELECT name, sql FROM sqlite_master ORDER BY name").fetchall()
    old_db.execute("BEGIN")
    scope_project_area_keys(old_db)
    old_db.execute("COMMIT")
    assert _is_scoped(old_db)
    if not old_db.is_postgres:
        assert old_db.execute("SELECT name, sql FROM sqlite_master ORDER BY name").fetchall() == definitions


def test_a_cross_project_area_reference_is_cleared_to_general(old_db):
    """The old global key let a fact name another project's area; reads already showed it as General."""
    bootstrap_demo_data(old_db)
    bootstrap_juniper_demo_data(old_db)
    old_db.execute("UPDATE current_state_items SET area_id='budget' WHERE id='k-pilot'")  # Juniper's area
    old_db.commit()
    old_db.project_id = "northstar"
    before = next(s for s in list_state(old_db) if s["id"] == "k-pilot")
    assert (before["area_id"], before["area_name"]) == ("budget", "General")

    initialize_db(old_db)

    after = next(s for s in list_state(old_db) if s["id"] == "k-pilot")
    assert (after["area_id"], after["area_name"]) == ("general", "General")
    assert after["statement"] == before["statement"] and after["version"] == before["version"]


def test_after_migrating_another_project_can_reuse_a_seeded_area_id(old_db):
    _fill_like_production(old_db)
    initialize_db(old_db)
    old_db.execute("INSERT INTO project_areas(id, name, description, sort_order, project_id) "
                   "VALUES ('budget', 'Spending', '', 10, 'project_0a1b2c3d4e5f')")
    old_db.commit()
    old_db.project_id = "project_0a1b2c3d4e5f"
    assert {a["id"]: a["name"] for a in list_project_areas(old_db)} == {"area_00aa11bb22cc": "Product", "budget": "Spending"}
    old_db.project_id = "juniper"
    assert {a["id"]: a["name"] for a in list_project_areas(old_db)}["budget"] == "Budget"
