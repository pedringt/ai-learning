"""Human-authorized review resolution and read models for the State API."""

from __future__ import annotations

import sqlite3
from typing import Literal

from db import Connection
from interpretation_pipeline_integrated import new_id


class ReviewNotFoundError(KeyError):
    pass


class ReviewConflictError(RuntimeError):
    pass


Decision = Literal["accept", "keep", "reject"]


def list_draft_notes(connection: Connection) -> list[dict]:
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id, title, content, created_at, updated_at FROM draft_notes ORDER BY updated_at DESC, id DESC"
    ).fetchall()
    return [dict(row) for row in rows]


def create_draft_note(connection: Connection, draft_id: str, title: str, content: str) -> dict:
    clean_title = (title or "Untitled note").strip() or "Untitled note"
    clean_content = content.strip()
    connection.execute(
        "INSERT INTO draft_notes(id, title, content) VALUES (?, ?, ?)",
        (draft_id, clean_title, clean_content),
    )
    connection.commit()
    return dict(connection.execute(
        "SELECT id, title, content, created_at, updated_at FROM draft_notes WHERE id=?", (draft_id,)
    ).fetchone())


def update_draft_note(connection: Connection, draft_id: str, title: str, content: str) -> dict:
    existing = connection.execute("SELECT id FROM draft_notes WHERE id=?", (draft_id,)).fetchone()
    if existing is None:
        raise ReviewNotFoundError(draft_id)
    clean_title = (title or "Untitled note").strip() or "Untitled note"
    clean_content = content.strip()
    connection.execute(
        "UPDATE draft_notes SET title=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (clean_title, clean_content, draft_id),
    )
    connection.commit()
    return dict(connection.execute(
        "SELECT id, title, content, created_at, updated_at FROM draft_notes WHERE id=?", (draft_id,)
    ).fetchone())


def delete_draft_note(connection: Connection, draft_id: str) -> None:
    existing = connection.execute("SELECT id FROM draft_notes WHERE id=?", (draft_id,)).fetchone()
    if existing is None:
        raise ReviewNotFoundError(draft_id)
    connection.execute("DELETE FROM draft_notes WHERE id=?", (draft_id,))
    connection.commit()


def list_questions(connection: Connection, status: str = "open") -> list[dict]:
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id, text, status, blocking, blocks, origin, created_at, resolved_at, resolution, source_evidence_id "
        "FROM questions WHERE status=? ORDER BY blocking DESC, created_at, id", (status,)
    ).fetchall()
    return [dict(row) for row in rows]


def _normalized_question_text(value: str) -> str:
    return " ".join((value or "").casefold().split())


def create_question(connection: Connection, question_id: str, text: str, *, origin: str = "Added from Workspace", blocking: bool = False, blocks: str | None = None) -> dict:
    cleaned = text.strip()
    # Creating the same open question twice should be idempotent from the UI's
    # point of view. This also lets the frontend safely bootstrap demo questions
    # into the authoritative backend without duplicating them on every reload.
    for existing in list_questions(connection, "open"):
        if _normalized_question_text(existing["text"]) == _normalized_question_text(cleaned):
            return existing
    connection.execute(
        "INSERT INTO questions(id, text, status, blocking, blocks, origin) VALUES (?, ?, 'open', ?, ?, ?)",
        (question_id, cleaned, 1 if blocking else 0, blocks, origin),
    )
    connection.commit()
    row = connection.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
    return dict(row)


def update_question_blocking(connection: Connection, question_id: str, blocking: bool, blocks: str | None = None) -> dict:
    existing = connection.execute(
        "SELECT id FROM questions WHERE id=? AND status='open'", (question_id,)
    ).fetchone()
    if existing is None:
        raise ReviewNotFoundError(question_id)
    if blocking and not (blocks or "").strip():
        raise ValueError("Blocking questions require a concrete dependency")
    connection.execute(
        "UPDATE questions SET blocking=?, blocks=? WHERE id=? AND status='open'",
        (1 if blocking else 0, (blocks or "").strip() or None, question_id),
    )
    connection.commit()
    return dict(connection.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone())


def stop_question(connection: Connection, question_id: str) -> None:
    existing = connection.execute(
        "SELECT id FROM questions WHERE id=? AND status='open'", (question_id,)
    ).fetchone()
    if existing is None:
        raise ReviewNotFoundError(question_id)
    connection.execute(
        "UPDATE questions SET status='stopped', resolved_at=CURRENT_TIMESTAMP, resolution='Stopped tracking' "
        "WHERE id=? AND status='open'", (question_id,)
    )
    connection.commit()


