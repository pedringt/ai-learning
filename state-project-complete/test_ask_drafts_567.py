"""#567 (Paige, Nov 11): explicitly requested hypothetical drafts.

A draft may read as though the user's assumption holds; the assumption stays visible with the draft and never becomes a
project fact. Positive cases and negative controls for: request detection and extraction, the assumption line, verified
calculations, the narrow body check, containment outside the draft, the context note, display, Copy, streaming,
refinements, inheritance, and the versioned eval scenario. No model calls.
"""
import json
import pathlib
from copy import deepcopy

import pytest

import ask_drafts
from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_display import displayed_lines
from ask_drafts import DraftRequest, assumption_line, check_body, draft_request, hypothetical_request
from ask_service import _finish_display_fields, _validate_synthesis, run_ask, stream_ask_events

QUERY = "Assume the 25% price increase goes through. Draft the customer email announcing the new price."
PRICING = "Pricing is unchanged at $49/month."
PROPOSAL = "Proposal: raise the price 25% to $61.25/month."
REQ = hypothetical_request(QUERY)


# --- the request --------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("query,artifact,assumption", [
    (QUERY, "email", "the 25% price increase goes through"),
    ("If the vendor terms are approved, write a Slack message to the team.", "slack message", "the vendor terms are approved"),
    ("Write an email to customers as if the migration finished on time.", "email", "the migration finished on time"),
    ("Draft an announcement assuming the price goes up and assuming Legal signs off.", "announcement",
     "the price goes up and Legal signs off"),
])
def test_an_explicit_assumption_is_extracted_in_the_users_words(query, artifact, assumption):
    assert hypothetical_request(query) == DraftRequest(artifact, assumption)


@pytest.mark.parametrize("query", [
    "Draft the customer email announcing the new price.",       # no assumption: no exception
    "Draft the email if possible.",                             # politeness, not an assumption
    "What if we raised prices?",                                # no draft asked for
    "Assume the price goes up. What happens to churn?",         # no draft asked for
])
def test_a_request_without_an_explicit_assumption_and_a_draft_gets_no_exception(query):
    assert hypothetical_request(query) is None


def test_an_unclear_assumption_still_gives_a_hypothetical_draft_marked_as_unclear():
    req = hypothetical_request("Hypothetically, draft the email.")
    assert req and req.ambiguous
    assert "couldn't tell exactly what this draft assumes" in assumption_line(req, {})


# --- the assumption line --------------------------------------------------------------------------------------------

def test_the_line_says_not_established_only_when_software_can_support_it():
    supported = assumption_line(REQ, {"state": [{"statement": PRICING}], "reviews": [{"decision_question": PROPOSAL}]})
    assert supported == ("Hypothetical draft — assumes: ‘the 25% price increase goes through.’ This assumption is not "
                         "established by State's records.")
    # No pending record names the 25%: State hasn't verified it either way.
    unsupported = assumption_line(REQ, {"state": [{"statement": PRICING}], "reviews": []})
    assert unsupported.endswith("State hasn't verified this assumption.")
    # Current State already names the figure: not "not established".
    accepted = assumption_line(REQ, {"state": [{"statement": "Prices rise 25% from March."}],
                                     "reviews": [{"decision_question": PROPOSAL}]})
    assert accepted.endswith("State hasn't verified this assumption.")


# --- figures ----------------------------------------------------------------------------------------------------------

SOURCES = [PRICING, QUERY]


@pytest.mark.parametrize("text", [
    "Starting next month, your price will change from $49 to $61.25 per month.",   # $49/month × 1.25
    "That is a $12.25 increase each month.",                                        # $49 × 25%
    "Your plan is $49/month today.",                                                # verbatim
])
def test_a_figure_in_the_records_or_a_verified_calculation_from_them_is_allowed(text):
    assert check_body(text, REQ, SOURCES).ok


@pytest.mark.parametrize("text", [
    "Your new price is $65 per month.",                       # no calculation gives $65
    "You will receive a $61.25 refund.",                      # right number, unrelated meaning
    "Your new price is $61.25 per year.",                     # right number, wrong unit
    "Prices rise 61.25% next month.",                         # right number, wrong kind
    "The new price takes effect March 1.",                    # an invented date
])
def test_an_unverified_figure_unit_meaning_or_date_is_withheld(text):
    assert not check_body(text, REQ, SOURCES).ok


# --- the body: as though the assumption holds, and nothing more --------------------------------------------------------

