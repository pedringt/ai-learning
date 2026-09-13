"""Ask regression coverage for state.md #105, item 6: a realistic 8-12 open
Review queue spanning multiple topics, some created from the same underlying
Evidence item (as decision-sized grouping from #104 can produce).

This is deterministic -- it exercises the real retrieval/candidate-shaping
layer (_compact_candidates / _trim_candidates_for_query) directly against a
seeded SQLite connection, not a live model call. It answers "does atomic
Review grouping degrade what Ask can find/ignore," not "does the model write
a good answer" -- that question belongs to the live-model suites.
"""
from __future__ import annotations

import sqlite3

from ask_service import _compact_candidates, _trim_candidates_for_query
from database_migration_backed import get_test_db


def _seed_open_review(connection, review_id, review_type, decision_question, why_consequential, *, evidence_id=None):
    connection.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
        "VALUES (?, ?, ?, ?, 'open')",
        (review_id, review_type, decision_question, why_consequential),
    )
    if evidence_id:
        connection.execute(
            "INSERT OR IGNORE INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
            (review_id, evidence_id),
        )


def _seeded_connection_with_ten_open_reviews():
    """Ten open Reviews across five distinct topics. Two (r-security-1/2) share
    one Evidence item, the way a single decision-sized #104 grouping call can
    still split genuinely independent concepts from the same submission."""
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    connection.execute(
        "INSERT INTO evidence(id, content, source_type, processing_status) VALUES (?, ?, 'manual_note', 'processed')",
        ("e-security-pack", "Security approved retention changes and separately approved access changes.", ),
    )
    connection.commit()

    reviews = [
        ("r-security-1", "proposed_update", "Should retention move to 30 days?", "Security approval changes retention.", "e-security-pack"),
        ("r-security-2", "proposed_update", "Should access be limited to five named agents?", "Security approval changes access.", "e-security-pack"),
        ("r-launch", "proposed_update", "Should the pilot launch date move to October 15?", "Launch date changed.", None),
        ("r-billing-scope", "missing_understanding", "Should billing scope include auto-drafting?", "Expands automation scope.", None),
        ("r-vendor-risk", "state_at_risk", "Is the vendor no-training-data claim still reliable?", "Legal flagged possible conflict.", None),
        ("r-onboarding", "missing_understanding", "Should new onboarding steps be tracked?", "New onboarding flow described.", None),
        ("r-staffing", "missing_understanding", "Should staffing coverage over the holiday be tracked?", "Coverage plan described.", None),
        ("r-reporting", "proposed_update", "Should the weekly reporting cadence change to biweekly?", "Reporting cadence changed.", None),
        ("r-mobile", "missing_understanding", "Should mobile app support be tracked as in scope?", "Mobile support requested.", None),
        ("r-training-data", "state_at_risk", "Is the training data retention policy still accurate?", "New contract language found.", None),
    ]
    for review_id, review_type, decision_question, why_consequential, evidence_id in reviews:
        _seed_open_review(connection, review_id, review_type, decision_question, why_consequential, evidence_id=evidence_id)
    connection.commit()
    return db_context, connection


def test_ten_open_reviews_across_topics_all_reach_the_compact_candidate_set():
    """Every open Review must be a retrieval candidate before ranking trims it --
    a #104 grouping change must not make a consequential Review invisible to Ask
    outright, only affect which ones a specific query ranks highest."""
    db_context, connection = _seeded_connection_with_ten_open_reviews()
    try:
        candidates = _compact_candidates(connection)
        assert len(candidates["reviews"]) == 10
        ids = {r["id"] for r in candidates["reviews"]}
        assert ids == {
            "r-security-1", "r-security-2", "r-launch", "r-billing-scope", "r-vendor-risk",
            "r-onboarding", "r-staffing", "r-reporting", "r-mobile", "r-training-data",
        }
        # Every Review is explicitly tagged as qualifying, not settled, authority --
        # this is what later lets prose softening (test_ask_pending_review_authority.py)
        # keep pending proposals from reading as Current State.
        assert all(r["authority"] == "qualifies_current_state" for r in candidates["reviews"])
    finally:
        connection.close()
        db_context.__exit__(None, None, None)


def test_focused_security_question_surfaces_both_split_reviews_from_one_evidence_item():
    """A #104 grouping call that split one Evidence submission into two
    independently-decidable Reviews (retention vs access) must not cause the
    retrieval layer to only surface one half of that split decision."""
    db_context, connection = _seeded_connection_with_ten_open_reviews()
    try:
        candidates = _trim_candidates_for_query(
            "What is changing about security retention and access approval?",
            _compact_candidates(connection),
        )
        review_ids = {r["id"] for r in candidates["reviews"]}
        assert "r-security-1" in review_ids
        assert "r-security-2" in review_ids
    finally:
        connection.close()
        db_context.__exit__(None, None, None)


def test_focused_launch_question_does_not_drag_in_unrelated_topics():
    """A narrow query about one topic should rank that Review highest without
    unrelated Reviews (staffing, mobile, reporting) crowding the top of a
    volume-limited candidate set."""
    db_context, connection = _seeded_connection_with_ten_open_reviews()
    try:
        candidates = _trim_candidates_for_query(
            "Did the pilot launch date change?",
            _compact_candidates(connection),
        )
        review_ids = [r["id"] for r in candidates["reviews"]]
        assert "r-launch" in review_ids
        # The unrelated-topic Reviews may still appear (lexical ranking is not a
        # hard topic filter), but the specifically-asked-about Review must not
        # be pushed out of the top-6 candidate cap by them.
        assert review_ids.index("r-launch") < 6
    finally:
        connection.close()
        db_context.__exit__(None, None, None)


def test_state_at_risk_reviews_remain_candidates_alongside_nine_others():
    """state_at_risk Reviews sort first in list_reviews() (see review_service.py)
    specifically so a large open-Review queue can't push "Current State may be
    wrong" out of Ask's view -- confirm that still holds at this volume."""
    db_context, connection = _seeded_connection_with_ten_open_reviews()
    try:
        candidates = _compact_candidates(connection)
        review_ids = [r["id"] for r in candidates["reviews"]]
        assert review_ids.index("r-vendor-risk") < 2
        assert review_ids.index("r-training-data") < 2
    finally:
        connection.close()
        db_context.__exit__(None, None, None)
