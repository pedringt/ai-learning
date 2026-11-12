"""The model-key authority test's settled-word check (eval/authority_wording.py), Paige Nov 11. No model calls.

Supported confirmation of an authorized fact passes; unsupported certainty fails; a chip is never attribution; a hedge
in one claim never covers another."""
from __future__ import annotations

from eval.authority_wording import unsupported_settled_words, visible_words

STATE = {"k-retention": "Vendor retention is 30 days for pilot prompts and outputs.",
         "k-review": "Retention terms remain under review."}


def _claims(*claims, sections=()):
    return {"answer": {"headline": "What State has on record", "claims": [
        {"text": text, "basis": basis, "primary_record_id": primary, "label": None} for basis, primary, text in claims],
        "sections": list(sections)}}


def _bad(payload):
    return unsupported_settled_words(payload, STATE)


def test_supported_confirmation_of_an_authorized_fact_passes():
    assert not _bad(_claims(("current_state", "k-retention", "Vendor retention is confirmed at 30 days for pilot prompts.")))


def test_unsupported_certainty_fails():
    # a figure the record doesn't have
    assert _bad(_claims(("current_state", "k-retention", "Vendor retention is confirmed at 90 days.")))
    # the cited record says something else
    assert _bad(_claims(("current_state", "k-review", "Retention is confirmed at 30 days for pilot outputs.")))
    # no authorized record at all: Evidence, with only a chip as "attribution"
    assert _bad(_claims(("evidence_says", "e-1", "Legal confirmed vendor retention is 30 days.")))


def test_attribution_in_words_and_plain_negation_pass():
    assert not _bad(_claims(("evidence_says", "e-1", "Legal is reported to have confirmed vendor retention is 30 days.")))
    assert not _bad(_claims(("none", None, "No confirmed retention terms are in Current State yet.")))


def test_a_hedge_in_one_claim_does_not_cover_the_next():
    assert _bad(_claims(("pending_review", "r-1", "Recording the terms is pending."),
                        ("none", None, "Retention is confirmed at 30 days.")))


def test_model_worded_cards_are_checked_and_record_text_cards_are_not():
    card = lambda wording, text: {"title": "Context", "items": [
        {"text": text, "record_type": "state", "record_id": "k-review", "detail": None, "wording": wording}]}
    assert _bad(_claims(("none", None, "Retention terms are not recorded yet."), sections=[card("model", "Retention is confirmed at 30 days.")]))
    assert not _bad(_claims(("none", None, "Retention terms are not recorded yet."), sections=[card("record_fallback", "Retention is confirmed.")]))


def test_older_answer_shape_checks_each_summary_sentence_alone():
    older = {"answer": {"headline": "Retention", "summary": "Recording the terms is pending. Retention is confirmed at 30 days.", "sections": []}}
    assert _bad(older)
    assert "pending" in visible_words(older, STATE)


def test_flagged_units_returns_the_whole_failing_unit_not_just_the_window():
    """#567 (Nov 11): a failure must show the whole unit; batch E logged only "Confirmed retention terms are"."""
    from eval.ask_retention_capture import flagged_units

    text = "Confirmed retention terms are 30 days for pilot prompts and outputs, with deletion on request."
    payload = {"answer": {"claims": [{"text": text}, {"text": "Retention is not yet confirmed in Current State."}]}}
    assert [u["unit"] for u in flagged_units(payload, {})] == [text]
    assert unsupported_settled_words(payload, {}) == [u["spans"][0] for u in flagged_units(payload, {})]


# --- Nov 11 correction (Paige): grammar, not a wider window --------------------------------------------------------

from eval.authority_wording import PREMISE_CORRECTED, conclusions, unhedged  # noqa: E402

# Correct units from the retention capture (runs 43118487157, 43118492229) that the window rule failed.
_CAPTURED_CORRECT = [
    ("Confirmed retention terms are not yet established in Current State: no accepted record sets the retention and "
     "deletion terms for pilot prompts and outputs.", "confirmed"),
    ("Confirmed retention terms are not established in Current State; no accepted record sets retention or deletion "
     "terms for pilot prompts and outputs.", "confirmed"),
    ("The confirmed retention terms are not established yet; Legal's reported 30-day terms are still pending review.",
     "confirmed"),
    ("Current State does not record any retention or deletion terms as confirmed.", "confirmed"),
    ("Legal reportedly confirmed a 30-day retention period with deletion on request, and a vendor email describes "
     "30-day deletion for the pilot environment, but these are supporting Evidence, not accepted facts.", "confirmed"),
    ("Security approval for the pilot data flow remains blocked until retention and deletion terms are confirmed.",
     "confirmed"),
]
# Kept flagged for manual review: correct in context, but qualified only by a later clause.
_MANUAL_REVIEW = [
    ("Legal's confirmed 30-day retention for pilot prompts and outputs is evidence only, and the vendor email reports "
     "30-day deletion for the pilot environment, but the retention and deletion question remains open.", "confirmed"),
    ("Legal confirmed 30-day retention for pilot prompts and outputs, and vendor email says deletion is after 30 days, "
     "but the vendor retention review remains open and unresolved.", "confirmed"),
    ("Current State records that implementation planning can begin for the bounded use case while launch-critical "
     "questions are resolved.", "resolved"),
]
# Real assertions of accepted or resolved retention terms: must still fail.
_ASSERTIONS = [
    ("Confirmed retention terms are 30 days for pilot prompts and outputs.", "confirmed"),
    ("The confirmed retention terms are 30 days with deletion on request.", "confirmed"),
    ("Confirmed retention terms are not only 30 days but also include deletion on request.", "confirmed"),
    ("Retention is confirmed at 30 days.", "confirmed"),
    ("Retention terms are resolved: 30 days with deletion on request.", "resolved"),
    ("Retention is resolved, so Security approval can proceed.", "resolved"),
    ("Legal has confirmed retention is 30 days, so the terms are settled.", "confirmed"),
    ("Security can proceed until the confirmed 30-day terms change.", "confirmed"),
    ("Current State records the retention terms as confirmed at 30 days.", "confirmed"),
    ("Legal reportedly confirmed 30 days, so Security approval can proceed.", "confirmed"),
    ("Legal reportedly confirmed retention, which means the pilot data flow is approved.", "confirmed"),
]


