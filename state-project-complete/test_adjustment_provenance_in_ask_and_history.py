"""Regression coverage for the holistic-QA-pass follow-up (state.md #106/
#109): #106's adjustment provenance is correctly stored on the backend, but
the initial live pass found it invisible in History and unavailable to Ask.
This pins the fix: list_history() exposes the AI's original wording
separately from the human-approved value, Ask's candidate context carries it
(only for genuinely adjusted transitions), and Ask's shared grounding rules
tell the model how to use it without ever treating it as an alternate
current fact.
"""
from __future__ import annotations

import sqlite3

from ask_service import _clean_visible_ask_text, _compact_candidates, _grounding_rules
from database_migration_backed import get_test_db
from review_service import list_history, resolve_review


def _seed_review_with_update_proposal(conn, review_id, proposal_id, state_id, proposed_statement, expected_version=1):
    conn.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
        "VALUES (?, 'proposed_update', ?, 'Testing adjustment provenance visibility', 'open')",
        (review_id, f"Should {state_id} change?"),
    )
    conn.execute(
        "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, "
        "proposed_statement, rationale, expected_state_version, status) "
        "VALUES (?, ?, 'update', ?, ?, 'Evidence says so', ?, 'pending')",
        (proposal_id, review_id, state_id, proposed_statement, expected_version),
    )
    conn.commit()


def _seeded_connection():
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    connection.execute(
        "INSERT INTO current_state_items(id, topic, statement, version) VALUES ('k-1', 'launch', 'Original current statement.', 1)"
    )
    connection.commit()
    return db_context, connection


def test_list_history_exposes_ai_original_wording_separately_from_approved_wording():
    db_context, conn = _seeded_connection()
    try:
        _seed_review_with_update_proposal(conn, "r-1", "p-1", "k-1", "AI proposed this exact wording.")
        resolve_review(conn, "r-1", "accept", adjustments={"p-1": "Human revised this to something else."})
        history = list_history(conn)
        assert len(history) == 1
        entry = history[0]
        assert entry["accepted_as_adjusted"] == 1
        assert entry["ai_proposed_statement"] == "AI proposed this exact wording."
        assert entry["new_statement"] == "Human revised this to something else."
    finally:
        conn.close()
        db_context.__exit__(None, None, None)


def test_list_history_ai_proposed_equals_new_statement_for_a_plain_accept():
    """Not adjusted: both fields exist (same JOIN), but accepted_as_adjusted
    is 0 and they're identical -- nothing for the UI/Ask to distinguish."""
    db_context, conn = _seeded_connection()
    try:
        _seed_review_with_update_proposal(conn, "r-1", "p-1", "k-1", "Accepted exactly as proposed.")
        resolve_review(conn, "r-1", "accept")
        history = list_history(conn)
        entry = history[0]
        assert entry["accepted_as_adjusted"] == 0
        assert entry["ai_proposed_statement"] == entry["new_statement"] == "Accepted exactly as proposed."
    finally:
        conn.close()
        db_context.__exit__(None, None, None)


def test_ask_candidates_carry_adjustment_provenance_only_for_adjusted_transitions():
    db_context, conn = _seeded_connection()
    try:
        _seed_review_with_update_proposal(conn, "r-adjusted", "p-adjusted", "k-1", "AI original text.")
        resolve_review(conn, "r-adjusted", "accept", adjustments={"p-adjusted": "Human revised text."})

        conn.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES ('k-2', 'security', 'Second item.', 1)")
        conn.commit()
        _seed_review_with_update_proposal(conn, "r-plain", "p-plain", "k-2", "Accepted as-is.")
        resolve_review(conn, "r-plain", "accept")

        candidates = _compact_candidates(conn)
        history_by_new_statement = {h["new_statement"]: h for h in candidates["history"]}

        adjusted_candidate = history_by_new_statement["Human revised text."]
        assert adjusted_candidate["accepted_as_adjusted"] is True
        assert adjusted_candidate["ai_proposed_statement"] == "AI original text."

        plain_candidate = history_by_new_statement["Accepted as-is."]
        assert "accepted_as_adjusted" not in plain_candidate
        assert "ai_proposed_statement" not in plain_candidate
    finally:
        conn.close()
        db_context.__exit__(None, None, None)


def test_grounding_rules_explain_adjustment_provenance_without_treating_it_as_current():
    rules = _grounding_rules()
    assert "The approved wording is the only authoritative current value" in rules
    assert "never an alternate current fact" in rules
    # Regression guard (state.md #106/#109 holistic follow-up, staging QA
    # 2026-09-14): the rules text used to spell out raw field/key names
    # (accepted_as_adjusted, ai_proposed_statement) as vocabulary for the
    # model, which primed it to echo those exact identifiers as visible
    # answer text. The rules must describe the concept in plain language and
    # explicitly forbid surfacing raw field/key names instead.
    assert "accepted_as_adjusted" not in rules
    assert "ai_proposed_statement" not in rules
    assert "never surface a raw internal field or key name" in rules


def test_clean_visible_ask_text_strips_leaked_internal_field_names():
    """Pins the exact staging QA finding (2026-09-14): Ask's adjustment-
    provenance citations echoed raw internal field names as visible answer
    text (e.g. "ai_proposed_statement omitted 'verified by Security' clause",
    and a bare "new_statement from" trailing a citation line). No known
    internal field/key name should survive _clean_visible_ask_text, even if
    a future prompt change reintroduces the model's temptation to echo one.
    """
    leaked_examples = [
        "Recently accepted (2026-09-14) with human adjustment; ai_proposed_statement omitted 'verified by Security' clause",
        "Human's revised (accepted) version: 'Feature access...'\nnew_statement from",
        "AI's original proposal: 'Feature access requires...'\nai_proposed_statement",
    ]
    for leaked in leaked_examples:
        cleaned = _clean_visible_ask_text(leaked, set())
        assert cleaned is None or "ai_proposed_statement" not in cleaned
        assert cleaned is None or "new_statement" not in cleaned
        assert cleaned is None or "accepted_as_adjusted" not in cleaned


def test_clean_visible_ask_text_preserves_legitimate_project_terminology():
    """Regression guard for a real bug found in staging-hardening review
    (2026-09-14): the first fix for the leak above used a blanket regex
    that stripped ANY underscore-joined token, not just known internal
    field names -- so it also silently deleted legitimate project
    terminology a user might ask about or a record might quote, changing
    answer meaning rather than just formatting (e.g. "The vendor must meet
    SOC_2 controls." became "The vendor must meet controls."). The fix
    must strip only the known internal field/key names in
    _INTERNAL_JSON_FIELD_NAMES, not every underscore-shaped token.
    """
    legitimate_terms = ["SOC_2", "api_v2", "feature_flag_beta", "review_quality_104_105", "snake_case"]
    for term in legitimate_terms:
        text = f"The vendor must meet {term} controls"
        cleaned = _clean_visible_ask_text(text, set())
        assert cleaned is not None and term in cleaned, f"legitimate terminology was stripped: {term!r} from {text!r} -> {cleaned!r}"
