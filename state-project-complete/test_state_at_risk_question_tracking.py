"""Regression coverage for state.md #111: a state_at_risk Review's two
decisions ("Keep tracking" / "Dismiss concern") must each have a real,
durable consequence. Before this fix, both decisions just resolved the
Review with nothing persisted -- the UI promised a kept uncertainty that the
data model never actually produced.
"""
from __future__ import annotations

import os
import uuid

import pytest

from database_migration_backed import initialize_db
from db import connect, connect_sqlite
from review_service import (
    ReviewConflictError, create_question, list_history, list_questions, list_reviews, list_state, resolve_review,
)

DECISION_QUESTION = "Are the vendor's stated retention terms authoritative enough for pilot planning?"


@pytest.fixture(params=['sqlite', 'postgres'])
def db(request, tmp_path):
    if request.param == 'sqlite':
        connection = connect_sqlite(str(tmp_path / 'risk.db'))
        initialize_db(connection)
        yield connection
        connection.close()
        return
    url = os.getenv('STATE_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('Isolated PostgreSQL service runs in CI')
    pytest.importorskip('psycopg2')
    schema = 'test_risk_' + uuid.uuid4().hex
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


def make_risk_review(db, review_id='risk-1', decision_question=DECISION_QUESTION, link_question_id=None):
    """Insert a state_at_risk Review directly, mirroring seed_demo.py's shape:
    checkOnly (no proposed_state_changes/review_state_items), optionally
    pre-linked to an existing Question the interpretation pipeline judged
    this risk pertains to (review_questions, populated at Review-creation
    time by interpretation_pipeline_integrated.py for any review type)."""
    eid = f'{review_id}-evidence'
    db.execute(
        "INSERT INTO evidence(id,content,source_type,processing_status) VALUES (?,?,?,'processed')",
        (eid, "Vendor described retention terms; Security and Legal have not confirmed.", 'vendor_email'),
    )
    db.execute(
        "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES (?,'state_at_risk',?,?,'open')",
        (review_id, decision_question, 'The vendor terms are not yet contractually confirmed.'),
    )
    db.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (review_id, eid))
    if link_question_id:
        db.execute("INSERT INTO review_questions(review_id,question_id) VALUES (?,?)", (review_id, link_question_id))
    db.commit()
    return review_id, eid


def test_keep_tracking_with_no_existing_question_creates_one(db):
    review_id, eid = make_risk_review(db)
    before_state, before_history = list_state(db), list_history(db)
    outcome = resolve_review(db, review_id, 'keep')
    assert outcome['resolution'] == 'question_created'
    q = outcome['question']
    assert q['text'] == DECISION_QUESTION
    assert q['status'] == 'open'
    assert q['source_evidence_id'] == eid
    assert q['origin'] == 'Kept from a flagged uncertainty Review'
    assert [item['id'] for item in list_questions(db)] == [q['id']]
    assert list_state(db) == before_state and list_history(db) == before_history
    assert list_reviews(db) == []  # no longer appears pending
    resolved = list_reviews(db, 'resolved')[0]
    assert resolved['resolution'] == 'question_created'
    assert resolved['resolves_question_ids'] == [q['id']]


def test_keep_tracking_with_equivalent_linked_question_reuses_it(db):
    """The interpretation pipeline had already judged this risk equivalent to
    an existing open Question (review_questions populated at creation time,
    same as seed_demo.py's demo-review-retention/q-retention link) -- Keep
    tracking must preserve that Question, never create a second one."""
    existing = create_question(db, 'existing-q', 'What retention and deletion terms apply to pilot data?', origin='Manual')
    review_id, _ = make_risk_review(db, link_question_id=existing['id'])
    outcome = resolve_review(db, review_id, 'keep')
    assert outcome['resolution'] == 'question_linked'
    assert outcome['question']['id'] == existing['id']
    assert len(list_questions(db)) == 1


def test_dismiss_concern_creates_no_question_and_does_not_mutate_state(db):
    review_id, _ = make_risk_review(db)
    before_state = list_state(db)
    outcome = resolve_review(db, review_id, 'reject')
    assert outcome is None  # dismiss falls through to the ordinary no-proposal path
    assert list_questions(db) == []
    assert list_state(db) == before_state
    assert list_reviews(db) == []
    assert list_reviews(db, 'resolved')[0]['resolution'] == 'not_applied'


def test_dismiss_concern_with_pre_linked_question_leaves_it_open_and_untouched(db):
    """Dismissing the risk Review is not the same as answering the Question
    it happened to be linked to -- that Question, if any, stays open."""
    existing = create_question(db, 'existing-q2', 'What retention and deletion terms apply to pilot data?', origin='Manual')
    review_id, _ = make_risk_review(db, link_question_id=existing['id'])
    resolve_review(db, review_id, 'reject')
    q = list_questions(db)[0]
    assert q['id'] == existing['id'] and q['status'] == 'open'


def test_accept_is_unaffected_and_keeps_its_prior_no_proposal_behavior(db):
    """"accept" on a checkOnly state_at_risk Review is a separate, pre-existing
    mechanism (e.g. test_question_review_creation.py's
    test_created_question_can_be_answered_by_normal_linked_review: resolving a
    linked open Question from reviewed evidence with no state change) that the
    #111 "Keep tracking" fix must not disturb -- it never creates a Question
    of its own and is not reachable from the checkOnly UI's two buttons."""
    review_id, _ = make_risk_review(db)
    before_state = list_state(db)
    outcome = resolve_review(db, review_id, 'accept')
    assert outcome is None
    assert list_questions(db) == []
    assert list_state(db) == before_state
    assert list_reviews(db, 'resolved')[0]['resolution'] == 'confirmed_current'


def test_already_resolved_review_cannot_be_resolved_twice(db):
    review_id, _ = make_risk_review(db)
    resolve_review(db, review_id, 'keep')
    with pytest.raises(ReviewConflictError, match='already resolved'):
        resolve_review(db, review_id, 'reject')
    assert len(list_questions(db)) == 1  # the first decision's effect stands


def test_blank_decision_question_cannot_be_tracked(db):
    review_id, _ = make_risk_review(db, decision_question='   ')
    with pytest.raises(ReviewConflictError, match='no uncertainty to track'):
        resolve_review(db, review_id, 'keep')
    assert list_reviews(db)[0]['status'] == 'open'  # fails closed, nothing decided