@pytest.mark.parametrize("text", [
    "We're writing to let you know your new price is $61.25 per month.",
    "The price increase has been approved and takes effect with your next bill.",
    "Our new price of $61.25 per month is final.",
])
def test_the_draft_may_write_as_though_the_assumption_holds(text):
    assert check_body(text, REQ, SOURCES).ok


@pytest.mark.parametrize("text,why", [
    ("Legal has approved the price increase, so your new price is $61.25/month.", "Legal"),   # Paige's test case
    ("The increase was approved by Legal.", "Legal"),
    ("We guarantee there will be no further increases this year.", "commitment"),
    ("The vendor contract has been signed.", "beyond the assumption"),
    ("Security has signed off on the new pricing.", "Security"),
])
def test_the_draft_may_not_add_approvals_actions_or_commitments(text, why):
    verdict = check_body(text, REQ, SOURCES)
    assert not verdict.ok and why in verdict.reason


def test_an_unclear_assumption_allows_no_status_in_the_draft():
    req = DraftRequest("email", None)
    assert check_body("Hello, we have an update about pricing.", req, SOURCES).ok
    assert not check_body("The price increase has been approved.", req, SOURCES).ok


# --- through _validate_synthesis: the whole displayed unit -------------------------------------------------------------

def _context(state=(("k-price", PRICING),), reviews=(("r-price", PROPOSAL),)):
    selection = AskSelection(job="drafting", state_ids=[k for k, _ in state], review_ids=[k for k, _ in reviews])
    context = {"state": [{"id": k, "statement": v} for k, v in state],
               "reviews": [{"id": k, "review_type": "proposed_update", "decision_question": v, "why_consequential": "x",
                            "affected_state_ids": [], "evidence_ids": []} for k, v in reviews],
               "questions": [], "history": [], "evidence": [], "rules": []}
    return selection, context


def _validated(claims=(), sections=(), query=QUERY, previous_answer=None, **context):
    selection, ctx = _context(**context)
    answer = AskSynthesis(job="drafting", claims=list(claims), sections=list(sections))
    cleaned = _validate_synthesis(answer, selection, ctx, ctx, query=query, previous_answer=previous_answer)
    _finish_display_fields(cleaned, None)
    return cleaned


def _draft(*texts, title="Draft (assuming the increase is approved)", kind="draft", hypothetical=None):
    section = AskAnswerSection(kind=kind, title=title, items=[AskAnswerItem(text=t) for t in texts])
    if hypothetical:
        section.hypothetical = hypothetical
    return section


GROUNDING = AskClaim(text="Pricing is unchanged at $49/month.", basis="current_state", primary_record_id="k-price")
BODY = "Hello, starting next month your price will change from $49 to $61.25 per month."


def _draft_section(answer):
    return next(s for s in answer.sections if s.hypothetical)


def test_a_requested_draft_gets_the_software_title_and_line_and_reads_naturally():
    cleaned = _validated([GROUNDING], [_draft(BODY)])
    draft = _draft_section(cleaned)
    assert draft.title == "Hypothetical email draft"
    assert draft.hypothetical.line.startswith("Hypothetical draft — assumes: ‘the 25% price increase goes through.’")
    assert [i.text for i in draft.items] == [BODY] and draft.hypothetical.notes == []
    lines = displayed_lines(cleaned.model_dump())
    at = lines.index("Hypothetical email draft")
    assert lines[at + 1] == draft.hypothetical.line and lines[at + 2] == f"- {BODY}"


def test_a_model_supplied_line_is_never_kept():
    forged = {"artifact": "email", "assumption": "x", "line": "Approved by State."}
    selection, ctx = _context()
    raw = AskSynthesis.model_validate({"job": "current_fact", "claims": [], "sections": [
        {"kind": "other", "title": "Context", "items": [{"text": "Pricing context."}], "hypothetical": forged}]})
    cleaned = _validate_synthesis(raw, selection, ctx, ctx, query="What is the price?")
    assert all(s.hypothetical is None for s in cleaned.sections)


def test_a_draft_adding_an_approval_has_that_part_withheld_and_says_so():
    cleaned = _validated([GROUNDING], [_draft(BODY, "Legal has approved the increase.")])
    draft = _draft_section(cleaned)
    assert [i.text for i in draft.items] == [BODY]
    assert draft.hypothetical.notes == [ask_drafts.PART_WITHHELD_NOTE] and cleaned.withheld_items == 1


