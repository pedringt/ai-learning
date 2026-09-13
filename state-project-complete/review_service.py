"""Human-authorized review resolution and read models for the State API."""

from __future__ import annotations

import sqlite3
from typing import Literal

from db import Connection
from interpretation_pipeline_integrated import new_id
from question_review_service import (
    QuestionReviewConflictError, create_or_find_question, normalized_question_text,
    question_proposal_read_model, resolve_question_proposal,
)


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
    return normalized_question_text(value)


def create_question(connection: Connection, question_id: str, text: str, *, origin: str = "Added from Workspace", blocking: bool = False, blocks: str | None = None) -> dict:
    connection.execute("BEGIN IMMEDIATE")
    try:
        item, _ = create_or_find_question(connection, question_id, text, origin=origin, blocking=blocking, blocks=blocks)
        connection.execute("COMMIT")
        return item
    except Exception:
        connection.execute("ROLLBACK")
        raise


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


def resolve_review(connection: Connection, review_id: str, decision: Decision, note: str | None = None, *, expected_question_proposal_id: str | None = None, expected_existing_question_id: str | None = None) -> dict | None:
    """Resolve one review atomically; only ``accept`` may mutate Current State."""
    connection.row_factory = sqlite3.Row
    connection.execute("BEGIN IMMEDIATE")
    try:
        review_sql = "SELECT id, status, review_type FROM review_issues WHERE id=?"
        if getattr(connection, "is_postgres", False):
            review_sql += " FOR UPDATE"
        review = connection.execute(review_sql, (review_id,)).fetchone()
        if review is None:
            raise ReviewNotFoundError(review_id)
        if review["status"] != "open":
            raise ReviewConflictError("Review is already resolved")

        if decision not in {"accept", "keep", "reject"}:
            raise ReviewConflictError("Invalid Review decision")
        if review["review_type"] == "open_question":
            try:
                outcome = resolve_question_proposal(connection, review_id, decision, expected_question_proposal_id, expected_existing_question_id)
            except QuestionReviewConflictError as exc:
                raise ReviewConflictError(str(exc)) from exc
            connection.execute(
                "UPDATE review_issues SET status='resolved', resolution=?, resolution_note=?, "
                "resolved_at=CURRENT_TIMESTAMP WHERE id=?", (outcome["resolution"], note, review_id)
            )
            connection.execute("COMMIT")
            return outcome
        if expected_question_proposal_id is not None:
            raise ReviewConflictError("The Review outcome changed. Refresh and review it again.")

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
                "SELECT question_id, evidence_id FROM review_questions WHERE review_id=?", (review_id,)
            ).fetchall()
            # Each row's own evidence_id (migration 010) is the Evidence whose
            # interpretation actually inserted this specific Review-Question
            # link -- more precise than latest_evidence_id, which is just
            # whichever Evidence has the latest submitted_at across every
            # review_evidence row for this Review, including ones with no
            # bearing on this Question (e.g. a manually-linked adversarial
            # relationship, same pattern as seed_demo.py's demo-review-retention/
            # ask-evidence-vendor-retention link). Rows from before that
            # migration have no evidence_id recorded, so fall back to the
            # previous review-wide approximation for those only.
            for linked in linked_questions:
                source_evidence_id = linked["evidence_id"] or latest_evidence_id
                connection.execute(
                    "UPDATE questions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, "
                    "resolution='Resolved by reviewed evidence', source_evidence_id=? WHERE id=? AND status='open'",
                    (source_evidence_id, linked["question_id"]),
                )
            # REMOVED: Unsafe backward-compatibility fallback that resolved Questions based solely
            # on source_type.startswith("question_response:"). Question resolution now comes only
            # from the explicit review_questions relationship created by validated resolves_question_ids.
            # This prevents unrelated Evidence submitted from the Question UI from incorrectly closing Questions.
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise



