"""Question proposals use the existing Review authorization boundary.

No function in this module commits. Its caller owns the transaction so the
Question, proposal outcome, and resolved Review either all persist or none do.
"""
from __future__ import annotations

import uuid


class QuestionReviewConflictError(RuntimeError):
    pass


def normalized_question_text(value: str) -> str:
    return " ".join((value or "").casefold().split())


def matching_open_question(connection, text: str) -> dict | None:
    wanted = normalized_question_text(text)
    for row in connection.execute("SELECT * FROM questions WHERE status='open' ORDER BY created_at, id").fetchall():
        if normalized_question_text(row['text']) == wanted:
            return dict(row)
    return None


def create_or_find_question(connection, question_id: str, text: str, *,
                            origin: str, blocking: bool = False, blocks: str | None = None,
                            source_evidence_id: str | None = None) -> tuple[dict, bool]:
    cleaned = text.strip()
    if not cleaned:
        raise ValueError('Question text must not be blank')
    if blocking and not (blocks or '').strip():
        raise ValueError('Blocking questions require a concrete dependency')
    # Every question-creation path takes this same lock. Serializing the
    # check+insert prevents two human approvals (or a manual add and approval)
    # from creating duplicates concurrently on PostgreSQL. SQLite's caller
    # already holds BEGIN IMMEDIATE. No fuzzy matching or urgency inference.
    if getattr(connection, 'is_postgres', False):
        connection.execute('LOCK TABLE questions IN SHARE ROW EXCLUSIVE MODE')
    existing = matching_open_question(connection, cleaned)
    if existing:
        return existing, False  # Never overwrite existing provenance/blocking.
    connection.execute(
        "INSERT INTO questions(id,text,status,blocking,blocks,origin,source_evidence_id) "
        "VALUES (?,?,'open',?,?,?,?)",
        (question_id, cleaned, int(blocking), (blocks or '').strip() or None, origin, source_evidence_id),
    )
    return dict(connection.execute('SELECT * FROM questions WHERE id=?', (question_id,)).fetchone()), True


def persist_question_proposal(connection, review_id: str, evidence_id: str, text: str) -> None:
    """Replace only the pending proposal; old interpretations remain auditable."""
    cleaned = text.strip()
    if not cleaned or len(cleaned) > 500:
        raise ValueError('Suggested Question must contain 1 to 500 characters')
    connection.execute(
        "UPDATE proposed_questions SET status='superseded', decided_at=CURRENT_TIMESTAMP "
        "WHERE review_id=? AND status='pending'", (review_id,)
    )
    connection.execute(
        'INSERT INTO proposed_questions(id,review_id,evidence_id,text) VALUES (?,?,?,?)',
        ('question_proposal_' + uuid.uuid4().hex[:12], review_id, evidence_id, cleaned),
    )


def question_proposal_read_model(connection, review_id: str) -> dict | None:
    row = connection.execute(
        "SELECT * FROM proposed_questions WHERE review_id=? AND status!='superseded' "
        "ORDER BY created_at DESC, id DESC LIMIT 1", (review_id,)
    ).fetchone()
    if row is None:
        return None
    item = dict(row)
    existing = matching_open_question(connection, item['text']) if item['status'] == 'pending' else None
    item['existing_question_id'] = existing['id'] if existing else None
    item['existing_question_text'] = existing['text'] if existing else None
    return item


def resolve_question_proposal(connection, review_id: str, decision: str,
                              expected_proposal_id: str | None, expected_existing_question_id: str | None = None) -> dict:
    proposal = connection.execute(
        "SELECT * FROM proposed_questions WHERE review_id=? AND status='pending'", (review_id,)
    ).fetchone()
    if proposal is None or not expected_proposal_id or proposal['id'] != expected_proposal_id:
        raise QuestionReviewConflictError('This Question suggestion changed. Refresh and review it again.')
    # Defense in depth against a malformed/manual DB record: the Create Question
    # label must never authorize a hidden State change or resolve another Question.
    if connection.execute("SELECT id FROM proposed_state_changes WHERE review_id=? AND status='pending'", (review_id,)).fetchone():
        raise QuestionReviewConflictError('Question Review also contains a State change; review it again.')
    if connection.execute('SELECT question_id FROM review_questions WHERE review_id=?', (review_id,)).fetchone():
        raise QuestionReviewConflictError('Question Review also resolves a Question; review it again.')
    if connection.execute('SELECT state_item_id FROM review_state_items WHERE review_id=?', (review_id,)).fetchone():
        raise QuestionReviewConflictError('Question Review unexpectedly targets Current State.')
    question, created = None, False
    if decision == 'accept':
        if getattr(connection, 'is_postgres', False):
            connection.execute('LOCK TABLE questions IN SHARE ROW EXCLUSIVE MODE')
        if expected_existing_question_id:
            existing = matching_open_question(connection, proposal['text'])
            if not existing or existing['id'] != expected_existing_question_id:
                raise QuestionReviewConflictError('The existing Question changed. Refresh and review it again.')
        question, created = create_or_find_question(
            connection, 'question_' + uuid.uuid4().hex[:12], proposal['text'],
            origin='Created from reviewed Evidence', source_evidence_id=proposal['evidence_id'],
        )
    connection.execute(
        'UPDATE proposed_questions SET status=?, resulting_question_id=?, decided_at=CURRENT_TIMESTAMP WHERE id=?',
        ('accepted' if decision == 'accept' else 'not_applied', question['id'] if question else None, proposal['id']),
    )
    return {
        'resolution': ('question_created' if created else 'question_linked') if question else ('not_needed' if decision == 'keep' else 'not_applied'),
        'question': question,
        'question_created': created,
    }
