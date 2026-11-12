"""#567 (Paige, Nov 11): show-or-withhold decided by what a claim asserts and the authority of the records it cites.

Software never rewrites a claim. These tests pin the distinctions Paige set out:
- correct negation, attribution and history are shown, whatever words they use;
- Evidence supports an attributed report, History a historical statement; neither establishes present approval;
- Current State must cover the specific status or permission claimed, not merely be cited;
- a compound answer keeps both parts when each is cited correctly;
- withheld content is visible as a limitation, without saying it was false or that State has nothing.
No model calls. Sentence patterns are not proof of meaning: see ask_assertions.py for what is and isn't verified.
"""
import pytest

from ask_assertions import check
from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_display import ALL_WITHHELD_LINE, WITHHELD_LINE, displayed_lines
from ask_service import UNIT_DECISIONS, _finish_display_fields, _validate_synthesis

STATE = {
    "k-launch": "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed "
                "thresholds for high-risk failures and escalation behavior.",
    "k-grounding": "Troubleshooting guidance is grounded in approved support material and relevant account context "
                   "when that context is available.",
}
LEGAL = "Legal confirmed vendor retention is 30 days for pilot prompts and outputs, with deletion available on request."


def _context():
    selection = AskSelection(job="current_fact", state_ids=list(STATE), review_ids=["r-ret"],
                             blocking_question_ids=["q-ret"], history_ids=["h-ret"], evidence_ids=["e-legal"])
    context = {
        "state": [{"id": k, "statement": v} for k, v in STATE.items()],
        "reviews": [{"id": "r-ret", "review_type": "proposed_update",
                     "decision_question": "Are the vendor's stated retention terms authoritative enough for pilot planning?",
                     "why_consequential": "Security and Legal have not confirmed the agreement.",
                     "affected_state_ids": [], "evidence_ids": ["e-legal"]}],
        "questions": [{"id": "q-ret", "text": "What retention and deletion terms apply to pilot prompts and outputs?",
                       "blocking": True, "blocks": "Security approval for pilot data flow", "status": "open"}],
        "history": [{"id": "h-ret", "new_statement": "The retention Question was resolved, then reopened on October 2.",
                     "old_statement": None, "changed_at": "2026-10-02"}],
        "evidence": [{"id": "e-legal", "content": LEGAL}], "rules": [],
    }
    return selection, context


def _validated(claims, sections=()):
    selection, context = _context()
    answer = AskSynthesis(job="current_fact", claims=list(claims), sections=list(sections))
    cleaned = _validate_synthesis(answer, selection, context, context)
    _finish_display_fields(cleaned, None)
    return cleaned


def _claim(text, basis="none", primary=None, supporting=()):
    return AskClaim(text=text, basis=basis, primary_record_id=primary, supporting_record_ids=list(supporting))


# --- correct statements Paige named: shown as written, on the basis they belong to -----------------------------

@pytest.mark.parametrize("text,basis,primary", [
    ("Retention is not confirmed.", "open_question", "q-ret"),
    ("Retention is not confirmed.", "none", None),
    ("Legal reported confirmation, but the terms remain unaccepted.", "evidence_says", "e-legal"),
    ("The retention Question was resolved previously, then reopened.", "history", "h-ret"),
    ("The retention Question was resolved previously, then reopened.", "open_question", "q-ret"),
    ("Work not dependent on retention can proceed: implementation planning for the bounded use case.",
     "current_state", "k-launch"),
    ("Confirmed retention terms are not yet established in Current State.", "open_question", "q-ret"),
    ("The premise that retention is resolved is not correct: the retention Question is still open.", "open_question", "q-ret"),
    ("Security approval for pilot data flow remains blocked until retention terms are confirmed.", "open_question", "q-ret"),
    ("A pending Review proposes treating the vendor's terms as approved for pilot planning.", "pending_review", "r-ret"),
])
def test_a_correct_statement_is_shown_exactly_as_written(text, basis, primary):
    cleaned = _validated([_claim(text, basis, primary)])
    assert [c.text for c in cleaned.claims] == [text] and cleaned.withheld_claims == 0


# --- Evidence and History: a report or a past status, never present approval -----------------------------------

def test_evidence_supports_an_attributed_report():
    assert check("Legal confirmed vendor retention is 30 days for pilot prompts and outputs.", "evidence_says", {}).ok
    assert check("Legal reportedly confirmed 30 days.", "evidence_says", {}).ok


@pytest.mark.parametrize("text", [
    "Retention terms are confirmed at 30 days.",                              # the source's claim in State's own voice
    "Legal reportedly confirmed 30 days, so Security approval can proceed.",  # a go-ahead drawn from a report
    "Legal confirmed 30 days, which means the pilot data flow is cleared.",
])
def test_evidence_does_not_establish_present_approval(text):
    cleaned = _validated([_claim(text, "evidence_says", "e-legal")])
    assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_history_supports_a_past_status_but_not_a_present_one():
    assert _validated([_claim("The retention Question was resolved on October 2.", "history", "h-ret")]).claims
    assert not _validated([_claim("The retention Question is resolved.", "history", "h-ret")]).claims
    assert not _validated([_claim("Retention is resolved, so Security approval can proceed.", "history", "h-ret")]).claims


