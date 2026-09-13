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
here -- see _soften_unearned_settled_words in ask_service.py for the
deterministic code-level backstop added on top: it rewrites those exact
words in the answer's headline and section titles (never in prose, where
the model does usually hedge correctly) whenever the selected context
includes any open Review or open Question. test_soften_unearned_settled_words_*
below unit-tests that function directly, with no API call needed.
test_the_exact_reported_repro_no_longer_treats_pending_evidence_as_settled
verifies the full pipeline live, against the real model, with the exact
repro evidence and both exact questions from the QA pass -- run that one
locally with a funded ANTHROPIC_API_KEY; the unit tests are what CI-like
environments without one can still rely on.
"""
from __future__ import annotations

import os
import re

import pytest

from ask_contract import AskAnswerItem, AskAnswerSection, AskSelection, AskSynthesis
from ask_provider import LiveAskProvider
from ask_service import (
    _clean_visible_ask_text, _grounding_rules, _one_call_prompt, _soften_unearned_settled_prose,
    _soften_unearned_settled_words, _synthesis_prompt, _validate_synthesis, run_ask,
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
    assert "not yet true" in rules
    assert "confirmed" in rules.lower() and "never" in rules.lower()
    assert "linked Question" in rules and "open" in rules


def test_one_call_prompt_forbids_confirmed_language_for_open_reviews():
    prompt = _one_call_prompt("What are the confirmed retention terms?", _CANDIDATES, None)
    assert "not yet true" in prompt
    assert '"confirmed"' in prompt
    assert "resolving its linked Question" in prompt or "resolves it" not in prompt.lower()


def test_synthesis_prompt_forbids_confirmed_language_for_open_reviews():
    selection = AskSelection(
        job="current_fact", state_ids=[], review_ids=[], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}
    prompt = _synthesis_prompt("What are the confirmed retention terms?", selection, context, None)
    assert "not yet true" in prompt
    assert '"confirmed"' in prompt


def test_soften_unearned_settled_words_rewrites_bare_confirmed_and_resolved():
    assert _soften_unearned_settled_words("Retention Terms: Legal Confirmed") == "Retention Terms: Legal Reported"
    assert _soften_unearned_settled_words("Confirmed Retention and Deletion") == "Reported Retention and Deletion"
    assert _soften_unearned_settled_words("Retention resolved") == "Retention pending"
    assert _soften_unearned_settled_words("30-Day Retention (Confirmed)") == "30-Day Retention"
    assert _soften_unearned_settled_words("Retention Terms (Resolved)") == "Retention Terms"


def test_soften_unearned_settled_words_leaves_clean_text_alone():
    assert _soften_unearned_settled_words("What needs review") == "What needs review"
    assert _soften_unearned_settled_words(None) is None
    assert _soften_unearned_settled_words("") == ""


def test_soften_unearned_settled_words_does_not_mangle_an_already_hedged_headline():
    """The exact bug this same backstop introduced on a live run: swapping
    "resolved" unconditionally turned the already-correct headline
    "Retention is not yet resolved" into the nonsensical "Retention is not
    yet pending". A headline that already hedges must be left alone."""
    assert _soften_unearned_settled_words("Retention is not yet resolved") == "Retention is not yet resolved"
    assert _soften_unearned_settled_words("Legal has not yet confirmed retention") == "Legal has not yet confirmed retention"


def test_soften_unearned_settled_prose_does_not_mangle_the_reversed_not_x_yet_word_order():
    """Real staging QA finding (2026-09-13): the hedge-phrase list only knew
    the "not yet resolved" word order. A model that instead wrote "not
    resolved yet" wasn't recognized as already-hedged, so the sentence-level
    backstop ran anyway and stranded the sentence's "yet" after the inserted
    replacement clause: "retention is not resolved yet" became the
    nonsensical "retention is not reportedly addressed, pending Review yet".
    Both word orders must be left completely alone."""
    already_correct = [
        "Retention is not resolved yet.",
        "Legal has not confirmed retention yet.",
        "This is not established yet.",
        "The change was not approved yet.",
        "Leadership has not decided yet.",
    ]
    for sentence in already_correct:
        assert _soften_unearned_settled_prose(sentence) == sentence, (
            f"Already-hedged sentence must be left byte-for-byte alone: {sentence!r}"
        )


def test_soften_unearned_settled_prose_does_not_mangle_a_negation_with_words_in_between():
    """Real staging QA finding (2026-09-13): "Current State does not treat
    retention as resolved." is already a correctly hedged/negated claim, but
    neither hedge phrase nor the "not ... yet" pattern caught it (the
    negation and the target word are separated by "treat retention as", and
    there's no "yet" at all), so it got rewritten into the confusing
    "Current State does not treat retention as reportedly addressed, pending
    Review." Any negation before a target word anywhere in the sentence must
    leave it alone, regardless of what verb or object sits in between."""
    already_correct = [
        "Current State does not treat retention as resolved.",
        "Current State doesn't treat retention as resolved.",
        "Legal has not confirmed the vendor's proposed terms.",
        "This isn't approved by Security yet.",
    ]
    for sentence in already_correct:
        assert _soften_unearned_settled_prose(sentence) == sentence, (
            f"Already-hedged sentence must be left byte-for-byte alone: {sentence!r}"
        )


