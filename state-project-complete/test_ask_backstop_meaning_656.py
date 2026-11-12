"""#656: Ask's settled-word backstop must not change what a correct sentence means.

The Nov 11 #567 retention capture found the backstop rewriting correct sentences into false ones: a corrected
premise became a denial that retention was reported, an accepted Current State fact became "not yet approved", and a
negated "confirmed" was qualified as if a source had asserted it. It also let an unsupported go-ahead through after
qualifying its premise.

Each test goes through `_validate_synthesis`, the step that produces what the user sees, with the retention repro's
records (a pending retention Review, Legal's Evidence, and the demo's Current State), and checks the whole displayed
text. Correct sentences must come out unchanged. For an unsupported assertion the requirement is the outcome, not
the mechanism: it must not reach the user as established fact. No model calls.

On staging since #567 (Nov 12), answers no longer go through the backstop: a claim or card is shown as written or
withheld (ask_assertions). So the meaning tests call the backstop function directly (what `main` runs until #567
ships), and the outcome tests run through #567's path, where an unsupported assertion or go-ahead is withheld.
"""
import re

import pytest

from ask_authority_text import _evidence_backing, _governing_state_ngrams, _soften_unearned_settled_prose
from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_service import _validate_synthesis

STATE = {
    "k-grounding": "Troubleshooting guidance is grounded in approved support material and relevant account context "
                   "when that context is available.",
    "k-eval": "The pilot is evaluated with response-time improvement, reviewer edits, escalation behavior, "
              "unsupported-claim checks, and failure severity rather than a single automation metric.",
    "k-slack": "Support Slack is not an approved retrieval source for the first pilot while ownership, freshness, "
               "and data-governance questions remain unresolved.",
    "k-launch": "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed "
                "thresholds for high-risk failures and escalation behavior.",
}
LEGAL = "Legal confirmed vendor retention is 30 days for pilot prompts and outputs, with deletion available on request."


def _validate(summary: str = "Answer.", headline: str = "What State has on record", title: str = "Details",
              item: str | None = None) -> AskSynthesis:
    selection = AskSelection(job="current_fact", state_ids=list(STATE), review_ids=["demo-review-retention"],
                             blocking_question_ids=["q-retention"], evidence_ids=["e-legal"])
    context = {
        "state": [{"id": k, "statement": v} for k, v in STATE.items()],
        "reviews": [{"id": "demo-review-retention", "review_type": "proposed_update",
                     "decision_question": "Are the vendor's stated retention terms authoritative enough for pilot planning?",
                     "why_consequential": "Security and Legal have not confirmed the agreement.",
                     "affected_state_ids": [], "evidence_ids": ["e-legal"]}],
        "questions": [{"id": "q-retention", "text": "What retention and deletion terms apply to pilot prompts and outputs?",
                       "blocking": True, "blocks": "Security approval for pilot data flow", "status": "open"}],
        "history": [], "evidence": [{"id": "e-legal", "content": LEGAL}], "rules": [],
    }
    sections = [AskAnswerSection(kind="other", title=title,
                                 items=[AskAnswerItem(text=item, record_type="none")] if item else [])]
    answer = AskSynthesis(job="current_fact", headline=headline, summary=summary, sections=sections)
    return _validate_synthesis(answer, selection, context, context)


# Correct sentences from the capture (and the issue's reconstruction of what the model wrote). Unchanged.
UNCHANGED = [
    # A corrected false premise. Was: "The premise that retention is reported (not yet resolved) is not correct".
    "The premise that retention is resolved is not correct: retention terms are still an open blocking Question.",
    # A negated subject. Was: "...is proposed (not yet established) as accepted project fact".
    "No retention or deletion term is established as accepted project fact.",
    # A negated "confirmed". Was: "confirmed (per Evidence, not in Current State) in Current State".
    "No retention terms are confirmed in Current State; State has no accepted retention or deletion terms reported.",
    "Confirmed retention terms are not recorded in Current State.",
    "Confirmed retention terms are not yet established in Current State: no accepted record sets them.",
    # An accepted Current State fact. Was: "proposed (not yet approved)-knowledge grounding".
    "Work that does not depend on retention can proceed: the read-only minimum-data boundary, approved-knowledge "
    "grounding, and evaluation design.",
    # History: a past status the sentence says was undone.
    "The Question was resolved previously, then reopened.",
    # Attribution with the terms kept unaccepted.
    "Legal reported confirmation, but the terms remain unaccepted.",
    # A negated premise with a go-ahead the records support.
    "Retention is not resolved, so only work that does not depend on it can proceed.",
    "Retention is not resolved yet, so Security approval cannot proceed.",
]


