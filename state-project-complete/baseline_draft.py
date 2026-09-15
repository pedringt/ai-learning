"""Read-only Starting State draft for Baseline Setup (Issue #163).

This module deliberately does not authorize or mutate Current State. It turns
existing Current State, pending baseline proposals, and Questions into one
coherent read model so the product can present a Starting State draft without
asking the user to mentally assemble dozens of separate Reviews.

Authority remains unchanged:
    AI interprets -> software enforces -> people authorize.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from fastapi import Request

from baseline_setup import is_baseline_setup
from db import connect, project_id_of
from review_service import list_questions, list_reviews, list_state

_SETUP_AREA_DESCRIPTION = "Baseline section created from human-authorized project material."


def _norm(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def _clean_area_description(value: str | None) -> str:
    clean = " ".join((value or "").split()).strip()
    return "" if clean == _SETUP_AREA_DESCRIPTION else clean


def _proposal_statement(proposal: dict[str, Any]) -> str:
    return " ".join((proposal.get("adjusted_statement") or proposal.get("proposed_statement") or "").split()).strip()


def starting_state_draft(connection: Any) -> dict[str, Any]:
    """Build a read-only baseline draft from already-persisted product objects.

    Routine baseline creates and suggested Questions are represented in the
    draft. Existing-state changes, retirements, and risk Reviews remain separate
    because they require a distinct human judgment and should not be hidden
    inside a bulk starting-state confirmation later.
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

    return {
        "project_id": project_id,
        "status": "baseline_setup" if is_baseline_setup(connection) else "established",
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
        },
        "needs_individual_review": needs_individual_review,
        "authority": "draft_only",
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
