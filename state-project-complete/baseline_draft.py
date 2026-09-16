"""Starting State draft and confirmation flow for Baseline Setup (Issue #163).

The draft is a read model over existing Current State plus routine baseline
proposals. Routine creates can be authorized together when a person confirms
the Starting State. Questions, conflicts, risks, and changes to already-current
facts still require their own Review first.

Authority remains unchanged:
    AI interprets -> software enforces -> people authorize.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel

from baseline_setup import is_baseline_setup
from db import connect, project_id_of
from review_service import _apply_proposal, list_history, list_questions, list_reviews, list_state

_SETUP_AREA_DESCRIPTION = "Baseline section created from human-authorized project material."


class StartingStateItemDecision(BaseModel):
    proposal_id: str
    decision: Literal["accept", "reject"]
    statement: str | None = None
    topic: str | None = None
    area_name: str | None = None


class ConfirmStartingStateInput(BaseModel):
    items: list[StartingStateItemDecision]


def _norm(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def _clean_area_description(value: str | None) -> str:
    clean = " ".join((value or "").split()).strip()
    return "" if clean == _SETUP_AREA_DESCRIPTION else clean


def _proposal_statement(proposal: dict[str, Any]) -> str:
    return " ".join((proposal.get("adjusted_statement") or proposal.get("proposed_statement") or "").split()).strip()


def _evidence_processing_counts(connection: Any) -> tuple[int, int]:
    rows = connection.execute(
        "SELECT processing_status, COUNT(*) AS n FROM evidence WHERE project_id=? GROUP BY processing_status",
        (project_id_of(connection),),
    ).fetchall()
    counts = {row["processing_status"]: int(row["n"]) for row in rows}
    return counts.get("failed", 0), counts.get("pending", 0)


def starting_state_draft(connection: Any) -> dict[str, Any]:
    """Build the editable baseline draft without authorizing any mutation.

    Routine missing-understanding creates become editable draft facts. Existing
    Current State is included as already-authorized context. Question Reviews
    are visible in the draft but, like conflicts/risks/updates, remain in the
    individual Review queue because they require a distinct human judgment.
    """
    project_id = project_id_of(connection)
    state_items = list_state(connection)
    open_reviews = list_reviews(connection, "open")
    open_questions = list_questions(connection, "open")

    draft_items: list[dict[str, Any]] = []
    seen_statements: set[str] = set()

    for item in state_items:
        statement = " ".join((item.get("statement") or "").split()).strip()
        key = _norm(statement)
        if not statement or key in seen_statements:
            continue
        seen_statements.add(key)
        draft_items.append({
            "kind": "current",
            "state_item_id": item.get("id"),
            "review_id": None,
            "proposal_id": None,
            "topic": item.get("topic") or "",
            "statement": statement,
            "area_id": item.get("area_id") or "general",
            "area_name": item.get("area_name") or "General",
            "area_description": _clean_area_description(item.get("area_description")),
        })

    needs_individual_review: list[dict[str, Any]] = []
    proposed_questions: list[dict[str, Any]] = []
    seen_questions = {_norm(q.get("text")) for q in open_questions if q.get("text")}

    for review in open_reviews:
        review_type = review.get("review_type")
        proposals = [p for p in (review.get("proposals") or []) if p.get("status") == "pending"]

        if review_type == "missing_understanding" and proposals and all(p.get("operation") == "create" for p in proposals):
            for proposal in proposals:
                statement = _proposal_statement(proposal)
                key = _norm(statement)
                if not statement or key in seen_statements:
                    continue
                seen_statements.add(key)
                draft_items.append({
                    "kind": "proposed",
                    "state_item_id": None,
                    "review_id": review.get("id"),
                    "proposal_id": proposal.get("id"),
                    "topic": proposal.get("proposed_topic") or "",
                    "statement": statement,
                    "area_id": None,
                    "area_name": proposal.get("proposed_area_name") or "General",
                    "area_description": "",
                })
            continue

        if review_type == "open_question":
            question = review.get("question_to_create") or {}
            text = " ".join((question.get("existing_question_text") or question.get("text") or review.get("decision_question") or "").split()).strip()
            key = _norm(text)
            if text and key not in seen_questions:
                seen_questions.add(key)
                proposed_questions.append({
                    "kind": "proposed",
                    "review_id": review.get("id"),
                    "question_proposal_id": question.get("id"),
                    "text": text,
                    "existing_question_id": question.get("existing_question_id"),
                })
            needs_individual_review.append({
                "review_id": review.get("id"),
                "review_type": review_type,
                "decision_question": review.get("decision_question") or text,
            })
            continue

        needs_individual_review.append({
            "review_id": review.get("id"),
            "review_type": review_type,
            "decision_question": review.get("decision_question") or "",
        })

    questions = [
        {
            "kind": "current",
            "question_id": q.get("id"),
            "review_id": None,
            "text": q.get("text") or "",
            "blocking": bool(q.get("blocking")),
            "blocks": q.get("blocks"),
        }
        for q in open_questions
    ] + proposed_questions

    failed_evidence, processing_evidence = _evidence_processing_counts(connection)
    active = is_baseline_setup(connection)
    can_confirm = (
        active
        and not needs_individual_review
        and failed_evidence == 0
        and processing_evidence == 0
    )

    return {
        "project_id": project_id,
        "status": "baseline_setup" if active else "established",
        "draft": {
            "items": draft_items,
            "questions": questions,
        },
        "counts": {
            "current_items": sum(1 for item in draft_items if item["kind"] == "current"),
            "proposed_items": sum(1 for item in draft_items if item["kind"] == "proposed"),
            "current_questions": sum(1 for item in questions if item["kind"] == "current"),
            "proposed_questions": sum(1 for item in questions if item["kind"] == "proposed"),
            "needs_individual_review": len(needs_individual_review),
            "failed_evidence": failed_evidence,
            "processing_evidence": processing_evidence,
        },
        "needs_individual_review": needs_individual_review,
        "can_confirm": can_confirm,
        "authority": "draft_only",
    }


def _ensure_area(connection: Any, name: str | None) -> str | None:
    clean = " ".join((name or "").split()).strip()
    if not clean or clean.casefold() == "general":
        return None
    existing = connection.execute(
        "SELECT id FROM project_areas WHERE project_id=? AND lower(trim(name))=lower(trim(?)) "
        "ORDER BY sort_order, id LIMIT 1",
        (project_id_of(connection), clean),
    ).fetchone()
    if existing:
        return existing["id"]
    row = connection.execute(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_areas WHERE project_id=?",
        (project_id_of(connection),),
    ).fetchone()
    area_id = f"area_{uuid.uuid4().hex[:12]}"
    connection.execute(
        "INSERT INTO project_areas(id, name, description, sort_order, project_id) VALUES (?, ?, '', ?, ?)",
        (area_id, clean[:80], int(row["max_order"] or 0) + 10, project_id_of(connection)),
    )
    return area_id


def _pending_routine_proposals(connection: Any) -> dict[str, dict[str, Any]]:
    rows = connection.execute(
        "SELECT p.*, r.id AS owning_review_id, r.review_type, r.status AS review_status "
        "FROM proposed_state_changes p JOIN review_issues r ON r.id=p.review_id "
        "WHERE r.project_id=? AND r.status='open' AND r.review_type='missing_understanding' "
        "AND p.status='pending' AND p.operation='create' ORDER BY r.created_at, p.created_at, p.id",
        (project_id_of(connection),),
    ).fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = dict(row)
        siblings = connection.execute(
            "SELECT operation FROM proposed_state_changes WHERE review_id=? AND status='pending'",
            (item["review_id"],),
        ).fetchall()
        if siblings and all(s["operation"] == "create" for s in siblings):
            result[item["id"]] = item
    return result


def _review_resolution(decisions: list[str]) -> str:
    accepted = sum(1 for decision in decisions if decision == "accept")
    if accepted == len(decisions):
        return "updated"
    if accepted == 0:
        return "not_applied"
    return "partially_applied"


def confirm_starting_state(connection: Any, payload: ConfirmStartingStateInput) -> dict[str, Any]:
    """Apply routine baseline creates as one human-authorized transaction.

    This intentionally cannot resolve Question/conflict/risk/update Reviews.
    Those must be handled through the normal Review flow first. The request is
    exhaustive for routine draft facts: every visible routine proposal must be
    explicitly accepted or rejected, so omission from the request cannot act as
    an accidental authorization decision.
    """
    connection.execute("BEGIN IMMEDIATE")
    try:
        if not is_baseline_setup(connection):
            raise HTTPException(status_code=409, detail={
                "code": "baseline_already_established",
                "error_details": {"error_message": "Baseline Setup is already finished."},
            })

        if getattr(connection, "is_postgres", False):
            connection.execute(
                "LOCK TABLE review_issues, proposed_state_changes, proposed_questions, current_state_items, "
                "project_areas, questions IN SHARE ROW EXCLUSIVE MODE"
            )

        draft = starting_state_draft(connection)
        if draft["counts"]["failed_evidence"] or draft["counts"]["processing_evidence"]:
            raise HTTPException(status_code=409, detail={
                "code": "baseline_not_ready",
                "error_details": {"error_message": "Wait for unfinished Evidence and retry failed Evidence before confirming the Starting State."},
                "draft": draft,
            })
        if draft["needs_individual_review"]:
            raise HTTPException(status_code=409, detail={
                "code": "baseline_review_required",
                "error_details": {"error_message": "Resolve the flagged Questions, conflicts, or other Reviews before confirming the Starting State."},
                "draft": draft,
            })

        expected = _pending_routine_proposals(connection)
        visible_ids = {
            item["proposal_id"] for item in draft["draft"]["items"]
            if item.get("kind") == "proposed" and item.get("proposal_id")
        }
        decisions: dict[str, StartingStateItemDecision] = {}
        for item in payload.items:
            if item.proposal_id in decisions:
                raise HTTPException(status_code=422, detail={
                    "code": "duplicate_baseline_decision",
                    "error_details": {"error_message": "Each Starting State fact can be decided only once."},
                })
            decisions[item.proposal_id] = item

        supplied_ids = set(decisions)
        if supplied_ids != visible_ids:
            raise HTTPException(status_code=409, detail={
                "code": "baseline_draft_changed",
                "error_details": {"error_message": "The Starting State draft changed. Refresh it and review again before confirming."},
                "expected_proposal_ids": sorted(visible_ids),
            })

        # Exact duplicates suppressed from the draft are deterministic no-ops,
        # not extra human decisions. Mark them not applied as part of the same
        # confirmation so hidden duplicate Reviews cannot keep setup open.
        for proposal_id in set(expected) - visible_ids:
            decisions[proposal_id] = StartingStateItemDecision(
                proposal_id=proposal_id, decision="reject"
            )

        by_review: dict[str, list[tuple[dict[str, Any], StartingStateItemDecision]]] = {}
        for proposal_id, decision in decisions.items():
            proposal = expected[proposal_id]
            by_review.setdefault(proposal["review_id"], []).append((proposal, decision))

        for review_id, entries in by_review.items():
            review_decisions: list[str] = []
            for proposal, decision in entries:
                review_decisions.append(decision.decision)
                if decision.decision == "reject":
                    connection.execute(
                        "UPDATE proposed_state_changes SET status='not_applied', decided_at=CURRENT_TIMESTAMP "
                        "WHERE id=? AND status='pending'",
                        (proposal["id"],),
                    )
                    continue

                original_statement = " ".join((proposal.get("proposed_statement") or "").split()).strip()
                final_statement = " ".join((decision.statement if decision.statement is not None else original_statement).split()).strip()
                if not final_statement:
                    raise HTTPException(status_code=422, detail={
                        "code": "blank_starting_state_fact",
                        "error_details": {"error_message": "A Starting State fact cannot be blank."},
                    })

                proposal_for_apply = dict(proposal)
                proposal_for_apply["proposed_area_id"] = _ensure_area(
                    connection,
                    decision.area_name if decision.area_name is not None else proposal.get("proposed_area_name"),
                )
                _apply_proposal(
                    connection,
                    proposal_for_apply,
                    adjusted_statement=final_statement if _norm(final_statement) != _norm(original_statement) else None,
                )
                connection.execute(
                    "UPDATE proposed_state_changes SET status='accepted', decided_at=CURRENT_TIMESTAMP "
                    "WHERE id=? AND status='pending'",
                    (proposal["id"],),
                )

                history = connection.execute(
                    "SELECT state_item_id FROM history_transitions WHERE proposed_change_id=? "
                    "ORDER BY changed_at DESC, id DESC LIMIT 1",
                    (proposal["id"],),
                ).fetchone()
                if history:
                    topic = " ".join((decision.topic if decision.topic is not None else proposal.get("proposed_topic") or "").split()).strip()
                    if topic:
                        connection.execute(
                            "UPDATE current_state_items SET topic=? WHERE id=? AND project_id=? AND status='active'",
                            (topic[:120], history["state_item_id"], project_id_of(connection)),
                        )

            connection.execute(
                "UPDATE review_issues SET status='resolved', resolution=?, resolution_note=?, resolved_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND status='open'",
                (_review_resolution(review_decisions), "Confirmed as part of Starting State.", review_id),
            )

        connection.execute(
            "UPDATE projects SET baseline_completed_at=CURRENT_TIMESTAMP WHERE id=?",
            (project_id_of(connection),),
        )
        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise

    return {
        "project_id": project_id_of(connection),
        "status": "established",
        "state": list_state(connection),
        "questions": list_questions(connection, "open"),
        "history": list_history(connection),
    }


@contextmanager
def _request_connection(settings: Any, request: Request):
    connection = connect(settings.connection_url())
    try:
        row = connection.execute("SELECT project_id FROM active_project WHERE id=1").fetchone()
        if row:
            connection.project_id = row["project_id"]
        requested = request.headers.get("X-State-Project-Id")
        if requested:
            exists = connection.execute("SELECT id FROM projects WHERE id=?", (requested,)).fetchone()
            if exists:
                connection.project_id = requested
        yield connection
    finally:
        connection.close()


def register_baseline_draft_routes(app: Any, settings: Any) -> None:
    @app.get("/api/baseline/draft")
    def get_baseline_draft(request: Request) -> dict[str, Any]:
        with _request_connection(settings, request) as connection:
            return starting_state_draft(connection)

    @app.post("/api/baseline/confirm")
    def post_confirm_starting_state(payload: ConfirmStartingStateInput, request: Request) -> dict[str, Any]:
        with _request_connection(settings, request) as connection:
            return confirm_starting_state(connection, payload)