def resolve_review(connection: Connection, review_id: str, decision: Decision, note: str | None = None) -> None:
    """Resolve one review atomically; only ``accept`` may mutate Current State."""
    connection.row_factory = sqlite3.Row
    connection.execute("BEGIN IMMEDIATE")
    try:
        review_sql = "SELECT id, status FROM review_issues WHERE id=?"
        if getattr(connection, "is_postgres", False):
            review_sql += " FOR UPDATE"
        review = connection.execute(review_sql, (review_id,)).fetchone()
        if review is None:
            raise ReviewNotFoundError(review_id)
        if review["status"] != "open":
            raise ReviewConflictError("Review is already resolved")

        proposals = connection.execute(
            "SELECT * FROM proposed_state_changes WHERE review_id=? AND status='pending' ORDER BY created_at, id",
            (review_id,),
        ).fetchall()

        if decision == "accept":
            for proposal in proposals:
                _apply_proposal(connection, proposal)
            proposal_status = "accepted"
            resolution = "updated" if proposals else "confirmed_current"
        else:
            proposal_status = "not_applied"
            resolution = "confirmed_current" if decision == "keep" else "not_applied"

        connection.execute(
            "UPDATE proposed_state_changes SET status=?, decided_at=CURRENT_TIMESTAMP "
            "WHERE review_id=? AND status='pending'",
            (proposal_status, review_id),
        )
        connection.execute(
            "UPDATE review_issues SET status='resolved', resolution=?, resolution_note=?, "
            "resolved_at=CURRENT_TIMESTAMP WHERE id=?",
            (resolution, note, review_id),
        )
        if decision == "accept":
            evidence_rows = connection.execute(
                "SELECT e.id, e.source_type FROM evidence e JOIN review_evidence re ON re.evidence_id=e.id "
                "WHERE re.review_id=? ORDER BY e.submitted_at DESC, e.id DESC",
                (review_id,),
            ).fetchall()
            latest_evidence_id = evidence_rows[0]["id"] if evidence_rows else None
            linked_questions = connection.execute(
                "SELECT question_id FROM review_questions WHERE review_id=?", (review_id,)
            ).fetchall()
            for linked in linked_questions:
                connection.execute(
                    "UPDATE questions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, "
                    "resolution='Resolved by reviewed evidence', source_evidence_id=? WHERE id=? AND status='open'",
                    (latest_evidence_id, linked["question_id"]),
                )
            # Backward compatibility for explicit question responses created by
            # older clients before Review↔Question links existed.
            for evidence in evidence_rows:
                source_type = evidence["source_type"] or ""
                if source_type.startswith("question_response:"):
                    question_id = source_type.split(":", 1)[1]
                    connection.execute(
                        "UPDATE questions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, "
                        "resolution='Resolved by reviewed evidence', source_evidence_id=? WHERE id=? AND status='open'",
                        (evidence["id"], question_id),
                    )
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise


def _apply_proposal(connection: Connection, proposal: dict) -> None:
    operation = proposal["operation"] or "update"
    if operation == "create":
        state_id = new_id("state")
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version, effective_date) VALUES (?, ?, ?, 1, ?)",
            (state_id, "uncategorized", proposal["proposed_statement"], proposal["effective_date"]),
        )
        old_statement, old_effective_date, from_version, to_version = None, None, None, 1
        new_effective_date = proposal["effective_date"]
        transition_type = "created"
    else:
        state_id = proposal["state_item_id"]
        current_sql = (
            "SELECT statement, version, effective_date, status FROM current_state_items WHERE id=?"
        )
        if getattr(connection, "is_postgres", False):
            current_sql += " FOR UPDATE"
        current = connection.execute(current_sql, (state_id,)).fetchone()
        if current is None or current["status"] != "active":
            raise ReviewConflictError(f"State item {state_id} is not active")
        if current["version"] != proposal["expected_state_version"]:
            raise ReviewConflictError(
                f"State item {state_id} changed after interpretation; refresh and review again"
            )
        old_statement = current["statement"]
        old_effective_date = current["effective_date"]
        from_version = current["version"]
        to_version = from_version + 1
        transition_type = "retired" if operation == "retire" else "updated"
        new_statement = proposal["proposed_statement"]
        new_effective_date = proposal["effective_date"] or old_effective_date
        if operation == "retire":
            connection.execute(
                "UPDATE current_state_items SET status='retired', version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (to_version, state_id),
            )
        else:
            connection.execute(
                "UPDATE current_state_items SET statement=?, version=?, effective_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (new_statement, to_version, new_effective_date, state_id),
            )

    connection.execute(
        "INSERT INTO history_transitions(id, state_item_id, proposed_change_id, transition_type, "
        "old_statement, new_statement, old_effective_date, new_effective_date, from_version, to_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            new_id("history"), state_id, proposal["id"], transition_type,
            old_statement, proposal["proposed_statement"], old_effective_date,
            new_effective_date, from_version, to_version,
        ),
    )


