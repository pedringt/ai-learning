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
