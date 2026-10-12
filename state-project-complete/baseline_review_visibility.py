"""Keep routine Starting State assembly out of the human Review queue.

During Baseline Setup, straightforward new facts are reviewed together in the
Starting State draft. Questions, conflicts, risks, and changes to already-
maintained facts remain individual Reviews. The underlying Review rows are
preserved for provenance and confirmation; this module only changes which open
Reviews are presented as action items.
"""
from __future__ import annotations

from typing import Any

from baseline_grounding import review_unsupported_specifics
from baseline_setup import is_baseline_setup


def is_routine_starting_state_review(review: dict[str, Any]) -> bool:
    """Return True only for routine baseline creates handled by the draft.

    A create that adds a year or amount its source never states is not routine
    (#240): it stays in the Review queue for an individual decision.
    """
    if review.get("review_type") != "missing_understanding":
        return False
    pending = [p for p in (review.get("proposals") or []) if p.get("status") == "pending"]
    if not pending or not all(p.get("operation") == "create" for p in pending):
        return False
    return not review_unsupported_specifics(review)


def with_actionable_reviews(inner):
    """Layer for ``review_service.list_presented_reviews``: drop routine baseline draft facts.

    Resolved Reviews are never filtered because History/provenance must retain
    the actual decision record. Once Baseline Setup is finished, the normal
    Review list is restored unchanged. The raw Review rows remain in
    review_service.list_reviews for the Starting State draft/confirmation code.
    """

    def list_actionable_reviews(connection: Any, status: str = "open") -> list[dict[str, Any]]:
        reviews = inner(connection, status)
        if status != "open" or not is_baseline_setup(connection):
            return reviews
        return [review for review in reviews if not is_routine_starting_state_review(review)]

    return list_actionable_reviews
