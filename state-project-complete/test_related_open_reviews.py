from __future__ import annotations

from database_migration_backed import get_test_db
from review_service import list_reviews


def _insert_review(connection, review_id, review_type, decision_question="Decision?", status="open"):
    connection.execute(
        "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) "
        "VALUES (?,?,?,?,?)",
        (review_id, review_type, decision_question, "Why it matters", status),
    )


def _insert_state_item(connection, state_id, topic="topic"):
    connection.execute(
        "INSERT INTO current_state_items(id,topic,statement,version) VALUES (?,?,?,1)",
        (state_id, topic, f"Statement for {state_id}"),
    )


def _insert_question(connection, question_id, text="Question?"):
    connection.execute(
        "INSERT INTO questions(id,text,status,blocking) VALUES (?,?,'open',0)",
        (question_id, text),
    )


def _link_state(connection, review_id, state_id):
    connection.execute(
        "INSERT INTO review_state_items(review_id,state_item_id) VALUES (?,?)", (review_id, state_id)
    )


def _link_question(connection, review_id, question_id):
    connection.execute(
        "INSERT INTO review_questions(review_id,question_id) VALUES (?,?)", (review_id, question_id)
    )


def _by_id(reviews, review_id):
    return next(r for r in reviews if r["id"] == review_id)


def test_reviews_sharing_a_state_item_are_related_regardless_of_type():
    """Regression coverage for a staging finding (2026-09-13): new evidence
    about vendor retention created a second, differently-typed open Review
    (proposed_update) instead of linking to the existing state_at_risk
    Review about the same topic -- and neither Review's read model gave a
    reviewer any way to see the other existed. Per explicit product
    direction, software must not guess these are "the same decision" and
    auto-merge them (a state_at_risk "is this trustworthy?" and a
    proposed_update "should Current State now say this?" are legitimately
    different human decisions) -- it should only surface the structural fact
    that they touch the same State item, as a pointer for the human.
    """
    with get_test_db() as connection:
        _insert_state_item(connection, "k-data")
        _insert_review(connection, "demo-review-retention", "state_at_risk", "Are the vendor's terms authoritative?")
        _insert_review(connection, "r-new-proposed-update", "proposed_update", "Should State reflect 30-day retention?")
        _link_state(connection, "demo-review-retention", "k-data")
        _link_state(connection, "r-new-proposed-update", "k-data")
        connection.commit()

        reviews = list_reviews(connection, "open")

        risk = _by_id(reviews, "demo-review-retention")
        update = _by_id(reviews, "r-new-proposed-update")
        assert [r["id"] for r in risk["related_open_reviews"]] == ["r-new-proposed-update"]
        assert risk["related_open_reviews"][0]["decision_question"] == "Should State reflect 30-day retention?"
        assert risk["related_open_reviews"][0]["review_type"] == "proposed_update"
        # Symmetric: the new Review also sees the pre-existing one as related.
        assert [r["id"] for r in update["related_open_reviews"]] == ["demo-review-retention"]


def test_reviews_sharing_a_question_are_related():
    with get_test_db() as connection:
        _insert_question(connection, "q-retention")
        _insert_review(connection, "r-a", "open_question", "What are the terms?")
        _insert_review(connection, "r-b", "proposed_update", "Should State reflect the answer?")
        _link_question(connection, "r-a", "q-retention")
        _link_question(connection, "r-b", "q-retention")
        connection.commit()

        reviews = list_reviews(connection, "open")

        assert [r["id"] for r in _by_id(reviews, "r-a")["related_open_reviews"]] == ["r-b"]
        assert [r["id"] for r in _by_id(reviews, "r-b")["related_open_reviews"]] == ["r-a"]


def test_unrelated_reviews_have_no_related_open_reviews():
    with get_test_db() as connection:
        _insert_state_item(connection, "k-a")
        _insert_state_item(connection, "k-b")
        _insert_review(connection, "r-a", "state_at_risk")
        _insert_review(connection, "r-b", "proposed_update")
        _link_state(connection, "r-a", "k-a")
        _link_state(connection, "r-b", "k-b")
        connection.commit()

        reviews = list_reviews(connection, "open")

        assert _by_id(reviews, "r-a")["related_open_reviews"] == []
        assert _by_id(reviews, "r-b")["related_open_reviews"] == []


def test_a_review_with_no_links_at_all_has_no_related_open_reviews():
    with get_test_db() as connection:
        _insert_review(connection, "r-solo", "missing_understanding")
        connection.commit()

        reviews = list_reviews(connection, "open")

        assert _by_id(reviews, "r-solo")["related_open_reviews"] == []


def test_a_resolved_review_sharing_a_state_item_is_not_surfaced_as_related():
    """Only open Reviews are actionable "you have two live decisions here"
    pointers -- a resolved one is already closed out and belongs in History,
    not in a live related-review nudge."""
    with get_test_db() as connection:
        _insert_state_item(connection, "k-data")
        _insert_review(connection, "r-open", "state_at_risk")
        _insert_review(connection, "r-resolved", "proposed_update", status="resolved")
        _link_state(connection, "r-open", "k-data")
        _link_state(connection, "r-resolved", "k-data")
        connection.commit()

        reviews = list_reviews(connection, "open")

        assert _by_id(reviews, "r-open")["related_open_reviews"] == []


def test_related_open_reviews_does_not_include_itself():
    with get_test_db() as connection:
        _insert_state_item(connection, "k-data")
        _insert_review(connection, "r-solo", "state_at_risk")
        _link_state(connection, "r-solo", "k-data")
        connection.commit()

        reviews = list_reviews(connection, "open")

        assert _by_id(reviews, "r-solo")["related_open_reviews"] == []
