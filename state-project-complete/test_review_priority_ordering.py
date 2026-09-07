from __future__ import annotations

from database_migration_backed import get_test_db
from review_service import list_reviews


def _insert_review(connection, review_id, review_type, created_at):
    connection.execute(
        "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,created_at) "
        "VALUES (?,?,?,?,'open',?)",
        (review_id, review_type, f"Decision for {review_id}", f"Why {review_id} matters", created_at),
    )
    connection.commit()


def test_state_at_risk_review_sorts_first_regardless_of_age():
    """Regression: live QA (2026-09-07) found a "Current State may be at
    risk" review could disappear from Ask briefings that take the first N
    reviews, because list_reviews had no consequentiality ordering at all --
    only created_at. A state_at_risk review means Current State may already
    be wrong, which is more urgent than an ordinary proposed_update
    regardless of which one is older. This is the single shared ordering
    every consumer (Workspace's attention list, Open Items, Ask's
    deterministic starters) inherits by taking the first N reviews returned
    here -- none of them re-rank independently.
    """
    with get_test_db() as connection:
        _insert_review(connection, "r-old-update", "proposed_update", "2026-01-01 00:00:00")
        _insert_review(connection, "r-newer-update", "proposed_update", "2026-06-01 00:00:00")
        _insert_review(connection, "r-newest-at-risk", "state_at_risk", "2026-09-01 00:00:00")

        reviews = list_reviews(connection, "open")

        assert [r["id"] for r in reviews] == ["r-newest-at-risk", "r-old-update", "r-newer-update"]


def test_multiple_state_at_risk_reviews_still_order_by_age_among_themselves():
    with get_test_db() as connection:
        _insert_review(connection, "r-at-risk-later", "state_at_risk", "2026-06-01 00:00:00")
        _insert_review(connection, "r-at-risk-earlier", "state_at_risk", "2026-01-01 00:00:00")
        _insert_review(connection, "r-update", "proposed_update", "2025-01-01 00:00:00")

        reviews = list_reviews(connection, "open")

        assert [r["id"] for r in reviews] == ["r-at-risk-earlier", "r-at-risk-later", "r-update"]