def test_soften_unearned_settled_prose_rewrites_a_reviews_own_outcome_without_saying_it_is_proposed():
    """Real staging QA finding (2026-09-13): "Until that Review is decided,
    ..." was rewritten by the generic "decided" replacement into "Until that
    Review is proposed (not yet decided), ..." -- which wrongly claims the
    Review itself "is proposed" (as if not yet created) rather than saying
    its resolution is unsettled. A Review's own outcome needs different
    wording than a State-claim word like "decided"/"resolved"/"confirmed"/
    "approved" gets everywhere else."""
    cases = {
        "Until that Review is decided, nothing changes.": "that Review remains open",
        "The Review is resolved.": "The Review remains open",
        "This Review has been confirmed.": "This Review remains open",
    }
    for sentence, expected_fragment in cases.items():
        fixed = _soften_unearned_settled_prose(sentence)
        assert expected_fragment in fixed, f"{sentence!r} -> {fixed!r}"
        assert "is proposed" not in fixed, f"Must not claim the Review itself is proposed: {fixed!r}"


def test_clean_visible_ask_text_removes_the_empty_citation_left_behind_by_id_stripping():
    """Real staging QA finding (2026-09-13): a model citing an internal ID
    inline, e.g. "Retention is confirmed (review_1).", had the ID correctly
    stripped as an implementation detail, but the surrounding parentheses
    were left behind as a dangling, contentless "()" -- a citation-looking
    artifact with nothing in it. A parenthetical that still has other real
    words in it must be left alone."""
    internal_ids = {"review_1", "k-data", "q-retention"}
    # _clean_visible_ask_text already strips trailing sentence punctuation as
    # part of its existing whitespace/punctuation cleanup -- unrelated to this
    # fix, so these assertions match that pre-existing behavior.
    assert _clean_visible_ask_text("Retention is confirmed (review_1).", internal_ids) == "Retention is confirmed"
    assert _clean_visible_ask_text("Retention is confirmed (k-data, q-retention).", internal_ids) == "Retention is confirmed"
    assert _clean_visible_ask_text("See the linked Review (review_1) for details.", internal_ids) == "See the linked Review for details"
    assert _clean_visible_ask_text("See the linked Review (the one about retention) for details.", internal_ids) == (
        "See the linked Review (the one about retention) for details"
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


def test_validate_synthesis_softens_headline_and_titles_when_context_has_an_open_review():
    selection, context = _selection_and_context_with_open_review()
    answer = AskSynthesis(
        job="current_fact",
        headline="Retention Terms: Legal Confirmed",
        summary="Legal confirmed the terms, but the Review is still open and the Question remains unresolved.",
        sections=[AskAnswerSection(kind="other", title="Confirmed Retention and Deletion", items=[
            AskAnswerItem(text="Some free-text detail that says confirmed too", record_type="none"),
        ])],
    )
    cleaned = _validate_synthesis(answer, selection, context)
    assert "Confirmed" not in cleaned.headline and "confirmed" not in cleaned.headline
    assert "Confirmed" not in cleaned.sections[0].title and "confirmed" not in cleaned.sections[0].title
    # Full prose (summary, free-text items) is left to the prompt rules, not
    # the code-level backstop, since the model reliably hedges there already
    # and blind word-replacement in longer sentences risks garbling meaning.
    assert "confirmed" in cleaned.summary.lower()


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

def test_soften_unearned_settled_prose_rewrites_an_unhedged_sentence():
    text = "Legal has confirmed retention is 30 days."
    fixed = _soften_unearned_settled_prose(text)
    assert "confirmed" not in fixed.lower()
    assert "is reported to have said" in fixed


def test_soften_unearned_settled_prose_uses_the_shorter_resolved_phrasing():
    """Real staging QA finding (2026-09-13): the old "reportedly addressed,
    pending Review" wording read as an awkward comma-splice wherever it
    landed, e.g. "Until these are reportedly addressed, pending Review...".
    Restyled to match the same short "X (not yet Y)" template already used
    for established/approved/decided/known, for both readability and to
    read consistently as one family of hedges."""
    fixed = _soften_unearned_settled_prose("Until these are resolved, nothing changes.")
    assert "reported (not yet resolved)" in fixed
    assert "reportedly addressed" not in fixed


def test_soften_unearned_settled_prose_leaves_hedged_sentences_alone():
    hedged = [
        "Legal has not yet confirmed retention terms.",
        "Evidence says retention is 30 days, pending review.",
        "The proposed retention figure is 30 days.",
        "Retention terms remain unresolved.",
        "This suggests retention may be 30 days.",
    ]
    for sentence in hedged:
        assert _soften_unearned_settled_prose(sentence) == sentence, (
            f"Already-hedged sentence must be left byte-for-byte alone: {sentence!r}"
        )


def test_soften_unearned_settled_prose_only_rewrites_the_unhedged_sentence_in_a_mixed_paragraph():
    text = (
        "Legal has confirmed retention is 30 days. "
        "This is still pending Security approval, so nothing has changed in Current State."
    )
    fixed = _soften_unearned_settled_prose(text)
    sentences = fixed.split(". ")
    assert "confirmed" not in sentences[0].lower()
    assert sentences[1].strip().rstrip(".") == (
        "This is still pending Security approval, so nothing has changed in Current State"
    ), "The already-correct second sentence must not be touched."


def test_soften_unearned_settled_prose_covers_each_target_phrase():
    cases = {
        "This resolves the retention blocker.": "resolved",
        "The new policy is now established.": "established",
        "Security approved the change.": "approved",
        "Leadership decided to proceed.": "decided",
        "The answer is now known.": "known",
        "The blocker is no longer blocking.": "blocking",
    }
    for sentence, banned_root in cases.items():
        fixed = _soften_unearned_settled_prose(sentence)
        assert fixed != sentence, f"Expected a rewrite for: {sentence!r}"
        assert banned_root not in fixed.lower() or "not yet" in fixed.lower() or "pending" in fixed.lower(), (
            f"Rewrite still reads as settled: {fixed!r}"
        )


def test_soften_unearned_settled_prose_handles_none_and_empty():
    assert _soften_unearned_settled_prose(None) is None
    assert _soften_unearned_settled_prose("") == ""


def test_validate_synthesis_softens_summary_and_free_text_items_when_pending():
    selection, context = _selection_and_context_with_open_review()
    answer = AskSynthesis(
        job="current_fact",
        headline="Retention",
        summary="Legal has confirmed retention is 30 days. This is still pending Security approval.",
        sections=[AskAnswerSection(kind="other", title="Details", items=[
            AskAnswerItem(text="This resolves the retention blocker.", record_type="none"),
        ])],
    )
    cleaned = _validate_synthesis(answer, selection, context)
    assert "Legal has confirmed" not in cleaned.summary
    assert "still pending Security approval" in cleaned.summary, "The already-hedged sentence must survive unchanged."
    assert "This resolves" not in cleaned.sections[0].items[0].text


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

    Only checks Ask's own generated prose (headline, summary, section
    titles, and free-text items) -- not item text/detail for record_type
    review/question/blocking_question/evidence, which _validate_synthesis
    overwrites with the record's own stored fields or the Evidence's own
    quoted content (a decision_question or a source quote is allowed to
    contain "confirmed"; that wording comes from evidence intake's own
    prompt in anthropic_provider.py, a separate subsystem this fix does
    not touch).
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

        hedges = ("not ", "n't ", "pending", "awaiting", "yet", "open", "before", "hasn't", "has not")

        def _unhedged_claims(text, word):
            hits = []
            lowered = text.lower()
            start = 0
            while True:
                idx = lowered.find(word, start)
                if idx == -1:
                    break
                # "unconfirmed"/"unresolved" are themselves the correct, safe
                # word (the "un-" prefix already IS the hedge) -- not a claim
                # that needs a nearby hedge phrase to be safe.
                if idx >= 2 and lowered[idx - 2:idx] == "un":
                    start = idx + len(word)
                    continue
                window = lowered[max(0, idx - 40):idx + len(word) + 20]
                if not any(h in window for h in hedges):
                    hits.append(text[max(0, idx - 40):idx + len(word) + 20])
                start = idx + len(word)
            return hits

        def _flat_text(payload):
            answer = payload.get("answer", {})
            parts = [answer.get("headline", ""), answer.get("summary", "")]
            for section in answer.get("sections", []):
                parts.append(section.get("title", ""))
                for item in section.get("items", []):
                    if item.get("record_type") not in (None, "none"):
                        continue
                    parts.append(item.get("text", ""))
                    parts.append(item.get("detail", "") or "")
            return " ".join(parts)

        confirmed_payload = run_ask(conn, ask_provider, "What are the confirmed retention terms?")
        confirmed_text = _flat_text(confirmed_payload)
        for word in ("confirmed", "resolved"):
            bad = _unhedged_claims(confirmed_text, word)
            assert not bad, f"Unhedged '{word}' claim(s) about pending retention evidence: {bad}"

        premise_payload = run_ask(conn, ask_provider, "Since retention is resolved, what can move forward?")
        premise_text = _flat_text(premise_payload)
        assert re.search(r"not\s+(yet\s+)?resolved|isn.t resolved|hasn.t been resolved", premise_text, re.I), (
            f"Expected the false premise ('retention is resolved') to be corrected explicitly; got: {premise_text[:400]}"
        )
        for word in ("confirmed", "resolved"):
            bad = _unhedged_claims(premise_text, word)
            assert not bad, f"Unhedged '{word}' claim(s) after a false-premise question: {bad}"
