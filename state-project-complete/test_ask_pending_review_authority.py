"""Regression coverage for a real staging QA finding (2026-09-12): Ask
answered "What are the confirmed retention terms?" by describing an open,
unaccepted proposed_update Review's content as "confirmed" and claimed it
"resolves a blocking question" -- while the linked Question was still open
and Current State was unchanged. This is exactly the authority-model line
State exists to hold: a pending Review may describe what evidence claims,
but only an accepted Review changes Current State, and only that changes
what a Question's status or Current State's content actually is.

The existing "Open Reviews qualify Current State; they never replace it"
rule was too soft to reliably stop the model from narrating a Review's
proposed content as settled fact. The static tests below assert the
strengthened, explicit rule (added to _one_call_prompt, _synthesis_prompt,
and the shared _grounding_rules()) is actually present in the assembled
prompt text -- a guardrail against the instruction being silently dropped
or weakened in a future edit. They cannot prove the model complies, only
that the instruction is still there.

A second live-QA pass (2026-09-12) on the FIRST fix still found "30-Day
Confirmed" language, and a worse case: asking "Since retention is
resolved, what can move forward?" (a false premise -- the Review was
still open) got answered as though the premise were true ("Retention
resolved..."). The rule was strengthened further (banning "confirmed"/
"resolved" as a label even when Evidence itself uses that word, and
requiring an explicit false-premise correction).

A repeated live check afterward found the prompt-only fix still let
"Confirmed"/"Resolved" through as a short headline/section-title badge
often enough (0/8 in one run) that prompt wording alone isn't reliable
here. A deterministic word backstop was added on top; since #567 (Nov 11)
Ask no longer rewords anything and instead shows or withholds each claim
(ask_assertions), and the unused backstop and its unit tests were removed
on Nov 14 (#656). The _validate_synthesis tests below cover the outcome.
test_the_exact_reported_repro_no_longer_treats_pending_evidence_as_settled
verifies the full pipeline live, against the real model, with the exact
repro evidence and both exact questions from the QA pass -- run that one
locally with a funded ANTHROPIC_API_KEY; the unit tests are what CI-like
environments without one can still rely on.
"""
from __future__ import annotations

import os

import pytest

from eval.ask_retention_capture import flagged_units
from eval.authority_wording import PREMISE_CORRECTED, unsupported_conclusions, unsupported_settled_words, visible_words
from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_provider import LiveAskProvider
from ask_service import (
    _clean_visible_ask_text, _grounding_rules, _one_call_prompt,
    _finish_display_fields, _synthesis_prompt, _validate_synthesis, run_ask,
)
from database_migration_backed import get_test_db
from anthropic_provider import AnthropicProvider
from interpretation_pipeline_integrated import process_evidence
from seed_demo import bootstrap_demo_data

requires_anthropic_key = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set -- this test checks real model compliance with "
    "the authority-language rule, not just that the rule text exists.",
)

_CANDIDATES = {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}


def test_grounding_rules_forbid_describing_a_pending_review_as_confirmed():
    rules = _grounding_rules()
    assert "not accepted" in rules and "not yet true" not in rules
    assert "confirmed" in rules.lower() and "never" in rules.lower()
    assert "linked Question" in rules and "open" in rules


def test_one_call_prompt_forbids_confirmed_language_for_open_reviews():
    prompt = _one_call_prompt("What are the confirmed retention terms?", _CANDIDATES, None)
    assert "not accepted" in prompt and "not yet true" not in prompt
    assert '"confirmed"' in prompt
    assert "resolving its linked Question" in prompt or "resolves it" not in prompt.lower()


def test_synthesis_prompt_forbids_confirmed_language_for_open_reviews():
    selection = AskSelection(
        job="current_fact", state_ids=[], review_ids=[], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}
    prompt = _synthesis_prompt("What are the confirmed retention terms?", selection, context, None)
    assert "not accepted" in prompt and "not yet true" not in prompt
    assert '"confirmed"' in prompt


