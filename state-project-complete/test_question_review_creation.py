"""End-to-end contract for human-authorized creation of ordinary open Questions."""
from __future__ import annotations

import copy
import os
from pathlib import Path
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from ask_service import ask_cache_key, _compact_candidates
from database_migration_backed import initialize_db, _get_migration_files, _migration_statements
from db import connect, connect_sqlite
from interpretation_pipeline_integrated import process_evidence
from question_review_service import persist_question_proposal
from review_service import create_question, list_history, list_questions, list_reviews, list_state, resolve_review, ReviewConflictError, stop_question
from seed_demo import bootstrap_demo_data, reset_demo_data

TEXT = 'Are support agents meaningfully reviewing AI-generated drafts before approval?'


class QuestionProvider:
    name = 'test-question'
    model_identifier = 'deterministic'

    def __init__(self, text=TEXT, existing_review_id=None, change=None):
        self.text, self.existing_review_id, self.change = text, existing_review_id, change

    def interpret(self, *, context, evidence):
        rec = {'review_type': 'open_question', 'decision_question': self.text,
               'why_consequential': 'Reports raise an unresolved concern about meaningful human review.',
               'affected_state_item_ids': [], 'proposed_changes': []}
        if self.existing_review_id:
            rec['existing_review_id'] = self.existing_review_id
        if self.change:
            rec.update(self.change)
        return {'summary': 'A concern needs human review before it becomes a tracked Question.',
                'topics': ['workflow'], 'review_recommendations': [rec]}


