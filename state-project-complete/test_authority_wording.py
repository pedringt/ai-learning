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
