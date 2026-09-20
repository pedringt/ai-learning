"""Issue #227: Ask's settled-wording backstop must not rewrite quotes of a governing Current State item.

`_soften_unearned_settled_prose` exists so Ask never narrates *pending* material as
settled. It used to rewrite "approved" to "proposed for approval (not yet approved)"
in ANY unhedged sentence whenever a Review was open, including a sentence that was
correctly quoting an approved, governing Current State item ("...the approved
enterprise terms..."). That told the reader an approved fact was not yet approved.

The backstop now leaves a matched word alone when the wording around it appears
verbatim in a governing Current State statement, and still rewrites everything else.
No model calls.
"""
from ask_contract import AskAnswerItem, AskAnswerSection, AskSelection, AskSynthesis
from ask_service import _governing_state_ngrams, _soften_unearned_settled_prose, _validate_synthesis

STATE_STATEMENT = "The approved enterprise terms state customer content is not used for model training."
REVIEW_TEXT = "New legal evidence may contradict the approved enterprise-terms interpretation."

# The summary from the issue (real-model output).
SUMMARY_QUOTING_STATE = (
    "Current State establishes that the approved enterprise terms explicitly prohibit "
    "using customer content for model training."
)
PENDING_CLAIM = "The new legal evidence means the enterprise terms are approved."


def _ngrams():
    return _governing_state_ngrams([STATE_STATEMENT])


def test_a_sentence_quoting_an_approved_governing_fact_is_left_alone():
    assert _soften_unearned_settled_prose(SUMMARY_QUOTING_STATE, _ngrams()) == SUMMARY_QUOTING_STATE


def test_it_would_have_been_rewritten_before_the_fix():
    """Documents the bug: with no governing state supplied the old behavior is unchanged."""
    rewritten = _soften_unearned_settled_prose(SUMMARY_QUOTING_STATE)
    assert "proposed for approval (not yet approved)" in rewritten


def test_a_pending_claim_is_still_softened_even_with_a_governing_fact_present():
    fixed = _soften_unearned_settled_prose(PENDING_CLAIM, _ngrams())
    assert "proposed for approval (not yet approved)" in fixed
    assert "are approved" not in fixed


def test_only_the_sentence_that_quotes_state_is_spared_in_a_mixed_answer():
    fixed = _soften_unearned_settled_prose(f"{SUMMARY_QUOTING_STATE} {PENDING_CLAIM}", _ngrams())
    assert SUMMARY_QUOTING_STATE in fixed
    assert "proposed for approval (not yet approved)" in fixed and "are approved" not in fixed


def test_matching_ignores_case_hyphens_and_punctuation():
    ngrams = _governing_state_ngrams(["The Approved enterprise-terms cover training."])
    sentence = "Per the APPROVED enterprise terms, training is covered."
    assert _soften_unearned_settled_prose(sentence, ngrams) == sentence


def test_an_unrelated_state_statement_does_not_spare_a_pending_claim():
    ngrams = _governing_state_ngrams(["Vendor retention is 30 days for the pilot environment."])
    assert "not yet approved" in _soften_unearned_settled_prose(PENDING_CLAIM, ngrams)


def test_a_bare_settled_word_is_never_enough_to_be_spared():
    """Two shared words is not a quote: the guard needs a three-word run from the state statement."""
    ngrams = _governing_state_ngrams(["Budget approved."])
    assert "not yet approved" in _soften_unearned_settled_prose("The vendor contract is approved.", ngrams)


def test_no_governing_state_means_behavior_is_unchanged():
    assert _soften_unearned_settled_prose(PENDING_CLAIM) == _soften_unearned_settled_prose(PENDING_CLAIM, frozenset())


# --- through _validate_synthesis (the wiring) --------------------------------

def _context(state_in_context=True):
    state = [{"id": "k-1", "topic": "Vendor training", "statement": STATE_STATEMENT, "authority": "governing_current_fact"}]
    review = {"id": "r-1", "review_type": "proposed_update", "decision_question": REVIEW_TEXT,
              "why_consequential": "x", "affected_state_ids": ["k-1"], "evidence_ids": []}
    context = {"state": state if state_in_context else [], "reviews": [review], "questions": [], "history": [], "evidence": [], "rules": []}
    candidates = {"state": state, "reviews": [review], "questions": [], "history": [], "evidence": [], "rules": []}
    selection = AskSelection(job="current_fact", state_ids=["k-1"] if state_in_context else [], review_ids=["r-1"],
                             blocking_question_ids=[], question_ids=[], history_ids=[], evidence_ids=[])
    return selection, context, candidates


def _same(a, b):
    """The answer-cleaning step ahead of the backstop trims a final period; that is unrelated to #227."""
    return a.rstrip(". ") == b.rstrip(". ")


def _free_text_item(cleaned):
    """The validator also injects the canonical Review into the section; pick out the model's own free text."""
    return [item for section in cleaned.sections for item in section.items if item.record_type == "none"][0]


def _answer(summary, item_text=None):
    sections = []
    if item_text:
        sections = [AskAnswerSection(kind="other", title="Context", items=[AskAnswerItem(text=item_text, record_type="none")])]
    return AskSynthesis(job="current_fact", headline="Vendor training", summary=summary, sections=sections)


def test_validate_synthesis_keeps_a_summary_that_quotes_the_governing_fact():
    selection, context, candidates = _context()
    cleaned = _validate_synthesis(_answer(SUMMARY_QUOTING_STATE), selection, context, candidates)
    assert _same(cleaned.summary, SUMMARY_QUOTING_STATE)
    assert "not yet approved" not in cleaned.summary


def test_validate_synthesis_uses_the_candidate_pool_when_the_state_item_was_not_selected():
    """The selector may skip the state item; the backstop must not depend on that."""
    selection, context, candidates = _context(state_in_context=False)
    cleaned = _validate_synthesis(_answer(SUMMARY_QUOTING_STATE), selection, context, candidates)
    assert _same(cleaned.summary, SUMMARY_QUOTING_STATE)


def test_validate_synthesis_still_softens_a_pending_claim_and_a_free_text_item():
    selection, context, candidates = _context()
    cleaned = _validate_synthesis(_answer(f"{SUMMARY_QUOTING_STATE} {PENDING_CLAIM}", item_text=PENDING_CLAIM),
                                  selection, context, candidates)
    assert SUMMARY_QUOTING_STATE in cleaned.summary
    assert "proposed for approval (not yet approved)" in cleaned.summary
    assert "proposed for approval (not yet approved)" in _free_text_item(cleaned).text
    assert "are approved" not in cleaned.summary and "are approved" not in _free_text_item(cleaned).text


def test_validate_synthesis_free_text_item_quoting_state_is_left_alone():
    selection, context, candidates = _context()
    cleaned = _validate_synthesis(_answer("See details.", item_text=SUMMARY_QUOTING_STATE), selection, context, candidates)
    assert _same(_free_text_item(cleaned).text, SUMMARY_QUOTING_STATE)