@pytest.fixture(params=['sqlite', 'postgres'])
def db(request, tmp_path):
    if request.param == 'sqlite':
        connection = connect_sqlite(str(tmp_path / 'questions.db'))
        initialize_db(connection)
        yield connection
        connection.close()
        return
    url = os.getenv('STATE_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('Isolated PostgreSQL service runs in CI')
    pytest.importorskip('psycopg2')
    schema = 'test_questions_' + uuid.uuid4().hex
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


def suggest(db, text=TEXT, existing_review_id=None, change=None):
    eid = 'evidence_' + uuid.uuid4().hex[:12]
    db.execute('INSERT INTO evidence(id,content,source_type) VALUES (?,?,?)',
               (eid, 'Some approvals appear too quick to involve meaningful checking.', 'manual_note'))
    db.commit()
    result = process_evidence(db, eid, QuestionProvider(text, existing_review_id, change))
    return result, eid


def proposal(db):
    review = next(r for r in list_reviews(db) if r['review_type'] == 'open_question')
    return review, review['question_to_create']


def authorize(db, review, p, decision='accept'):
    return resolve_review(db, review['id'], decision,
                          expected_question_proposal_id=p['id'],
                          expected_existing_question_id=p.get('existing_question_id'))


def test_interpretation_proposes_but_does_not_create_or_change_state(db):
    before = (list_state(db), list_history(db), list_questions(db))
    result, eid = suggest(db)
    assert result.processing_status == 'succeeded'
    review, p = proposal(db)
    assert p['text'] == TEXT and p['evidence_id'] == eid and p['status'] == 'pending'
    assert review['proposals'] == [] and review['resolves_question_ids'] == []
    assert (list_state(db), list_history(db), list_questions(db)) == before
    candidates = _compact_candidates(db)
    assert candidates['questions'] == []
    assert candidates['reviews'][0]['question_to_create']['text'] == TEXT


def test_authorization_creates_normal_nonblocking_question_and_preserves_evidence(db):
    result, eid = suggest(db)
    review, p = proposal(db)
    before = (list_state(db), list_history(db))
    fingerprint = ask_cache_key(db, 'What are we still unsure about?')
    outcome = authorize(db, review, p)
    assert outcome['resolution'] == 'question_created'
    q = list_questions(db)[0]
    assert q['text'] == TEXT and not q['blocking'] and q['blocks'] is None
    assert q['source_evidence_id'] == eid
    assert q['origin'] == 'Created from reviewed Evidence'
    assert (list_state(db), list_history(db)) == before
    assert list_reviews(db) == []
    assert list_reviews(db, 'resolved')[0]['question_to_create']['resulting_question_id'] == q['id']
    assert db.execute('SELECT content FROM evidence WHERE id=?', (eid,)).fetchone()['content'].startswith('Some approvals')
    assert ask_cache_key(db, 'What are we still unsure about?') != fingerprint
    candidate = _compact_candidates(db)['questions'][0]
    assert candidate['authority'] == 'known_unknown' and not candidate['blocking']


@pytest.mark.parametrize('decision', ['keep', 'reject'])
def test_declining_never_creates_question_or_changes_state(db, decision):
    suggest(db)
    review, p = proposal(db)
    outcome = authorize(db, review, p, decision)
    assert outcome['question'] is None and outcome['question_created'] is False
    assert list_questions(db) == [] and list_history(db) == [] and list_state(db) == []
    assert list_reviews(db) == []
    assert list_reviews(db, 'resolved')[0]['question_to_create']['status'] == 'not_applied'


def test_exact_normalized_duplicate_reuses_existing_and_preserves_metadata(db):
    existing = create_question(db, 'existing', '  '+TEXT.upper().replace(' ', '  ')+' ',
                               origin='Manual', blocking=True, blocks='Pilot readiness')
    suggest(db)
    review, p = proposal(db)
    assert p['existing_question_id'] == existing['id']
    outcome = authorize(db, review, p)
    assert outcome['resolution'] == 'question_linked'
    assert outcome['question_created'] is False
    assert len(list_questions(db)) == 1
    q = list_questions(db)[0]
    assert q['origin'] == 'Manual' and q['blocking'] and q['blocks'] == 'Pilot readiness'
    assert q['source_evidence_id'] is None


def test_related_but_different_unknown_is_not_merged(db):
    create_question(db, 'other', 'Are billing agents reviewing refund drafts?', origin='Manual')
    suggest(db)
    review, p = proposal(db)
    assert p['existing_question_id'] is None
    authorize(db, review, p)
    assert len(list_questions(db)) == 2


def test_question_added_after_render_is_reused_at_write_time(db):
    suggest(db)
    review, p = proposal(db)
    create_question(db, 'racing-manual-add', TEXT, origin='Manual')
    assert authorize(db, review, p)['resolution'] == 'question_linked'
    assert len(list_questions(db)) == 1


def test_link_target_closed_after_render_does_not_silently_create_new_question(db):
    create_question(db, 'existing', TEXT, origin='Manual')
    suggest(db)
    review, p = proposal(db)
    stop_question(db, 'existing')
    with pytest.raises(ReviewConflictError, match='existing Question changed'):
        authorize(db, review, p)
    assert len(list_reviews(db)) == 1 and list_questions(db) == []


def test_previously_stopped_question_is_not_silently_reopened(db):
    create_question(db, 'old', TEXT, origin='Manual')
    stop_question(db, 'old')
    suggest(db)
    review, p = proposal(db)
    assert p['existing_question_id'] is None
    outcome = authorize(db, review, p)
    assert outcome['question']['id'] != 'old'
    assert list_questions(db, 'stopped')[0]['id'] == 'old'


def test_reinterpreting_review_replaces_proposal_and_blocks_stale_approval(db):
    suggest(db)
    review, old = proposal(db)
    _, eid = suggest(db, TEXT.replace('support agents', 'weekend support agents'), review['id'])
    new_review, new = proposal(db)
    assert new['id'] != old['id'] and new['evidence_id'] == eid
    with pytest.raises(ReviewConflictError, match='suggestion changed'):
        authorize(db, review, old)
    assert list_questions(db) == []
    assert authorize(db, new_review, new)['question']['text'].startswith('Are weekend')
    assert db.execute('SELECT status FROM proposed_questions WHERE id=?', (old['id'],)).fetchone()['status'] == 'superseded'


def test_missing_proposal_token_and_double_accept_fail_closed(db):
    suggest(db)
    review, p = proposal(db)
    with pytest.raises(ReviewConflictError):
        resolve_review(db, review['id'], 'accept')
    authorize(db, review, p)
    with pytest.raises(ReviewConflictError, match='already resolved'):
        authorize(db, review, p)
    assert len(list_questions(db)) == 1


@pytest.mark.parametrize('change', [
    {'affected_state_item_ids': ['unknown']},
    {'proposed_changes': [{'operation': 'create', 'proposed_statement': 'Review was removed.', 'rationale': 'unsafe'}]},
    {'resolves_question_ids': ['unknown']},
    {'blocking': True}, {'status': 'resolved'}, {'decision_question': '   '},
    {'decision_question': 'x' * 501},
])
def test_invalid_or_mixed_outcomes_are_rejected_without_side_effects(db, change):
    result, _ = suggest(db, change=change)
    assert result.processing_status == 'failed'
    assert list_reviews(db) == [] and list_questions(db) == [] and list_state(db) == []


def test_atomic_rollback_does_not_leave_question_if_review_update_fails(db):
    suggest(db)
    review, p = proposal(db)
    if db.is_postgres:
        db.execute("CREATE FUNCTION fail_review() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql")
        db.execute('CREATE TRIGGER fail_review BEFORE UPDATE ON review_issues FOR EACH ROW EXECUTE FUNCTION fail_review()')
    else:
        db.execute("CREATE TRIGGER fail_review BEFORE UPDATE ON review_issues BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    db.commit()
    with pytest.raises(Exception, match='test failure'):
        authorize(db, review, p)
    assert list_questions(db) == []
    assert list_reviews(db)[0]['question_to_create']['status'] == 'pending'
    assert list_history(db) == []


def test_created_question_can_be_answered_by_normal_linked_review(db):
    suggest(db)
    review, p = proposal(db)
    qid = authorize(db, review, p)['question']['id']
    # Normal answer-only Review: not a new Question and not a State mutation.
    db.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential) VALUES ('answer','state_at_risk','Confirm the audit answer?','Audit evidence answers the Question.')")
    db.execute("INSERT INTO review_questions(review_id,question_id) VALUES ('answer',?)", (qid,))
    db.commit()
    resolve_review(db, 'answer', 'accept')
    assert list_questions(db) == []
    assert list_questions(db, 'resolved')[0]['id'] == qid
    assert list_history(db) == []


def test_demo_reset_clears_pending_and_decided_question_proposals(db):
    suggest(db)
    review, p = proposal(db)
    authorize(db, review, p)
    suggest(db, 'Does the weekend queue need a review audit?')
    counts = reset_demo_data(db)
    assert counts and db.execute('SELECT count(*) AS n FROM proposed_questions').fetchone()['n'] == 0
    assert not any(q['text'] == TEXT for q in list_questions(db))


def test_api_returns_authoritative_result_and_question_collection(tmp_path):
    settings = Settings(database_path=str(tmp_path/'api.db'), cors_origins=[], demo_bootstrap=False)
    with TestClient(create_app(settings, provider=QuestionProvider())) as client:
        response = client.post('/api/evidence', json={'content': 'Agents may be rubber-stamping drafts.'})
        assert response.status_code == 201, response.text
        r = response.json()['reviews'][0]
        assert client.get('/api/questions').json()['items'] == []
        rid = r['id']
        assert client.post(f'/api/reviews/{rid}/resolve', json={'decision': 'accept'}).status_code == 409
        accepted = client.post(f'/api/reviews/{rid}/resolve', json={'decision': 'accept', 'expected_question_proposal_id': r['question_to_create']['id']})
        assert accepted.status_code == 200, accepted.text
        result = accepted.json()
        assert result['resolution'] == 'question_created'
        assert result['questions'][0]['id'] == result['question']['id']
        assert result['state'] == [] and result['history'] == [] and result['open_reviews'] == []
        assert client.get('/api/bootstrap').json()['questions'][0]['text'] == TEXT


def _snapshot(db, tables):
    """Row snapshot for before/after migration comparisons, with None-valued
    columns dropped. A migration adding a nullable column (e.g. 010's
    review_questions.evidence_id) correctly makes existing rows gain that key
    with a None value -- that's not data loss, so an exact dict-equality
    comparison would fail on every future migration that adds an optional
    column, regardless of whether real data was preserved."""
    return {
        t: [{k: v for k, v in dict(r).items() if v is not None} for r in db.execute(f'SELECT * FROM {t} ORDER BY 1').fetchall()]
        for t in tables
    }


def test_migration_from_existing_sqlite_preserves_history_links_and_reenables_fk(tmp_path):
    db = connect_sqlite(str(tmp_path/'upgrade.db'))
    # [:8] specifically: migration 009 needs a special Python-side step
    # (extend_review_constraints() in review_question_migration.py, since
    # SQLite can't ALTER a CHECK constraint) that only runs inside the real
    # initialize_db() runner, not from replaying a migration file's raw SQL.
    # Stopping at [:8] means initialize_db() below still has 009 (and 010) to
    # apply for real, exercising that path -- an [:-1]-style "one migration
    # behind current" slice would mark 009 as already-applied in
    # schema_migrations without ever running its Python step, since this loop
    # only replays SQL, breaking the CHECK constraint it's supposed to widen.
    for path in _get_migration_files()[:8]:
        for sql in _migration_statements(path):
            db.execute(sql)
        db.execute('INSERT INTO schema_migrations(version) VALUES (?)', (path.stem,))
        db.commit()
    bootstrap_demo_data(db)
    tables = ['evidence','review_issues','review_evidence','review_state_items','review_questions','proposed_state_changes','history_transitions','questions']
    before = _snapshot(db, tables)
    initialize_db(db)
    assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert _snapshot(db, tables) == before
    initialize_db(db)  # Idempotent second startup.
    result, _ = suggest(db)
    assert result.processing_status == 'succeeded'
    db.close()


def test_concurrent_manual_creates_use_one_question(tmp_path):
    url = 'sqlite://' + str(tmp_path/'concurrent.db')
    with connect(url) as db:
        initialize_db(db)
    def create(i):
        with connect(url) as connection:
            return create_question(connection, f'q{i}', TEXT, origin='Manual')['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(create, range(2)))
    assert ids[0] == ids[1]


def test_concurrent_review_approvals_create_one_question(db):
    records = []
    for i, text in enumerate(['Are agents checking drafts?', 'Are  agents  checking drafts?']):
        eid, rid = f'concurrent-e{i}', f'concurrent-r{i}'
        db.execute('INSERT INTO evidence(id,content,source_type) VALUES (?,?,?)', (eid, 'Concern from a separate source.', 'manual_note'))
        db.execute('INSERT INTO review_issues(id,review_type,decision_question,why_consequential) VALUES (?,?,?,?)', (rid, 'open_question', text, 'Unresolved concern.'))
        persist_question_proposal(db, rid, eid, text)
        token = db.execute("SELECT id FROM proposed_questions WHERE review_id=? AND status='pending'", (rid,)).fetchone()['id']
        records.append((rid, token))
    db.commit()
    if db.is_postgres:
        url = os.environ['STATE_TEST_POSTGRES_URL']
        schema = db.execute('SELECT current_schema() AS name').fetchone()['name']
        db.commit()
    else:
        url = 'sqlite://' + db.execute('PRAGMA database_list').fetchone()[2]
        schema = None
    def approve(record):
        with connect(url) as connection:
            if schema:
                connection.execute(f'SET search_path TO {schema}')
                connection.commit()
            return resolve_review(connection, record[0], 'accept', expected_question_proposal_id=record[1])
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(approve, records))
    assert len({r['question']['id'] for r in results}) == 1
    assert {r['resolution'] for r in results} == {'question_created', 'question_linked'}
    assert len(list_questions(db)) == 1 and list_history(db) == []


def test_postgres_upgrade_preserves_existing_records():
    url = os.getenv('STATE_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('Isolated PostgreSQL service runs in CI')
    pytest.importorskip('psycopg2')
    schema = 'test_upgrade_' + uuid.uuid4().hex
    with connect(url) as admin:
        admin.execute(f'CREATE SCHEMA {schema}'); admin.commit()
    try:
        with connect(url) as db:
            db.execute(f'SET search_path TO {schema}'); db.commit()
            # See the sqlite version of this test for why [:8] specifically.
            for path in _get_migration_files()[:8]:
                for sql in _migration_statements(path):
                    db.execute(sql)
                db.execute('INSERT INTO schema_migrations(version) VALUES (?)', (path.stem,))
                db.commit()
            bootstrap_demo_data(db)
            tables = ['evidence','review_issues','review_evidence','review_state_items','review_questions','proposed_state_changes','history_transitions','questions']
            before = _snapshot(db, tables)
            db.commit()
            initialize_db(db)
            assert _snapshot(db, tables) == before
            db.commit()
            result, _ = suggest(db)
            assert result.processing_status == 'succeeded'
            review, p = proposal(db)
            authorize(db, review, p)
            assert any(q['text'] == TEXT for q in list_questions(db))
    finally:
        with connect(url) as admin:
            admin.execute(f'DROP SCHEMA {schema} CASCADE'); admin.commit()
