"""Privacy-safe live Review outcome analytics.

This module derives aggregate human-review outcomes from State's authoritative
Review and proposal records. It never exports Review wording, Evidence content,
Current State statements, or human notes.

An edit is treated as human correction effort, not automatically as an AI error.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone


def _normalize(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def _parse_ts(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        result = value
    else:
        try:
            result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def _within_days(value, now: datetime, days: int) -> bool:
    parsed = _parse_ts(value)
    return bool(parsed and timedelta(0) <= now - parsed <= timedelta(days=days))


def _rows(connection, query: str, params=()) -> list[dict]:
    return [dict(row) for row in connection.execute(query, params).fetchall()]


def derive_review_quality(connection, project_id: str | None, now: datetime | None = None, days: int = 30) -> dict:
    """Return content-free live Review outcome aggregates.

    Categories intentionally describe observable workflow outcomes rather than
    judging model correctness. In particular, ``accepted_with_material_edits``
    means a human changed proposed wording before authorization; that is a
    correction-burden signal, not proof the original interpretation was wrong.
    """
    now = now or datetime.now(timezone.utc)
    review_where = " WHERE project_id=?" if project_id else ""
    review_params = (project_id,) if project_id else ()
    reviews = _rows(
        connection,
        "SELECT id,review_type,status,resolution,resolved_at FROM review_issues" + review_where,
        review_params,
    )
    resolved = [
        review for review in reviews
        if review.get("status") == "resolved" and _within_days(review.get("resolved_at"), now, days)
    ]
    review_ids = [review["id"] for review in resolved]
    proposals_by_review: dict[str, list[dict]] = {review_id: [] for review_id in review_ids}
    questions_by_review: dict[str, list[dict]] = {review_id: [] for review_id in review_ids}

    if review_ids:
        placeholders = ",".join("?" for _ in review_ids)
        proposals = _rows(
            connection,
            f"SELECT review_id,status,proposed_statement,adjusted_statement FROM proposed_state_changes WHERE review_id IN ({placeholders})",
            tuple(review_ids),
        )
        for proposal in proposals:
            proposals_by_review.setdefault(proposal["review_id"], []).append(proposal)
        question_proposals = _rows(
            connection,
            f"SELECT review_id,status FROM proposed_questions WHERE review_id IN ({placeholders})",
            tuple(review_ids),
        )
        for proposal in question_proposals:
            questions_by_review.setdefault(proposal["review_id"], []).append(proposal)

    outcomes = Counter()
    by_review_type: dict[str, Counter] = {}
    material_edit_reviews = 0
    state_proposal_accept_reviews = 0

    for review in resolved:
        review_id = review["id"]
        resolution = review.get("resolution") or "unknown"
        review_type = review.get("review_type") or "unknown"
        state_proposals = proposals_by_review.get(review_id, [])
        question_proposals = questions_by_review.get(review_id, [])

        accepted_state = [p for p in state_proposals if p.get("status") == "accepted"]
        materially_edited = any(
            p.get("adjusted_statement") is not None
            and _normalize(p.get("adjusted_statement")) != _normalize(p.get("proposed_statement"))
            for p in accepted_state
        )

        if accepted_state:
            state_proposal_accept_reviews += 1
            if materially_edited:
                material_edit_reviews += 1
                category = "accepted_with_material_edits"
            else:
                category = "accepted_as_proposed"
        elif any(p.get("status") == "accepted" for p in question_proposals):
            category = "question_suggestion_accepted"
        elif resolution in {"question_created", "question_linked"}:
            category = resolution
        elif resolution == "not_applied":
            category = "rejected_or_not_applied"
        elif resolution == "confirmed_current":
            category = "confirmed_current"
        elif resolution == "partially_applied":
            category = "partially_applied"
        elif resolution == "not_needed":
            category = "not_needed"
        else:
            category = "other_resolved"

        outcomes[category] += 1
        by_review_type.setdefault(review_type, Counter())[category] += 1

    total = len(resolved)
    accepted_unchanged = outcomes.get("accepted_as_proposed", 0)
    accepted_edited = outcomes.get("accepted_with_material_edits", 0)
    rejected = outcomes.get("rejected_or_not_applied", 0)

    return {
        "window_days": days,
        "resolved_reviews": total,
        "outcomes": dict(outcomes),
        "accepted_as_proposed_rate": accepted_unchanged / total if total else None,
        "material_edit_rate": accepted_edited / total if total else None,
        "rejection_or_not_applied_rate": rejected / total if total else None,
        "material_edit_rate_among_accepted_state_proposals": (
            material_edit_reviews / state_proposal_accept_reviews if state_proposal_accept_reviews else None
        ),
        "by_review_type": {key: dict(value) for key, value in by_review_type.items()},
        "interpretation_note": (
            "Material edits measure human correction effort. They do not by themselves prove the AI interpretation was wrong."
        ),
        "content_included": False,
    }