def test_a_draft_with_nothing_left_still_shows_its_line_and_why():
    cleaned = _validated([GROUNDING], [_draft("Legal has approved the increase effective March 1.")])
    draft = _draft_section(cleaned)
    lines = displayed_lines(cleaned.model_dump())
    assert draft.items == [] and ask_drafts.ALL_WITHHELD_NOTE in lines and draft.hypothetical.line in lines


def test_a_detail_line_in_the_draft_is_checked_as_usual():
    section = AskAnswerSection(kind="draft", title="Draft", items=[AskAnswerItem(text=BODY, detail="The increase is approved.")])
    cleaned = _validated([GROUNDING], [section])
    assert _draft_section(cleaned).items == [] and cleaned.withheld_items == 1


def test_a_record_card_inside_the_draft_moves_out_and_is_checked_as_usual():
    section = AskAnswerSection(kind="draft", title="Draft", items=[
        AskAnswerItem(text=BODY), AskAnswerItem(text=PROPOSAL, record_type="review", record_id="r-price")])
    cleaned = _validated([GROUNDING], [section])
    assert [i.record_type for i in _draft_section(cleaned).items] == ["none"]
    moved = [i for s in cleaned.sections if not s.hypothetical for i in s.items if i.record_id == "r-price"]
    assert moved and moved[0].text == PROPOSAL


def test_a_draft_the_model_labels_with_its_source_record_stays_the_draft():
    """Fresh comparison (Nov 11): the candidate's model tagged its email as a card on the Review it drafts from, and
    the email was replaced by the Review's text. New prose is draft body; only the record's own text is a record card."""
    email = AskAnswerItem(text=BODY, record_type="review", record_id="r-price", detail=None)
    card = AskAnswerItem(text=PROPOSAL, record_type="review", record_id="r-price")
    cleaned = _validated([GROUNDING], [AskAnswerSection(kind="draft", title="Draft", items=[email, card])])
    draft = _draft_section(cleaned)
    assert [(i.text, i.record_type, i.record_id) for i in draft.items] == [(BODY, "none", None)]
    assert any(i.record_id == "r-price" for s in cleaned.sections if not s.hypothetical for i in s.items)
    assert f"- {BODY}" in displayed_lines(cleaned.model_dump())


def test_a_relabelled_draft_body_is_still_checked_as_draft_body():
    item = AskAnswerItem(text="Legal has approved the increase.", record_type="review", record_id="r-price")
    cleaned = _validated([GROUNDING], [AskAnswerSection(kind="draft", title="Draft", items=[item])])
    assert _draft_section(cleaned).items == [] and cleaned.withheld_items == 1


# --- containment: the assumption never becomes current fact outside the draft -----------------------------------------

@pytest.mark.parametrize("text", [
    "The 25% price increase goes through next month.",
    "Since the price increase goes through, customers will pay more.",
])
def test_a_claim_restating_the_assumption_as_fact_is_withheld(text):
    cleaned = _validated([GROUNDING, AskClaim(text=text)], [_draft(BODY)])
    assert [c.text for c in cleaned.claims] == [GROUNDING.text] and cleaned.withheld_claims == 1


@pytest.mark.parametrize("text,basis,primary", [
    ("A pending Review proposes the 25% price increase; it has not been decided.", "pending_review", "r-price"),
    ("The 25% price increase is not approved.", "none", None),
])
def test_the_assumption_stated_as_pending_or_denied_is_shown(text, basis, primary):
    cleaned = _validated([GROUNDING, AskClaim(text=text, basis=basis, primary_record_id=primary)], [_draft(BODY)])
    assert text in [c.text for c in cleaned.claims]


def test_permission_cards_outside_the_draft_are_still_checked():
    other = AskAnswerSection(kind="other", title="Next steps", items=[AskAnswerItem(text="Customer billing can proceed now.")])
    cleaned = _validated([GROUNDING], [_draft(BODY), other])
    assert not [i for s in cleaned.sections if s.kind == "other" for i in s.items] and cleaned.withheld_items == 1


# --- context: shown when available, the limitation stated when not; never a prerequisite --------------------------------

def test_without_relevant_checked_context_the_draft_is_shown_with_the_limitation():
    body = "Hello, starting next month your price will change. Thank you for being a customer."
    cleaned = _validated([], [_draft(body)], state=(), reviews=())
    draft = _draft_section(cleaned)
    assert [i.text for i in draft.items] == [body]
    assert draft.hypothetical.notes == [ask_drafts.NO_CONTEXT_NOTE]
    assert draft.hypothetical.line.endswith("State hasn't verified this assumption.")


