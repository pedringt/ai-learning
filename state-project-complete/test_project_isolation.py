"""Regression coverage for state.md #114: a second, contrasting seeded
project (Juniper Office Move) must be fully isolated from Northstar --
counts, Current State, Reviews, Questions, History, and Rules are all
project-specific, and resetting one project never mutates the other.
"""
from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from db import connect, connect_sqlite
from database_migration_backed import initialize_db
from question_review_service import matching_open_question
from review_service import (
    create_question, list_history, list_project_areas, list_project_rules,
    list_questions, list_reviews, list_state, resolve_review,
)
from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data, reset_demo_data


@pytest.fixture(params=['sqlite', 'postgres'])
def db(request, tmp_path):
    if request.param == 'sqlite':
        connection = connect_sqlite(str(tmp_path / 'isolation.db'))
        initialize_db(connection)
        yield connection
        connection.close()
        return
    url = os.getenv('STATE_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('Isolated PostgreSQL service runs in CI')
    pytest.importorskip('psycopg2')
    schema = 'test_isolation_' + uuid.uuid4().hex
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


@pytest.fixture
def both_projects(db):
    bootstrap_demo_data(db)
    bootstrap_juniper_demo_data(db)
    return db


def test_connection_defaults_to_northstar(db):
    assert db.project_id == 'northstar'


def test_switching_project_id_changes_every_read(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    ns_state, ns_reviews, ns_questions = list_state(db), list_reviews(db), list_questions(db)
    db.project_id = 'juniper'
    j_state, j_reviews, j_questions = list_state(db), list_reviews(db), list_questions(db)

    assert len(ns_state) == 25 and len(j_state) == 11
    assert len(ns_reviews) == 7 and len(j_reviews) == 6
    assert len(ns_questions) == 19 and len(j_questions) == 5


def test_no_id_overlap_between_projects(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    ns_ids = {item['id'] for item in list_state(db)}
    db.project_id = 'juniper'
    j_ids = {item['id'] for item in list_state(db)}
    assert not (ns_ids & j_ids)
    assert all(i.startswith('k-') for i in ns_ids)
    assert all(i.startswith('j-') for i in j_ids)


def test_current_state_is_project_specific(both_projects):
    db = both_projects
    db.project_id = 'juniper'
    statements = ' '.join(item['statement'] for item in list_state(db))
    # Generalization acceptance test (#114): no Northstar-only vocabulary
    # should appear in Juniper's own Current State text.
    for leaked_term in ('pilot', 'AI assistant', 'support rep', 'Tier 1', 'Security', 'autonomy', 'vendor retention'):
        assert leaked_term.lower() not in statements.lower(), f"{leaked_term!r} leaked into Juniper Current State"


def test_reviews_and_questions_stay_project_specific(both_projects):
    db = both_projects
    db.project_id = 'juniper'
    review_ids = {r['id'] for r in list_reviews(db)}
    question_ids = {q['id'] for q in list_questions(db)}
    assert all(i.startswith('demo-juniper-') for i in review_ids)
    assert all(i.startswith('jq-') for i in question_ids)


def test_history_stays_project_specific(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    assert len(list_history(db)) == 10
    db.project_id = 'juniper'
    assert list_history(db) == []  # Juniper has no accepted-history backfill


def test_rules_and_areas_stay_project_specific(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    ns_areas = {a['id'] for a in list_project_areas(db)}
    assert ns_areas == {'scope-workflow', 'security-data', 'evaluation-rollout'}
    assert len(list_project_rules(db)) == 1
    db.project_id = 'juniper'
    j_areas = {a['id'] for a in list_project_areas(db)}
    assert j_areas == {'facilities', 'vendors', 'budget', 'timeline'}
    assert list_project_rules(db) == []


def test_question_dedup_never_matches_across_projects(both_projects):
    """A Northstar Question and a Juniper Question with the exact same text
    must never be treated as the same tracked unknown."""
    db = both_projects
    db.project_id = 'northstar'
    create_question(db, 'ns-shared-text', 'Who owns the final decision?', origin='Manual')
    db.project_id = 'juniper'
    assert matching_open_question(db, 'Who owns the final decision?') is None
    create_question(db, 'j-shared-text', 'Who owns the final decision?', origin='Manual')
    db.project_id = 'northstar'
    ns_match = matching_open_question(db, 'Who owns the final decision?')
    assert ns_match['id'] == 'ns-shared-text'
    db.project_id = 'juniper'
    j_match = matching_open_question(db, 'Who owns the final decision?')
    assert j_match['id'] == 'j-shared-text'


def test_resolving_a_juniper_review_never_touches_northstar_state(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    ns_before = list_state(db)
    db.project_id = 'juniper'
    review = next(r for r in list_reviews(db) if r['review_type'] == 'proposed_update' and r['proposals'])
    resolve_review(db, review['id'], 'accept')
    db.project_id = 'northstar'
    assert list_state(db) == ns_before


def test_resetting_one_project_does_not_mutate_the_other(both_projects):
    db = both_projects
    db.project_id = 'northstar'
    ns_before_state, ns_before_reviews = list_state(db), list_reviews(db)

    db.project_id = 'juniper'
    review = next(r for r in list_reviews(db) if r['review_type'] == 'proposed_update' and r['proposals'])
    resolve_review(db, review['id'], 'accept')
    reset_counts = reset_demo_data(db, 'juniper')
    assert reset_counts['state'] == 11 and reset_counts['reviews'] == 7

    db.project_id = 'northstar'
    assert list_state(db) == ns_before_state
    assert list_reviews(db) == ns_before_reviews


def test_resetting_northstar_does_not_mutate_juniper(both_projects):
    db = both_projects
    db.project_id = 'juniper'
    j_before_state = list_state(db)

    db.project_id = 'northstar'
    reset_demo_data(db, 'northstar')

    db.project_id = 'juniper'
    assert list_state(db) == j_before_state


def test_juniper_question_can_be_answered_without_state_change(both_projects):
    """state.md #112/#114's resolved-example shape, seeded for Juniper too."""
    db = both_projects
    db.project_id = 'juniper'
    resolved = list_questions(db, 'resolved')
    assert any(q['id'] == 'jq-parking' for q in resolved)


def test_api_bootstrap_reports_the_active_project(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'api.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings)) as client:
        bootstrap = client.get('/api/bootstrap').json()
        assert bootstrap['project'] == {'id': 'northstar', 'name': 'Northstar'}
        assert len(bootstrap['state']) == 25

        projects = client.get('/api/projects').json()
        assert {p['id'] for p in projects['items']} == {'northstar', 'juniper'}
        assert projects['active']['id'] == 'northstar'

        switched = client.post('/api/projects/switch', json={'project_id': 'juniper'})
        assert switched.status_code == 200
        assert switched.json() == {'id': 'juniper', 'name': 'Juniper Office Move'}

        bootstrap2 = client.get('/api/bootstrap').json()
        assert bootstrap2['project']['id'] == 'juniper'
        assert len(bootstrap2['state']) == 11

        bad = client.post('/api/projects/switch', json={'project_id': 'nonexistent'})
        assert bad.status_code == 404