@pytest.mark.parametrize("sentence", UNCHANGED)
def test_the_backstop_keeps_a_correct_sentence_unchanged(sentence):
    governing = _governing_state_ngrams(STATE.values())
    assert _soften_unearned_settled_prose(sentence, governing, _evidence_backing([LEGAL])) == sentence


# #567: a free-text card cites no record, so one that grants a go-ahead is withheld (Paige, Nov 11: keep withholding a
# permission its records don't support); every other correct card is shown exactly as written.
_GRANTS_A_GO_AHEAD = {UNCHANGED[5], UNCHANGED[8]}


@pytest.mark.parametrize("sentence", UNCHANGED)
def test_a_correct_free_text_card_is_shown_unchanged_or_withheld_never_reworded(sentence):
    cards = [i.text for s in _validate(item=sentence).sections for i in s.items if i.record_type == "none"]
    assert cards == ([] if sentence in _GRANTS_A_GO_AHEAD else [sentence])


@pytest.mark.parametrize("headline", [
    "Confirmed retention terms are not yet established",
    "No retention terms are confirmed yet",
])
def test_a_correct_negated_headline_is_unchanged(headline):
    assert _validate(headline=headline).headline == headline


def test_an_accepted_fact_named_without_its_record_wording_is_never_denied():
    """Current State records the evaluation approach but doesn't call it "approved". The answer may not deny it."""
    shown = _validate(summary="Items that can proceed: the approved evaluation direction (response time, reviewer "
                              "edits, failure severity).").summary
    assert "not yet approved" not in shown and "proposed" not in shown
    assert "evaluation direction (response time, reviewer edits, failure severity)" in shown


_GO_AHEAD = re.compile(r"\b(?:can|may)\s+(?:now\s+)?(?:proceed|move forward|go ahead|begin)\b", re.I)


def _not_established(shown: str, words=("resolved", "confirmed", "approved")) -> bool:
    """The displayed text presents none of these as settled: each use is hedged, attributed or negated."""
    for word in words:
        for m in re.finditer(rf"\b{word}\b", shown, re.I):
            window = shown[max(0, m.start() - 40):m.end() + 25].lower()
            if not re.search(r"\bnot\b|n't|pending|reported|proposed|reportedly|per evidence|open", window):
                return False
    return True


def _shown_as_claim(sentence: str) -> str:
    """The sentence as an uncited claim through #567's checks: what a person sees of it."""
    selection = AskSelection(job="current_fact", state_ids=list(STATE), review_ids=[], evidence_ids=["e-legal"])
    context = {"state": [{"id": k, "statement": v} for k, v in STATE.items()], "reviews": [], "questions": [],
               "history": [], "evidence": [{"id": "e-legal", "content": LEGAL}], "rules": []}
    answer = _validate_synthesis(AskSynthesis(job="current_fact", claims=[AskClaim(text=sentence)]), selection, context, context)
    return " ".join(c.text for c in answer.claims)


@pytest.mark.parametrize("sentence", [
    "Retention is resolved, so Security approval can proceed.",
    "Legal reportedly confirmed 30 days, so Security approval can proceed.",
    "Evidence reports 30-day retention, so the pilot data flow can move forward.",
])
def test_an_unsupported_go_ahead_does_not_reach_the_user(sentence):
    """Outcome: the displayed text grants no go-ahead from an unsupported premise and presents nothing pending as
    settled. On #567 the claim is withheld."""
    shown = _shown_as_claim(sentence)
    assert not _GO_AHEAD.search(shown), shown
    assert _not_established(shown), shown


@pytest.mark.parametrize("sentence", [
    "Legal has confirmed retention is 30 days.",
    "Retention terms are confirmed at 30 days.",
    "The approved Support Slack retrieval source is available.",
])
def test_an_unsupported_assertion_is_not_displayed_as_established(sentence):
    assert _not_established(_shown_as_claim(sentence)), _shown_as_claim(sentence)


def test_a_settled_title_about_pending_material_is_not_shown():
    titles = [s.title for s in _validate(title="Confirmed Retention Terms", item="Retention terms are under review.").sections
              if s.kind == "other"]
    assert titles and all("Confirmed" not in t for t in titles)