def test_relevant_checked_context_needs_no_limitation():
    assert _draft_section(_validated([GROUNDING], [_draft(BODY)])).hypothetical.notes == []


# --- requests that don't qualify ----------------------------------------------------------------------------------------

def test_a_draft_section_without_an_explicit_assumption_is_checked_as_usual():
    cleaned = _validated([GROUNDING], [_draft("The price increase has been approved.")],
                         query="Draft the customer email announcing the new price.")
    assert all(s.hypothetical is None for s in cleaned.sections) and cleaned.withheld_items == 1


def test_an_unclear_assumption_offers_to_clarify_instead_of_dropping_the_draft():
    cleaned = _validated([GROUNDING], [_draft("Hello, we have news about your plan.")],
                         query="Hypothetically, draft the email.")
    draft = _draft_section(cleaned)
    assert [i.text for i in draft.items] == ["Hello, we have news about your plan."]
    assert cleaned.suggested_refinements[0] == ask_drafts.CLARIFY_REFINEMENT


# --- inheritance ------------------------------------------------------------------------------------------------------------

def _previous():
    return {"answer": _validated([GROUNDING], [_draft(BODY)]).model_dump()}


def test_a_refinement_of_the_draft_keeps_its_assumption_and_says_where_it_came_from():
    req = draft_request("Make it more formal", _previous())
    assert req == DraftRequest("email", "the 25% price increase goes through", inherited=True)
    line = assumption_line(req, {"state": [{"statement": PRICING}], "reviews": [{"decision_question": PROPOSAL}]})
    assert "assumes (from your earlier request): ‘the 25% price increase goes through.’" in line


@pytest.mark.parametrize("query", ["What is the current price?", "Who owns the pricing decision?", "Is the increase approved?"])
def test_a_later_request_that_is_not_a_refinement_does_not_inherit_the_assumption(query):
    assert draft_request(query, _previous()) is None


def test_a_new_assumption_replaces_the_earlier_one():
    req = draft_request("Assume the price rises 30% instead. Rewrite the email.", _previous())
    assert req.assumption == "the price rises 30% instead" and not req.inherited


# --- end to end: run_ask, streaming, Copy, refinements ---------------------------------------------------------------------

