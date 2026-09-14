"""Regression coverage for state.md #113: Current State's top-level
organization (project_areas) must come from project data, not from area
buckets/keyword vocabulary hardcoded in view code. Backend-side: the schema
supports an arbitrary, project-defined area taxonomy, and a fact with no
area assignment falls back to a real, generic area rather than a
domain-specific default.
"""
from __future__ import annotations

import os
import uuid

import pytest

from database_migration_backed import initialize_db
from db import connect, connect_sqlite
from review_service import list_project_areas, list_state


@pytest.fixture(params=['sqlite', 'postgres'])
def db(request, tmp_path):
    if request.param == 'sqlite':
        connection = connect_sqlite(str(tmp_path / 'areas.db'))
        initialize_db(connection)
        yield connection
        connection.close()
        return
    url = os.getenv('STATE_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('Isolated PostgreSQL service runs in CI')
    pytest.importorskip('psycopg2')
    schema = 'test_areas_' + uuid.uuid4().hex
    with connect(url) as admin:
        admin.execute(f'CREATE SCHEMA {schema}')
        admin.commit()
    connection = connect(url)
    connection.execute(f'SET search_path TO {schema}')
    connection.commit()
    initialize_db(connection)
    try:
        yield connection
    finally:
        connection.close()
        with connect(url) as admin:
            admin.execute(f'DROP SCHEMA {schema} CASCADE')
            admin.commit()


def test_migration_seeds_no_areas_by_default(db):
    """state.md #114: the 'General' fallback (see the next test down) is no
    longer a stored row -- #113's original design seeded exactly one, but a
    stored row would have needed a duplicate per project, for a concept
    that's genuinely universal, not project data. A brand-new project starts
    with zero project_areas rows until it defines its own."""
    assert list_project_areas(db) == []


def test_a_project_can_define_its_own_areas_with_no_code_change(db):
    """The whole point of #113: a materially different taxonomy is just rows."""
    db.execute("INSERT INTO project_areas(id, name, description, sort_order) VALUES (?, ?, ?, ?)",
               ('facilities', 'Location & facilities', 'Where the office is and what it needs.', 5))
    db.execute("INSERT INTO project_areas(id, name, description, sort_order) VALUES (?, ?, ?, ?)",
               ('budget', 'Budget', 'What the move costs and what has been approved.', 10))
    db.commit()
    areas = list_project_areas(db)
    assert [a['id'] for a in areas] == ['facilities', 'budget']
    assert areas[0]['name'] == 'Location & facilities'
    assert areas[1]['description'] == 'What the move costs and what has been approved.'


def test_state_item_with_an_area_carries_its_own_area_fields(db):
    db.execute("INSERT INTO project_areas(id, name, description, sort_order) VALUES ('vendors', 'Vendors & logistics', 'Who is doing the move.', 15)")
    db.execute("INSERT INTO current_state_items(id, topic, statement, version, area_id) VALUES ('k-mover', 'Moving vendor', 'Acme Movers is booked for the move date.', 1, 'vendors')")
    db.commit()
    item = list_state(db)[0]
    assert item['area_id'] == 'vendors'
    assert item['area_name'] == 'Vendors & logistics'
    assert item['area_description'] == 'Who is doing the move.'
    assert item['area_sort_order'] == 15


def test_state_item_with_no_area_falls_back_to_general_not_a_domain_default(db):
    """#113 acceptance criterion, verbatim: uncategorized facts get a
    reasonable generic fallback rather than silently becoming 'product'."""
    db.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES ('k-unassigned', 'Something', 'A fact nobody has sorted yet.', 1)")
    db.commit()
    item = list_state(db)[0]
    assert item['area_id'] == 'general'
    assert item['area_name'] == 'General'