def accept_review(connection: Connection, review_id: str, note: str | None = None) -> None:
    """Backward-compatible helper for older tests/integrations."""
    resolve_review(connection, review_id, "accept", note)

def _apply_proposal(connection: Connection, proposal: dict) -> None:
    operation = proposal["operation"] or "update"
    if operation == "create":
        wanted = " ".join((proposal["proposed_statement"] or "").split()).casefold()
        existing_rows = connection.execute(
            "SELECT id, statement FROM current_state_items WHERE status='active'"
        ).fetchall()
        if any(" ".join((row["statement"] or "").split()).casefold() == wanted for row in existing_rows):
            # Defense in depth: even a stale/manual Review cannot create an
            # exact duplicate of understanding State already maintains.
            return
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


def _related_open_review_refs(
    connection: Connection, *, review_id: str, state_ids: list[str], question_ids: list[str]
) -> list[dict]:
    """Other open Reviews that share a linked State item or Question.

    Deliberately structural, not semantic: two Reviews of different types
    (e.g. a state_at_risk "is this trustworthy?" and a proposed_update
    "should Current State now say this?") can both be legitimate, separate
    human decisions about the same underlying topic -- software must not
    guess that they're actually the same decision and merge or supersede
    one automatically (see _matching_open_review_id, which only dedupes
    exact create-time duplicates for this same reason). This only surfaces
    the mechanical fact "these Reviews are linked to the same State item or
    Question" as a pointer for the human reviewer to judge, mirroring a real
    staging finding (2026-09-13): new evidence about vendor retention
    created a second, differently-typed open Review instead of linking to
    the existing one, and there was no way for a reviewer looking at either
    Review to see the other existed.
    """
    related_ids: set[str] = set()
    if state_ids:
        placeholders = ",".join("?" * len(state_ids))
        related_ids.update(
            r["review_id"] for r in connection.execute(
                f"SELECT DISTINCT review_id FROM review_state_items WHERE state_item_id IN ({placeholders})",
                state_ids,
            ).fetchall()
        )
    if question_ids:
        placeholders = ",".join("?" * len(question_ids))
        related_ids.update(
            r["review_id"] for r in connection.execute(
                f"SELECT DISTINCT review_id FROM review_questions WHERE question_id IN ({placeholders})",
                question_ids,
            ).fetchall()
        )
    related_ids.discard(review_id)
    if not related_ids:
        return []
    placeholders = ",".join("?" * len(related_ids))
    rows = connection.execute(
        f"SELECT id, review_type, decision_question FROM review_issues "
        f"WHERE status='open' AND id IN ({placeholders}) ORDER BY created_at, id",
        list(related_ids),
    ).fetchall()
    return [dict(row) for row in rows]


def list_reviews(connection: Connection, status: str = "open") -> list[dict]:
    """Return each Review exactly once, even when multiple Evidence items are linked.

    Ordering is the single shared consequentiality ranking every consumer
    (Workspace's attention list, Open Items, and Ask's deterministic starter
    answers) inherits by taking the first N reviews returned here -- none of
    them re-rank independently. state_at_risk reviews sort first regardless
    of age: unlike a proposed_update, a state_at_risk review means Current
    State may already be wrong, which QA found could otherwise get pushed
    out of a `.slice(0, N)` cut by older, lower-stakes reviews. Added
    2026-09-07 after live QA found a "Current State may be at risk" review
    that led Workspace's attention list disappear from some Ask briefings.
    """
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT r.* FROM review_issues r WHERE r.status=? "
        "ORDER BY (r.review_type='state_at_risk') DESC, r.created_at, r.id",
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
        item["related_open_reviews"] = _related_open_review_refs(
            connection,
            review_id=row["id"],
            state_ids=[s["id"] for s in item["affected_state_items"]],
            question_ids=item["resolves_question_ids"],
        )
        if item["review_type"] == "open_question":
            item["question_to_create"] = question_proposal_read_model(connection, row["id"])
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
