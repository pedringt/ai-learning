"""Issues #227 and #473: Ask must not tell the reader an approved, governing Current State fact is not yet approved.

The settled-word backstop (`_soften_unearned_settled_prose`) used to rewrite "approved" to "proposed for approval
(not yet approved)" in any unhedged sentence while a Review was open, including a sentence quoting the governing fact.
Since #567 (Nov 11) Ask never rewords: a claim citing the governing record is shown as written, and the same words
with no record behind them are withheld. The backstop and its unit tests were removed on Nov 14 (#656). No model calls.
"""
import re

from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_service import _validate_synthesis

STATE_STATEMENT = "The approved enterprise terms state customer content is not used for model training."
REVIEW_TEXT = "New legal evidence may contradict the approved enterprise-terms interpretation."

# The summary from the issue (real-model output).
SUMMARY_QUOTING_STATE = (
    "Current State establishes that the approved enterprise terms explicitly prohibit "
    "using customer content for model training."
)
PENDING_CLAIM = "The new legal evidence means the enterprise terms are approved."


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


def _answer(summary, item_text=None, basis="current_state", primary="k-1"):
    """#567: the old summary becomes claims, one per sentence, each citing the governing record unless told not to."""
    sections = []
    if item_text:
        sections = [AskAnswerSection(kind="other", title="Context", items=[AskAnswerItem(text=item_text, record_type="none")])]
    claims = [AskClaim(text=sentence, basis=basis, primary_record_id=primary if basis != "none" else None)
              for sentence in re.split(r"(?<=[.!?])\s+", summary.strip()) if sentence]
    return AskSynthesis(job="current_fact", claims=claims, sections=sections)


def _shown(answer):
    """The displayed claims' text, joined: what the summary held before #567."""
    return " ".join(claim.text for claim in answer.claims)


# #567 (Nov 11): software no longer rewrites settled words in an answer. A claim that cites the governing record is
# shown exactly as written; the same words with no record behind them are withheld, never reworded.

def test_validate_synthesis_shows_a_claim_quoting_the_governing_fact_when_it_cites_it():
    selection, context, candidates = _context()
    cleaned = _validate_synthesis(_answer(SUMMARY_QUOTING_STATE), selection, context, candidates)
    assert _shown(cleaned) == SUMMARY_QUOTING_STATE


def test_validate_synthesis_withholds_the_same_words_when_they_cite_nothing():
    selection, context, candidates = _context()
    cleaned = _validate_synthesis(_answer(SUMMARY_QUOTING_STATE, basis="none"), selection, context, candidates)
    assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_validate_synthesis_withholds_a_pending_claim_and_a_free_text_item_and_rewrites_neither():
    selection, context, candidates = _context()
    answer = _answer(SUMMARY_QUOTING_STATE, item_text=PENDING_CLAIM)
    answer.claims.append(AskClaim(text=PENDING_CLAIM, basis="pending_review", primary_record_id="r-1"))
    cleaned = _validate_synthesis(answer, selection, context, candidates)
    assert _shown(cleaned) == SUMMARY_QUOTING_STATE
    assert cleaned.withheld_claims == 1 and cleaned.withheld_items == 1
    shown = _shown(cleaned) + " ".join(i.text for s in cleaned.sections for i in s.items)
    assert "not yet approved" not in shown and "are approved" not in shown


def test_validate_synthesis_free_text_item_that_asserts_nothing_is_shown_as_written():
    selection, context, candidates = _context()
    item = "Customer content is not used for model training, per the enterprise terms."
    cleaned = _validate_synthesis(_answer("See details.", item_text=item), selection, context, candidates)
    assert [i.text for s in cleaned.sections for i in s.items if i.record_type == "none"] == [item]


# --- #473: attributive references to a governing fact ------------------------
# Cowork, Oct 9 (Juniper): "Current State records the approved move budget at $85,000"
# became "...records the proposed for approval (not yet approved) move budget...". The
# sentence paraphrases the governing fact, so the three-word quote check above missed it,
# while an open Review proposes the same sentence with $95,000.

JUNIPER_BUDGET = "The move budget is approved at $85,000, covering moving services, furniture, and IT relocation."
JUNIPER_PENDING = "The move budget is approved at $95,000, covering moving services, furniture, and IT relocation."


def test_validate_synthesis_keeps_the_juniper_budget_answer():
    state = [{"id": "j-budget-amount", "topic": "Approved budget", "statement": JUNIPER_BUDGET, "authority": "governing_current_fact"}]
    review = {"id": "r-budget", "review_type": "proposed_update", "decision_question": "Should the move budget increase to $95,000?",
              "why_consequential": "x", "affected_state_ids": ["j-budget-amount"], "evidence_ids": []}
    context = {"state": state, "reviews": [review], "questions": [], "history": [], "evidence": [], "rules": []}
    selection = AskSelection(job="current_fact", state_ids=["j-budget-amount"], review_ids=["r-budget"],
                             blocking_question_ids=[], question_ids=[], history_ids=[], evidence_ids=[])
    cleaned = _validate_synthesis(_answer("Current State records the approved move budget at $85,000.",
                                          primary="j-budget-amount"), selection, context, dict(context))
    assert _shown(cleaned) == "Current State records the approved move budget at $85,000."
    # The pending Review's figure on the same record: withheld (its anchor is not in the record), never reworded.
    pending = _validate_synthesis(_answer("Current State records the approved move budget at $95,000.",
                                          primary="j-budget-amount"), selection, context, dict(context))
    assert pending.claims == [] and pending.withheld_claims == 1