def list_state(connection: Connection) -> list[dict]:
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(
        "SELECT id, topic, statement, status, version, effective_date, created_at, updated_at "
        "FROM current_state_items WHERE status='active' ORDER BY topic, created_at, id"
    )]



def list_evidence(connection: Connection) -> list[dict]:
    """Return the complete Evidence archive newest-first."""
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(
        "SELECT id, content, source_type, processing_status, supersedes_evidence_id, submitted_at "
        "FROM evidence ORDER BY submitted_at DESC, id DESC"
    )]


def list_reviews(connection: Connection, status: str = "open") -> list[dict]:
    """Return each Review exactly once, even when multiple Evidence items are linked."""
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT r.* FROM review_issues r WHERE r.status=? ORDER BY r.created_at, r.id",
        (status,),
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        evidence_rows = connection.execute(
            "SELECT e.id, e.content, e.source_type, e.submitted_at "
            "FROM evidence e JOIN review_evidence re ON re.evidence_id=e.id "
            "WHERE re.review_id=? ORDER BY e.submitted_at DESC, e.id DESC",
            (row["id"],),
        ).fetchall()
        item["evidence_items"] = [dict(e) for e in evidence_rows]
        latest = evidence_rows[0] if evidence_rows else None
        # Backward-compatible singular fields used by the current frontend.
        item["evidence_id"] = latest["id"] if latest else None
        item["evidence_content"] = latest["content"] if latest else None
        item["evidence_source_type"] = latest["source_type"] if latest else None
        item["proposals"] = [dict(p) for p in connection.execute(
            "SELECT * FROM proposed_state_changes WHERE review_id=? ORDER BY created_at, id", (row["id"],)
        )]
        item["affected_state_items"] = [dict(s) for s in connection.execute(
            "SELECT s.id, s.topic, s.statement, s.version, s.status FROM current_state_items s "
            "JOIN review_state_items rs ON rs.state_item_id=s.id WHERE rs.review_id=? ORDER BY s.id",
            (row["id"],),
        )]
        item["resolves_question_ids"] = [q["question_id"] for q in connection.execute(
            "SELECT question_id FROM review_questions WHERE review_id=? ORDER BY question_id", (row["id"],)
        ).fetchall()]
        result.append(item)
    return result


def list_history(connection: Connection) -> list[dict]:
    """Return accepted State transitions with the Review/Evidence provenance needed by History UI."""
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT h.*, p.review_id, p.rationale AS proposal_rationale, "
        "r.decision_question, r.why_consequential, r.resolution, r.resolution_note "
        "FROM history_transitions h "
        "JOIN proposed_state_changes p ON p.id=h.proposed_change_id "
        "JOIN review_issues r ON r.id=p.review_id "
        "ORDER BY h.changed_at DESC, h.id DESC"
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        evidence_rows = connection.execute(
            "SELECT e.id, e.content, e.source_type, e.submitted_at "
            "FROM evidence e JOIN review_evidence re ON re.evidence_id=e.id "
            "WHERE re.review_id=? ORDER BY e.submitted_at, e.id",
            (row["review_id"],),
        ).fetchall()
        item["evidence_items"] = [dict(e) for e in evidence_rows]
        result.append(item)
    return result


def list_project_rules(connection: Connection) -> list[dict]:
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id, statement AS text, COALESCE(rationale, 'Interpretation') AS category, created_at FROM project_rules WHERE status='active' ORDER BY created_at, id"
    ).fetchall()
    return [dict(row) for row in rows]


def create_project_rule(connection: Connection, rule_id: str, text: str, category: str = "Interpretation") -> dict:
    cleaned = text.strip()
    normalized = " ".join(cleaned.casefold().split())
    for existing in list_project_rules(connection):
        if " ".join(existing["text"].casefold().split()) == normalized:
            return existing
    connection.execute(
        "INSERT INTO project_rules(id, statement, rationale, status) VALUES (?, ?, ?, 'active')",
        (rule_id, cleaned, category),
    )
    connection.commit()
    row = connection.execute("SELECT id, statement AS text, COALESCE(rationale, 'Interpretation') AS category, created_at FROM project_rules WHERE id=?", (rule_id,)).fetchone()
    return dict(row)


def delete_project_rule(connection: Connection, rule_id: str) -> None:
    existing = connection.execute("SELECT id FROM project_rules WHERE id=?", (rule_id,)).fetchone()
    if existing is None:
        raise ReviewNotFoundError(rule_id)
    connection.execute("UPDATE project_rules SET status='retired', retired_at=CURRENT_TIMESTAMP WHERE id=?", (rule_id,))
    connection.commit()