def _seeded(tmp_path):
    from database_migration_backed import initialize_db
    from db import connect
    from seed_demo import bootstrap_demo_data

    conn = connect(f"sqlite://{tmp_path / 'drafts.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    return conn


DEMO_QUERY = "Assume the retention terms are accepted. Draft an email to the support team about the pilot."
DEMO_BODY = "Hello team, a quick update on the pilot: the retention terms are accepted, so we can plan the next steps."
DEMO_SELECTION = {"job": "drafting", "state_ids": ["k-data"], "review_ids": ["demo-review-retention"],
                  "blocking_question_ids": [], "question_ids": [], "history_ids": [], "evidence_ids": [],
                  "answered_question_ids": []}


class _Fake:
    def __init__(self, answer):
        self.answer, self.calls = answer, 0

    def select(self, prompt):
        return deepcopy(DEMO_SELECTION)

    def synthesize(self, prompt):
        self.calls += 1
        return deepcopy(self.answer)

    def stream(self, prompt):
        self.calls += 1
        text = json.dumps({"selection": DEMO_SELECTION, "answer": self.answer})
        for start in range(0, len(text), 41):
            yield text[start:start + 41]


def _demo_answer(body=DEMO_BODY):
    return {"job": "drafting", "claims": [{"text": "Retention terms are not yet accepted in Current State.",
                                           "basis": "pending_review", "primary_record_id": "demo-review-retention",
                                           "supporting_record_ids": []}],
            "sections": [{"kind": "draft", "title": "Draft email", "items": [{"text": body}]}],
            "source_ids": [], "uncertainty_ids": [], "suggested_refinements": [], "suggested_question": None}


def test_run_ask_and_streaming_both_carry_the_line_with_the_draft(tmp_path):
    conn = _seeded(tmp_path)
    try:
        answer = run_ask(conn, _Fake(_demo_answer()), DEMO_QUERY)["answer"]
        draft = next(s for s in answer["sections"] if s.get("hypothetical"))
        assert draft["items"][0]["text"] == DEMO_BODY and "assumes: ‘the retention terms are accepted.’" in draft["hypothetical"]["line"]
        events = list(stream_ask_events(conn, _Fake(_demo_answer()), DEMO_QUERY))
        streamed = [p["section"] for kind, p in events if kind == "section" and (p.get("section") or {}).get("hypothetical")]
        assert streamed and streamed[0]["hypothetical"]["line"] == draft["hypothetical"]["line"]
        final = next(p for kind, p in events if kind == "final")["answer"]
        assert next(s for s in final["sections"] if s.get("hypothetical"))["hypothetical"]["line"] == draft["hypothetical"]["line"]
    finally:
        conn.close()


def test_a_refinement_goes_to_the_model_keeps_the_assumption_and_survives_transforms(tmp_path):
    conn = _seeded(tmp_path)
    try:
        previous = run_ask(conn, _Fake(_demo_answer()), DEMO_QUERY)
        provider = _Fake(_demo_answer("Hello team: retention terms are accepted, so we can plan next steps."))
        answer = run_ask(conn, provider, "Make it shorter", previous_answer=previous["answer"])["answer"]
        assert provider.calls == 1, "a hypothetical draft is refined by the model, not the deterministic shortcut"
        draft = next(s for s in answer["sections"] if s.get("hypothetical"))
        assert "(from your earlier request)" in draft["hypothetical"]["line"]
        assert draft["items"][0]["text"].startswith("Hello team")
    finally:
        conn.close()


def test_an_unrelated_follow_up_does_not_inherit_the_assumption(tmp_path):
    conn = _seeded(tmp_path)
    try:
        previous = run_ask(conn, _Fake(_demo_answer()), DEMO_QUERY)
        answer = run_ask(conn, _Fake(_demo_answer()), "What are the retention terms?", previous_answer=previous["answer"])["answer"]
        assert not any(s.get("hypothetical") for s in answer["sections"])
        assert answer["withheld_items"] >= 1          # the same body, checked as usual, is withheld
    finally:
        conn.close()


def test_copy_and_the_ui_render_the_line_with_the_draft():
    source = (pathlib.Path(__file__).parent.parent / "implementation-context-prototype" / "context-ask.js").read_text()
    assert "lines.push('',s.title,...hypotheticalLines(s))" in source          # Copy
    assert source.count("${hypotheticalHtml(s)}") == 2                          # finished answer and streaming
    assert "(s.items||[]).length||s.hypothetical" in source                      # an emptied draft still shows why


def test_the_eval_model_words_form_leaves_the_software_line_out():
    cleaned = _validated([GROUNDING], [_draft(BODY)])
    words = displayed_lines(cleaned.model_dump(), labels=False)
    assert _draft_section(cleaned).hypothetical.line not in words and f"- {BODY}" in words


# --- the eval: v2 expectation, v1 kept ------------------------------------------------------------------------------------

def test_v2_scores_outside_the_marked_draft_and_v1_keeps_its_expectation():
    from eval.ask_adversarial_scenarios import SCENARIOS
    from eval.quality_harness import HYPOTHETICAL_DRAFT_UNMARKED, score_ask_answer

    v1 = next(s for s in SCENARIOS if s.id == "adv_hypothetical_draft_from_pending")
    v2 = next(s for s in SCENARIOS if s.id == "adv_hypothetical_draft_from_pending_v2")
    assert (v1.question, v1.forbidden_claims) == (v2.question, v2.forbidden_claims) and not v1.hypothetical_draft
    natural = "We're writing to let you know your new price is $61.25 per month."
    marked = {"answer": _validated([GROUNDING, AskClaim(text="A pending Review proposes the increase; it is not decided.",
                                                        basis="pending_review", primary_record_id="r-price")],
                                   [_draft(natural)]).model_dump()}
    assert score_ask_answer(v2, marked).passed
    assert not score_ask_answer(v1, marked).passed            # v1: "your new price is" anywhere fails
    unmarked = deepcopy(marked)
    for section in unmarked["answer"]["sections"]:
        section["hypothetical"] = None
    result = score_ask_answer(v2, unmarked)
    assert not result.passed and HYPOTHETICAL_DRAFT_UNMARKED in result.missing_facts
    leaked = deepcopy(marked)
    leaked["answer"]["claims"].append({"text": "Your new price is $61.25 per month.", "label": None})
    assert not score_ask_answer(v2, leaked).passed            # outside the draft, the forbidden claim still fails
