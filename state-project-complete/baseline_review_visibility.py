"""Keep routine Starting State assembly out of the human Review queue.

During Baseline Setup, straightforward new facts are reviewed together in the
Starting State draft. Questions, conflicts, risks, and changes to already-
maintained facts remain individual Reviews. The underlying Review rows are
preserved for provenance and confirmation; this module only changes which open
Reviews are presented as action items.
"""
from __future__ import annotations

from typing import Any

from baseline_setup import is_baseline_setup
from review_service import list_reviews as _list_reviews


def is_routine_starting_state_review(review: dict[str, Any]) -> bool:
    """Return True only for routine baseline creates handled by the draft."""
    if review.get("review_type") != "missing_understanding":
        return False
    pending = [p for p in (review.get("proposals") or []) if p.get("status") == "pending"]
    return bool(pending) and all(p.get("operation") == "create" for p in pending)


def list_actionable_reviews(connection: Any, status: str = "open") -> list[dict[str, Any]]:
    """User-facing Review list with routine baseline draft facts removed.

    Resolved Reviews are never filtered because History/provenance must retain
    the actual decision record. Once Baseline Setup is finished, the normal
    Review list is restored unchanged.
    """
    reviews = _list_reviews(connection, status)
    if status != "open" or not is_baseline_setup(connection):
        return reviews
    return [review for review in reviews if not is_routine_starting_state_review(review)]


def install_baseline_review_visibility(api_module: Any) -> None:
    """Use actionable Reviews for API/Ask presentation, not for draft assembly."""
    if getattr(api_module, "_baseline_review_visibility_installed", False):
        return

    # api_core resolves this global at request time for bootstrap, attention,
    # Evidence responses, reanalysis, and GET /api/reviews. The raw Review rows
    # remain in review_service and are therefore still available to the
    # Starting State draft/confirmation code.
    api_module.list_reviews = list_actionable_reviews

    # Ask imports list_reviews directly from review_service, so patch its module
    # global as well. Otherwise Ask could still tell a user that 20 routine
    # baseline facts are 20 separate Reviews even though the UI correctly shows
    # one Starting State draft.
    import ask_service

    ask_service.list_reviews = list_actionable_reviews
    api_module._baseline_review_visibility_installed = True