# --- Current State must cover the specific assertion or permission, not just be cited --------------------------

def test_a_cited_current_state_record_that_grants_the_permission_carries_it():
    cleaned = _validated([_claim("Implementation planning can proceed for the bounded use case.", "current_state", "k-launch")])
    assert cleaned.claims and cleaned.claims[0].label == "Current State"


def test_a_cited_current_state_record_that_grants_no_permission_does_not_carry_one():
    cleaned = _validated([_claim("Security approval for pilot data flow can proceed.", "current_state", "k-grounding")])
    assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_a_cited_current_state_record_about_something_else_does_not_carry_a_status():
    cleaned = _validated([_claim("Retention and deletion terms are confirmed.", "current_state", "k-grounding")])
    assert cleaned.claims == [] and cleaned.withheld_claims == 1


def test_a_status_the_cited_current_state_record_covers_is_shown():
    text = "Troubleshooting guidance grounded in approved support material is established."
    assert _validated([_claim(text, "current_state", "k-grounding")]).claims[0].text == text


@pytest.mark.parametrize("basis,primary", [("open_question", "q-ret"), ("pending_review", "r-ret"), ("none", None)])
def test_a_permission_on_a_non_current_state_basis_is_withheld(basis, primary):
    assert not _validated([_claim("Work not dependent on retention can proceed.", basis, primary)]).claims


def test_a_pending_review_claim_may_contrast_with_a_current_state_record_it_cites_as_support():
    """The Nov 11 contrast rule: the Current State record is cited as support; the chip stays Needs review."""
    text = "A pending Review proposes changing the planning scope; until it is accepted, implementation planning is approved for the bounded use case."
    assert not _validated([_claim(text, "pending_review", "r-ret")]).claims
    shown = _validated([_claim(text, "pending_review", "r-ret", supporting=["k-launch"])]).claims
    assert shown and shown[0].label == "Needs review" and shown[0].text == text


def test_a_denied_status_is_not_an_assertion_but_a_denied_quality_still_is():
    assert check("The approved pilot budget is not yet recorded in Current State.", "pending_review", {}).ok
    assert not check("The approved pilot budget is not enough for Phase 2.", "pending_review", {}).ok


# --- compound question: both parts survive when each is cited correctly -----------------------------------------

def test_a_compound_answer_keeps_the_blocker_and_what_can_proceed():
    """'Since retention is resolved, what can move forward?' needs the corrected premise and what can proceed."""
    cleaned = _validated([
        _claim("Retention is not resolved: the retention Question is still open and blocks Security approval for "
               "pilot data flow.", "open_question", "q-ret"),
        _claim("Implementation planning can proceed for the bounded use case.", "current_state", "k-launch"),
    ])
    shown = "\n".join(displayed_lines(cleaned.model_dump()))
    assert cleaned.withheld_claims == 0
    assert "not resolved" in shown and "blocks Security approval" in shown
    assert "Implementation planning can proceed" in shown


def test_a_compound_answer_with_the_go_ahead_on_the_wrong_basis_shows_the_limitation():
    """The go-ahead cited to the open Question is withheld, and the answer says part of it was left out."""
    cleaned = _validated([
        _claim("Retention is not resolved: the retention Question is still open.", "open_question", "q-ret"),
        _claim("Implementation planning can proceed for the bounded use case.", "open_question", "q-ret"),
    ])
    lines = displayed_lines(cleaned.model_dump())
    assert [c.text for c in cleaned.claims] == ["Retention is not resolved: the retention Question is still open."]
    assert WITHHELD_LINE in lines


# --- partly and fully withheld answers ---------------------------------------------------------------------------

def test_a_partly_withheld_answer_keeps_its_shown_claims_and_says_part_was_left_out():
    cleaned = _validated([_claim("Retention is not confirmed.", "open_question", "q-ret"),
                          _claim("Retention is resolved.", "none")])
    lines = displayed_lines(cleaned.model_dump())
    assert "[Blocking] Retention is not confirmed." in lines
    assert WITHHELD_LINE in lines and ALL_WITHHELD_LINE not in lines
    assert cleaned.summary.endswith(WITHHELD_LINE)


def test_a_fully_withheld_answer_says_so_without_calling_it_wrong_or_empty():
    cleaned = _validated([_claim("Retention is resolved.", "none"),
                          _claim("Security approval can proceed.", "none")])
    lines = displayed_lines(cleaned.model_dump())
    assert cleaned.claims == [] and cleaned.withheld_claims == 2
    assert ALL_WITHHELD_LINE in lines and WITHHELD_LINE not in lines
    assert "doesn't mean it was wrong" in ALL_WITHHELD_LINE and "has nothing" in ALL_WITHHELD_LINE
    # The records the answer drew on are still shown as recorded.
    assert any("What retention and deletion terms apply" in line for line in lines)
    assert "resolved" not in " ".join(lines).replace("terms are confirmed", "")


