"""Authoritative Product Health aggregation for State.

This module intentionally derives dashboard measures from State's maintained
records instead of writing a second analytics state. Counts are project-scoped
through the existing read models and one Evidence item may appear in multiple
outcome categories when that reflects what actually happened.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import median
from typing import Any

from db import project_id_of
from review_service import list_evidence, list_history, list_questions, list_reviews


def _as_utc(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _hours_between(start: Any, end: Any) -> float | None:
    start_dt = _as_utc(start)
    end_dt = _as_utc(end)
    if not start_dt or not end_dt:
        return None
    return round(max(0.0, (end_dt - start_dt).total_seconds() / 3600), 1)


def _age_hours(value: Any, now: datetime) -> float | None:
    return _hours_between(value, now)


def _duration_summary(items: list[dict], start_key: str, end_key: str) -> dict:
    values = [
        value
        for item in items
        if (value := _hours_between(item.get(start_key), item.get(end_key))) is not None
    ]
    if not values:
        return {"sample_size": 0, "median_hours": None, "average_hours": None}
    return {
        "sample_size": len(values),
        "median_hours": round(float(median(values)), 1),
        "average_hours": round(sum(values) / len(values), 1),
    }


def _within_days(value: Any, now: datetime, days: int) -> bool:
    timestamp = _as_utc(value)
    if not timestamp:
        return False
    age_seconds = (now - timestamp).total_seconds()
    return 0 <= age_seconds <= days * 86400


def _record_ref(kind: str, item: dict, now: datetime) -> dict:
    if kind == "review":
        return {
            "kind": "review",
            "id": item.get("id"),
            "label": item.get("decision_question") or "Review needs attention",
            "created_at": item.get("created_at"),
            "age_hours": _age_hours(item.get("created_at"), now),
            "review_type": item.get("review_type"),
        }
    return {
        "kind": "question",
        "id": item.get("id"),
        "label": item.get("text") or "Open Question",
        "created_at": item.get("created_at"),
        "age_hours": _age_hours(item.get("created_at"), now),
        "blocking": bool(item.get("blocking")),
        "blocks": item.get("blocks"),
    }


def _oldest_unresolved(open_reviews: list[dict], open_questions: list[dict], now: datetime) -> dict | None:
    candidates = [
        *(_record_ref("review", item, now) for item in open_reviews),
        *(_record_ref("question", item, now) for item in open_questions),
    ]
    candidates = [item for item in candidates if _as_utc(item.get("created_at"))]
    if not candidates:
        return None
    return min(candidates, key=lambda item: _as_utc(item["created_at"]))


def _interpretation_summary(connection) -> dict:
    rows = connection.execute(
        "SELECT ir.provider, ir.model_identifier, ir.processing_status, COUNT(*) AS total "
        "FROM interpretation_records ir "
        "JOIN evidence e ON e.id=ir.evidence_id "
        "WHERE e.project_id=? "
        "GROUP BY ir.provider, ir.model_identifier, ir.processing_status "
        "ORDER BY ir.provider, ir.model_identifier, ir.processing_status",
        (project_id_of(connection),),
    ).fetchall()
    return {
        "items": [dict(row) for row in rows],
        "latency_persisted": False,
        "token_usage_persisted": False,
        "estimated_cost_available": False,
    }


def build_product_health(connection, *, now: datetime | None = None) -> dict:
    """Return one project-scoped Product Health snapshot.

    The response deliberately avoids a composite health score. Evidence outcome
    counts are non-exclusive because one Evidence item may legitimately cause a
    State change and answer a Question in the same reviewed decision.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    else:
        now = now.astimezone(timezone.utc)

    evidence = list_evidence(connection)
    open_reviews = list_reviews(connection, "open")
    resolved_reviews = list_reviews(connection, "resolved")
    history = list_history(connection)
    open_questions = list_questions(connection, "open")
    resolved_questions = list_questions(connection, "resolved")
    stopped_questions = list_questions(connection, "stopped")

    all_reviews = [*open_reviews, *resolved_reviews]
    all_questions = [*open_questions, *resolved_questions, *stopped_questions]

    reviews_by_evidence: dict[str, list[dict]] = defaultdict(list)
    for review in all_reviews:
        for evidence_item in review.get("evidence_items") or []:
            evidence_id = evidence_item.get("id")
            if evidence_id:
                reviews_by_evidence[evidence_id].append(review)

    history_review_ids = {item.get("review_id") for item in history if item.get("review_id")}
    state_change_evidence_ids = {
        evidence_item.get("id")
        for transition in history
        for evidence_item in transition.get("evidence_items") or []
        if evidence_item.get("id")
    }

    question_evidence_ids = {
        question.get("source_evidence_id")
        for question in all_questions
        if question.get("source_evidence_id")
    }
    for review in all_reviews:
        if review.get("resolves_question_ids") or review.get("review_type") == "open_question":
            question_evidence_ids.update(
                item.get("id")
                for item in review.get("evidence_items") or []
                if item.get("id")
            )

    pending_review_evidence_ids = {
        item.get("id")
        for review in open_reviews
        for item in review.get("evidence_items") or []
        if item.get("id")
    }
    reviewed_no_state_change_ids = set()
    for evidence_item in evidence:
        evidence_id = evidence_item.get("id")
        linked_resolved = [r for r in reviews_by_evidence.get(evidence_id, []) if r.get("status") == "resolved"]
        if linked_resolved and not any(r.get("id") in history_review_ids for r in linked_resolved):
            reviewed_no_state_change_ids.add(evidence_id)

    reviewed_evidence_ids = set(reviews_by_evidence)
    all_evidence_ids = {item.get("id") for item in evidence if item.get("id")}
    no_review_ids = all_evidence_ids - reviewed_evidence_ids

    processing_statuses = Counter(item.get("processing_status") or "unknown" for item in evidence)
    proposal_statuses = Counter(
        proposal.get("status") or "unknown"
        for review in all_reviews
        for proposal in review.get("proposals") or []
    )

    recent_transitions = [
        {
            "id": item.get("id"),
            "state_item_id": item.get("state_item_id"),
            "review_id": item.get("review_id"),
            "transition_type": item.get("transition_type"),
            "changed_at": item.get("changed_at"),
            "old_statement": item.get("old_statement"),
            "new_statement": item.get("new_statement"),
            "accepted_as_adjusted": bool(item.get("accepted_as_adjusted")),
        }
        for item in history[:10]
    ]

    return {
        "generated_at": now.isoformat(),
        "project_id": project_id_of(connection),
        "attention": {
            "pending_reviews": len(open_reviews),
            "blocking_questions": sum(1 for item in open_questions if item.get("blocking")),
            "other_open_questions": sum(1 for item in open_questions if not item.get("blocking")),
            "oldest_unresolved": _oldest_unresolved(open_reviews, open_questions, now),
            "reviews": [_record_ref("review", item, now) for item in open_reviews[:8]],
            "questions": [_record_ref("question", item, now) for item in open_questions[:8]],
        },
        "changes": {
            "state_changes_7d": sum(1 for item in history if _within_days(item.get("changed_at"), now, 7)),
            "state_changes_30d": sum(1 for item in history if _within_days(item.get("changed_at"), now, 30)),
            "resolved_reviews_7d": sum(1 for item in resolved_reviews if _within_days(item.get("resolved_at"), now, 7)),
            "resolved_reviews_30d": sum(1 for item in resolved_reviews if _within_days(item.get("resolved_at"), now, 30)),
            "resolved_questions_7d": sum(1 for item in resolved_questions if _within_days(item.get("resolved_at"), now, 7)),
            "resolved_questions_30d": sum(1 for item in resolved_questions if _within_days(item.get("resolved_at"), now, 30)),
            "recent_transitions": recent_transitions,
        },
        "evidence_outcomes": {
            "total_evidence": len(evidence),
            "with_state_change": len(state_change_evidence_ids),
            "with_question_outcome": len(question_evidence_ids & all_evidence_ids),
            "reviewed_no_state_change": len(reviewed_no_state_change_ids),
            "pending_review": len(pending_review_evidence_ids),
            "no_review_yet": len(no_review_ids),
            "processing_statuses": dict(sorted(processing_statuses.items())),
            "proposal_statuses": dict(sorted(proposal_statuses.items())),
            "non_exclusive": True,
        },
        "lifecycle": {
            "review_resolution": _duration_summary(resolved_reviews, "created_at", "resolved_at"),
            "question_resolution": _duration_summary(
                [*resolved_questions, *stopped_questions], "created_at", "resolved_at"
            ),
            "oldest_pending_review_hours": max(
                (_age_hours(item.get("created_at"), now) or 0 for item in open_reviews),
                default=None,
            ),
            "oldest_open_question_hours": max(
                (_age_hours(item.get("created_at"), now) or 0 for item in open_questions),
                default=None,
            ),
        },
        "operational_ai": _interpretation_summary(connection),
    }