def test_clean_visible_ask_text_removes_the_empty_citation_left_behind_by_id_stripping():
    """Real staging QA finding (2026-09-13): a model citing an internal ID
    inline, e.g. "Retention is confirmed (review_1).", had the ID correctly
    stripped as an implementation detail, but the surrounding parentheses
    were left behind as a dangling, contentless "()" -- a citation-looking
    artifact with nothing in it. A parenthetical that still has other real
    words in it must be left alone."""
    internal_ids = {"review_1", "k-data", "q-retention"}
    # A sentence keeps its final period (Cowork, Oct 11); only the empty citation goes.
    assert _clean_visible_ask_text("Retention is confirmed (review_1).", internal_ids) == "Retention is confirmed."
    assert _clean_visible_ask_text("Retention is confirmed (k-data, q-retention).", internal_ids) == "Retention is confirmed."
    assert _clean_visible_ask_text("See the linked Review (review_1) for details.", internal_ids) == "See the linked Review for details."
    assert _clean_visible_ask_text("See the linked Review (the one about retention) for details.", internal_ids) == (
        "See the linked Review (the one about retention) for details."
    ), "A parenthetical with real, non-ID content must be left completely alone."


def _selection_and_context_with_open_review():
    selection = AskSelection(
        job="current_fact", state_ids=[], review_ids=["r-1"], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {
        "state": [], "history": [], "evidence": [], "rules": [],
        "reviews": [{"id": "r-1", "review_type": "proposed_update", "decision_question": "Is this confirmed?", "why_consequential": "x", "affected_state_ids": [], "evidence_ids": []}],
        "questions": [],
    }
    return selection, context


def test_validate_synthesis_titles_fall_back_and_the_headline_is_fixed_when_context_has_an_open_review():
    """#567: software sets the headline per job, so it can't claim a status. A section title that asserts a status is
    replaced by its kind's fixed title (never reworded). An uncited report of what Legal said is withheld: a report
    of a source needs that source cited (basis evidence_says)."""
    selection, context = _selection_and_context_with_open_review()
    answer = AskSynthesis(
        job="current_fact",
        claims=[AskClaim(text="Legal confirmed the terms, but the Review is still open and the Question remains unresolved.")],
        sections=[AskAnswerSection(kind="other", title="Confirmed Retention and Deletion", items=[
            AskAnswerItem(text="The retention terms are still awaiting a decision.", record_type="none"),
        ])],
    )
    cleaned = _validate_synthesis(answer, selection, context)
    _finish_display_fields(cleaned, None)
    assert cleaned.headline == "What State has on record"
    assert [s.title for s in cleaned.sections if s.kind == "other"] == ["Project context"]
    assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_validate_synthesis_withholds_an_unsupported_status_whether_or_not_the_review_was_selected():
    """Live-QA bug (2026-09-14): the selector is non-deterministic, so a pending Review may or may not be selected.
    Since #567 (Nov 11) the outcome no longer depends on it: a status claim that no cited Current State record carries
    is withheld either way."""
    selection = AskSelection(
        job="current_fact", state_ids=["k-1"], review_ids=[], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {"state": [{"id": "k-1", "topic": "x", "statement": "y"}], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}
    candidates = {
        "state": [{"id": "k-1", "topic": "x", "statement": "y"}], "history": [], "evidence": [], "rules": [],
        "reviews": [{"id": "r-1", "review_type": "proposed_update", "decision_question": "Is the budget approved?", "why_consequential": "x", "affected_state_ids": [], "evidence_ids": []}],
        "questions": [],
    }
    for pool in (candidates, None):
        answer = AskSynthesis(job="current_fact", claims=[AskClaim(text="The pilot budget is approved.")], sections=[])
        cleaned = _validate_synthesis(answer, selection, context, pool)
        assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_validate_synthesis_leaves_headline_alone_when_nothing_is_pending():
    selection = AskSelection(
        job="current_fact", state_ids=["k-1"], review_ids=[], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {"state": [{"id": "k-1", "topic": "x", "statement": "y"}], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}
    answer = AskSynthesis(job="current_fact", headline="Data Boundary Confirmed", summary="Established in Current State.", sections=[])
    cleaned = _validate_synthesis(answer, selection, context)
    assert cleaned.headline == "Data Boundary Confirmed", (
        "With no open Review or Question anywhere in context, there's nothing pending to "
        "protect against -- the backstop must not touch a headline about something genuinely settled."
    )


# --- Prose-level backstop (2026-09-12, narrow scope per explicit direction) --


def test_validate_synthesis_withholds_unsupported_claims_and_cards_and_keeps_hedged_ones_unchanged():
    selection, context = _selection_and_context_with_open_review()
    answer = AskSynthesis(
        job="current_fact",
        claims=[AskClaim(text="Legal has confirmed the retention terms."),
                AskClaim(text="This is still pending Security approval.")],
        sections=[AskAnswerSection(kind="other", title="Details", items=[
            AskAnswerItem(text="This resolves the retention blocker.", record_type="none"),
        ])],
    )
    cleaned = _validate_synthesis(answer, selection, context)
    assert [c.text for c in cleaned.claims] == ["This is still pending Security approval."]
    assert cleaned.withheld_claims == 1 and cleaned.withheld_items == 1
    assert not [i for s in cleaned.sections for i in s.items if i.record_type == "none"]


@requires_anthropic_key
def test_the_exact_reported_repro_no_longer_treats_pending_evidence_as_settled():
    """Live reproduction of the exact 2026-09-12 QA repro, against the real
    model and real demo Current State/Questions: submit the exact retention
    Evidence, let intake create its Review the normal way, then ask the two
    exact questions from the report and check the answers hold the
    authority line -- not by asserting the model never writes "confirmed"
    or "resolved" anywhere (those words alone are ambiguous: "not yet
    confirmed" is exactly the correct answer), but by asserting the
    combination that would actually leak the bug: the words appearing
    WITHOUT any nearby hedge ("not", "pending", "awaiting", "n't", "yet",
    "open", "before").

    Only checks what Ask itself worded, each unit on its own with chips stripped: claims (or, in the older
    shape, the headline and each summary sentence), section titles, free-text cards and cards still in the
    model's wording (eval/authority_wording.py, Nov 11). Review and Question cards show their record's own
    text and are not checked. "Confirmed" passes when an authorized Current State record supports it.
    """
    provider = AnthropicProvider()
    ask_provider = LiveAskProvider(provider)
    with get_test_db() as conn:
        bootstrap_demo_data(conn)
        conn.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            ("e-retention-repro", "Legal confirmed vendor retention is 30 days for pilot "
             "prompts and outputs, with deletion available on request."),
        )
        intake = None
        for _ in range(3):
            intake = process_evidence(conn, evidence_id="e-retention-repro", provider=provider)
            if intake.processing_status == "succeeded" and intake.review_ids:
                break
        assert intake.processing_status == "succeeded", "Evidence intake setup failed (a separate, already-flaky pipeline path unrelated to this fix) even after retries."
        assert intake.review_ids, "Evidence intake itself should still create the linked Review (already covered elsewhere); nothing to check Ask against otherwise."

        # Nov 11 (Paige, #567): each claim, title and model-worded card is checked on its own with chips stripped,
        # and "confirmed" passes when an authorized Current State record supports the sentence (eval/authority_wording).
        current_state = {row["id"]: row["statement"] for row in conn.execute(
            "SELECT id, statement FROM current_state_items WHERE status='active'").fetchall()}

        confirmed_payload = run_ask(conn, ask_provider, "What are the confirmed retention terms?")
        bad = unsupported_settled_words(confirmed_payload, current_state)
        assert not bad, (f"Unhedged settled word(s) about pending retention evidence: {bad}; "
                         f"whole units: {flagged_units(confirmed_payload, current_state)}")

        premise_payload = run_ask(conn, ask_provider, "Since retention is resolved, what can move forward?")
        premise_text = visible_words(premise_payload, current_state)
        assert PREMISE_CORRECTED.search(premise_text), (
            f"Expected the false premise ('retention is resolved') to be corrected explicitly; got: {premise_text}"
        )
        concluded = unsupported_conclusions(premise_payload, current_state)
        assert not concluded, f"A go-ahead drawn from unaccepted material after a false-premise question: {concluded}"
        bad = unsupported_settled_words(premise_payload, current_state)
        assert not bad, (f"Unhedged settled word(s) after a false-premise question: {bad}; "
                         f"whole units: {flagged_units(premise_payload, current_state)}")

def test_claims_guidance_opens_a_denial_with_what_the_records_show():
    """#567 (Paige, Nov 12): Q1 found A+D answers explaining the record correctly after a categorical lead
    ("Security has not signed off..."). The rule asks for the record-grounded opening instead."""
    from ask_service import claims_guidance

    guidance = claims_guidance()
    assert "Open such a sentence with what State's records show" in guidance
    assert "This holds for every person, team and decision" in guidance
    assert "State has no recorded leadership decision" in guidance and "not \"Security has not signed off" in guidance