def test_a_free_text_card_that_asserts_a_go_ahead_is_withheld_and_counted():
    cleaned = _validated([_claim("Retention is not confirmed.", "open_question", "q-ret")], sections=[
        AskAnswerSection(kind="other", title="What can move forward", items=[
            AskAnswerItem(text="Security approval can proceed now.", record_type="none"),
            AskAnswerItem(text="Implementation planning is unaffected by the retention Question.", record_type="none"),
        ])])
    cards = [i.text for s in cleaned.sections for i in s.items if i.record_type == "none"]
    assert cards == ["Implementation planning is unaffected by the retention Question."]
    assert cleaned.withheld_items == 1


def test_a_model_worded_current_state_card_that_overclaims_shows_the_records_own_text():
    cleaned = _validated([_claim("Retention is not confirmed.", "open_question", "q-ret")], sections=[
        AskAnswerSection(kind="established", title="Current State", items=[
            AskAnswerItem(text="Security approval can proceed for the pilot.", record_type="state", record_id="k-grounding"),
        ])])
    card = next(i for s in cleaned.sections for i in s.items if i.record_id == "k-grounding")
    assert card.wording == "record_fallback" and card.text == STATE["k-grounding"][:690]


def test_a_title_that_asserts_a_status_falls_back_to_the_kinds_title():
    cleaned = _validated([_claim("Retention is not confirmed.", "open_question", "q-ret")], sections=[
        AskAnswerSection(kind="questions", title="Retention resolved", items=[
            AskAnswerItem(text="x", record_type="blocking_question", record_id="q-ret")])])
    assert [s.title for s in cleaned.sections if s.kind == "questions"] == ["Get these answered"]


# --- the decision log (eval diagnostics only) --------------------------------------------------------------------

def test_decisions_are_logged_only_when_an_eval_asks_and_never_reach_the_payload():
    claims = [_claim("Retention is not confirmed.", "open_question", "q-ret"), _claim("Retention is resolved.", "none")]
    assert UNIT_DECISIONS.get() is None
    log: list = []
    token = UNIT_DECISIONS.set(log)
    try:
        cleaned = _validated(claims)
    finally:
        UNIT_DECISIONS.reset(token)
    decided = [(d["unit"], d["raw_text"], d["decision"]) for d in log if d["unit"] == "claim"]
    assert decided == [("claim", "Retention is not confirmed.", "shown"), ("claim", "Retention is resolved.", "withheld")]
    withheld = next(d for d in log if d["decision"] == "withheld")
    assert "status" in withheld["reason"] and withheld["assertions"][0]["phrase"] == "resolved"
    assert "Retention is resolved." not in cleaned.model_dump_json()
    assert _validated(claims) and UNIT_DECISIONS.get() is None


def test_the_eval_capture_collects_decisions_and_resets_after():
    from eval.ask_retention_capture import diagnostics

    with diagnostics() as diag:
        _validated([_claim("Retention is resolved.", "none")])
    assert [d["decision"] for d in diag["decisions"] if d["unit"] == "claim"] == ["withheld"]
    assert diag["model_calls"] == [] and UNIT_DECISIONS.get() is None


# --- Nov 11 fixes from the steps 1-2 capture ----------------------------------------------------------------------

def test_a_report_of_a_source_cited_as_support_is_shown_on_any_basis():
    """Capture run 1: the premise correction was withheld because the Evidence was cited as support, not as the basis."""
    text = ("Retention is not resolved yet: Legal reportedly confirmed a 30-day vendor retention term, but the Review "
            "proposing it is still open and the retention question remains open.")
    shown = _validated([_claim(text, "open_question", "q-ret", supporting=["r-ret", "e-legal"])]).claims
    assert [c.text for c in shown] == [text] and shown[0].label == "Blocking"


@pytest.mark.parametrize("text", [
    "Retention terms are confirmed at 30 days.",                              # State's own voice, not a report
    "Legal reportedly confirmed 30 days, so Security approval can proceed.",  # a go-ahead drawn from the report
])
def test_citing_a_source_as_support_does_not_carry_a_status_or_a_go_ahead(text):
    assert not _validated([_claim(text, "open_question", "q-ret", supporting=["e-legal"])]).claims


@pytest.mark.parametrize("text,basis", [
    ("A proposed 25% increase is pending review and has not been decided, so the email is contingent on that Review "
     "being accepted.", "none"),
    ("I can draft the email conditionally on the increase being approved, but it must not be presented as decided.", "none"),
    ("Hello, we expect to move to the new price, subject to final approval.", "none"),
    ("Draft customer email (assumes the increase is approved)", "none"),
])
def test_a_condition_still_to_be_met_is_not_a_status(text, basis):
    assert check(text, basis, {}).ok


@pytest.mark.parametrize("text", [
    "The increase is being finalized and the price is final.",
    "Being approved, the price is final.",
    "The price increase is approved.",
])
def test_a_status_stated_alongside_condition_words_still_counts(text):
    assert not check(text, "none", {}).ok