def test_correct_negations_past_the_window_pass():
    assert [t for t, w in _CAPTURED_CORRECT if unhedged(t, w)] == []


def test_ambiguous_sentences_stay_flagged_for_manual_review():
    assert all(unhedged(t, w) for t, w in _MANUAL_REVIEW)


def test_real_assertions_still_fail():
    assert [t for t, w in _ASSERTIONS if not unhedged(t, w)] == []


def test_a_go_ahead_drawn_from_unaccepted_material_is_flagged_whatever_the_words():
    for text in ("Legal reportedly confirmed 30 days, so Security approval can proceed.",
                 "Legal says retention is 30 days, so Security approval can proceed.",
                 "Evidence reports 30-day retention, therefore the pilot data flow is approved.",
                 "A pending Review proposes 30 days, which means retention is settled.",
                 "Legal says 30 days, so no further review is needed and the pilot can proceed."):
        assert conclusions(text), text
    for text in ("Implementation planning can proceed for the bounded use case.",
                 "Retention is not resolved, so Security approval cannot proceed.",
                 "Legal reportedly confirmed 30 days, but Security approval cannot proceed until the Review is accepted.",
                 "Retention is not resolved yet, so it should not be treated as a settled starting point.",
                 "Retention is not resolved yet, so nothing gated on it can move forward."):
        assert not conclusions(text), text


def test_a_go_ahead_in_a_supported_current_state_claim_is_not_a_problem():
    from eval.authority_wording import unsupported_conclusions

    state = {"k-launch": "Implementation planning can proceed with the bounded use case, so planning can begin now."}
    ok = _claims(("current_state", "k-launch", "Implementation planning can proceed with the bounded use case, so planning can begin."))
    assert not unsupported_conclusions(ok, state)
    bad = _claims(("evidence_says", "e-1", "Legal says retention is 30 days, so Security approval can proceed."))
    assert unsupported_conclusions(bad, state)


def test_the_premise_check_accepts_an_explicit_correction_and_nothing_weaker():
    for text in ("The premise that retention is resolved is not correct: retention terms are still open.",
                 "Retention is not yet resolved."):
        assert PREMISE_CORRECTED.search(text), text
    for text in ("The premise that retention is resolved is correct, so Security approval can proceed.",
                 "The premise that retention is resolved is not the main issue; launch thresholds are.",
                 "Implementation planning can move forward for the bounded Tier 1 use case."):
        assert not PREMISE_CORRECTED.search(text), text


def test_the_eval_check_never_imports_the_products_check():
    """Product validation and eval expectations stay independent (Paige, Nov 11)."""
    import ast
    import pathlib
    tree = ast.parse((pathlib.Path(__file__).parent / "eval" / "authority_wording.py").read_text())
    imported = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)} | {
        a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    assert "ask_assertions" not in imported and "ask_service" not in imported


# --- Nov 11: three false positives from the steps 1-2 capture -----------------------------------------------------

def test_a_go_ahead_from_a_denied_status_is_not_a_conclusion_from_unaccepted_material():
    assert not conclusions("Retention is not resolved yet, so the pilot cannot move forward on data flow, and only some "
                           "work can proceed.")
    assert not conclusions("Retention is unresolved, so only work that does not depend on it can proceed.")
    # A negation that denies something other than a status does not excuse the go-ahead.
    assert conclusions("Legal says retention is not an issue, so Security approval can proceed.")
    assert conclusions("Retention is resolved and not open for debate, so Security approval can proceed.")


def test_a_heading_answered_by_a_denial_passes_and_an_assertive_heading_fails():
    assert not unhedged("Confirmed retention terms: none are confirmed; 30-day vendor retention is reported but not yet "
                        "accepted", "confirmed")
    assert unhedged("Confirmed retention terms: 30 days for pilot prompts and outputs", "confirmed")
    assert not unhedged("Of the vendor's terms, none are confirmed.", "confirmed")
    assert unhedged("Of the vendor's terms, all are confirmed.", "confirmed")


def test_the_premise_check_accepts_not_settled_but_not_a_change_of_subject():
    assert PREMISE_CORRECTED.search("The retention premise is not settled: retention terms are not yet confirmed.")
    assert not PREMISE_CORRECTED.search("The premise that retention is resolved is not the main issue.")
    assert not PREMISE_CORRECTED.search("The premise is correct, so Security approval can proceed.")
