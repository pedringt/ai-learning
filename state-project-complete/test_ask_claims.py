"""#567: claim-level authority for Ask (design approved by Paige, Nov 10). No model calls.

Covers the application-side checks a claim or a model-worded record card passes before anyone sees it, what
happens when one fails (withheld, or the record's own text after a passing reference), the fixed headlines, the
compatibility summary, streaming, refinements and the cache key. The limits of the checks are pinned too, so
nobody mistakes them for proof of meaning.
"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import date

from ask_claims import (
    DEFAULT_HEADLINE, FIXED_HEADLINES, ClaimChecker, anchors, anchors_supported, fixed_headline, prepare_answer_raw,
)
from ask_display import ALL_WITHHELD_LINE, WITHHELD_LINE
from ask_service import _StreamedAnswerScanner, ask_cache_key, run_ask, stream_ask_events
from db import connect
from database_migration_backed import initialize_db
from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data

# --- the anchor check: a limited safeguard -------------------------------------------------------------------


def test_anchor_check_matches_figures_written_differently():
    assert anchors_supported("The budget is $40k.", ["approved at $40,000"])
    assert anchors_supported("Retention is 30 days.", ["Content is deleted within 30 days."])
    assert anchors_supported("It was answered on Sep 4.", ["resolved_at 2026-09-04 10:00:00"])
    assert anchors_supported("Launch is March 3rd.", ["The public launch date is March 3."])
    assert anchors_supported("Q3 planning", ["no numbers here"]), "Q3 is a name, not a figure"


def test_anchor_check_catches_an_invented_figure_or_month():
    assert not anchors_supported("The budget is $45,000.", ["approved at $40,000"])
    assert not anchors_supported("Launch is April 3.", ["The public launch date is March 3."])
    assert not anchors_supported("Up 25% since 2025.", ["Up 25% this year."])


def test_may_counts_as_a_month_only_next_to_a_number():
    assert anchors("We may launch soon.") == (set(), set())
    assert anchors("Launch on May 3.") == ({"3"}, {5})


def test_anchor_check_is_not_proof_of_meaning():
    """Pinned limits: a figure on the wrong subject, a reversed negation and a count in words all pass."""
    record = ["The pilot budget is $40,000. The training budget is $5,000."]
    assert anchors_supported("The training budget is $40,000.", record)
    assert anchors_supported("The pilot budget is not $40,000.", record)
    assert anchors_supported("There are seventeen open Reviews.", record)


# --- the reference check -------------------------------------------------------------------------------------

CONTEXT = {
    "state": [{"id": "k-budget", "topic": "budget", "statement": "The pilot budget is $40,000."}],
    "reviews": [{"id": "r-1", "decision_question": "Raise the pilot budget to $45,000?", "why_consequential": "Budget"}],
    "questions": [{"id": "q-1", "text": "Who signs off on retention?", "blocking": True, "blocks": "Launch"},
                  {"id": "q-2", "text": "Which SSO provider?", "blocking": False, "blocks": None}],
    "answered_questions": [{"id": "aq-1", "text": "What is retention?", "answer": "Deleted within 30 days.",
                            "resolved_at": "2026-09-04 10:00:00"}],
    "history": [{"id": "h-1", "state_item_id": "k-budget", "old_statement": "The pilot budget is $35,000.",
                 "new_statement": "The pilot budget is $40,000.", "changed_at": "2026-08-20 09:00:00"}],
    "evidence": [{"id": "e-1", "content": "Q3 planning note: the pilot budget is approved at $40,000.",
                  "source_type": "meeting_note", "submitted_at": "2026-08-15 12:00:00"}],
    "rules": [],
}


def _claim(text, basis="none", primary=None, supporting=()):
    return {"text": text, "basis": basis, "primary_record_id": primary, "supporting_record_ids": list(supporting)}


def test_each_basis_gets_its_label_from_the_primary_record():
    checker = ClaimChecker(CONTEXT)
    assert checker.check_claim(_claim("The pilot budget is $40,000.", "current_state", "k-budget")) == "Current State"
    assert checker.check_claim(_claim("A Review proposes $45,000.", "pending_review", "r-1")) == "Needs review"
    assert checker.check_claim(_claim("The note says $40,000 is approved.", "evidence_says", "e-1")) == "Project evidence"
    assert checker.check_claim(_claim("Retention sign-off is open.", "open_question", "q-1")) == "Blocking"
    assert checker.check_claim(_claim("The SSO provider is open.", "open_question", "q-2")) == "Open question"
    assert checker.check_claim(_claim("Retention: 30 days, answered Sep 4.", "answered_question", "aq-1")) == "Answered question"
    assert checker.check_claim(_claim("It went from $35,000 to $40,000.", "history", "h-1")) == "History"
    assert checker.check_claim(_claim("Nothing records an owner.")) == ""


def test_a_mismatched_or_missing_reference_is_withheld():
    checker = ClaimChecker(CONTEXT)
    assert checker.check_claim(_claim("The budget is $45,000.", "current_state", "r-1")) is None   # a Review is not Current State
    assert checker.check_claim(_claim("The budget is decided.", "current_state", None)) is None
    assert checker.check_claim(_claim("Budget approved.", "evidence_says", "e-404")) is None
    assert checker.check_claim(_claim("Owner unknown.", "none", "k-budget")) is None              # `none` has no primary
    assert checker.check_claim(_claim("The pilot budget is $40,000.", "current_state", "k-budget", ["e-404"])) is None


def test_supporting_references_never_raise_the_label():
    checker = ClaimChecker(CONTEXT)
    assert checker.check_claim(_claim("A Review proposes $45,000 after the $40,000 note.", "pending_review", "r-1", ["k-budget", "e-1"])) == "Needs review"


def test_a_labelled_claim_naming_a_figure_its_records_lack_is_withheld():
    checker = ClaimChecker(CONTEXT)
    assert checker.check_claim(_claim("The pilot budget is $45,000.", "current_state", "k-budget")) is None
    # the figure is in a supporting record, so it passes
    assert checker.check_claim(_claim("The pilot budget is $40,000, up from $35,000.", "current_state", "k-budget", ["h-1"])) == "Current State"


def test_an_unlabelled_claim_may_use_any_selected_record_the_request_or_today():
    checker = ClaimChecker(CONTEXT, query="Is the budget $50,000?", today=date(2026, 11, 10))
    assert checker.check_claim(_claim("State has no record of a $50,000 budget.")) == ""
    assert checker.check_claim(_claim("As of November 10, nothing is overdue.")) == ""
    assert checker.check_claim(_claim("The budget is $60,000.")) is None


def test_a_labelled_claim_may_restate_the_requests_figure_but_not_invent_one():
    """Batch B (Nov 11): "...so a $75 credit requires manager approval" was withheld for naming the request's $75."""
    checker = ClaimChecker(CONTEXT, query="Can we raise the budget to $50,000?")
    assert checker.check_claim(_claim("Current State has the budget at $40,000, not $50,000.", "current_state", "k-budget")) == "Current State"
    assert checker.check_claim(_claim("The budget is $60,000.", "current_state", "k-budget")) is None
    assert checker.check_claim(_claim("No $50,000 budget is recorded.", "none", None, ["k-budget"])) == ""


def test_a_contrast_with_another_record_passes_only_when_that_record_is_cited():
    """Batch B (Nov 11): 53 of 65 withheld claims contrasted their record with another record's figure without citing
    it. The check stays strict; the prompt asks for the citation."""
    checker = ClaimChecker(CONTEXT)
    claim = "A Review proposes $45,000; Current State still says $40,000."
    assert checker.check_claim(_claim(claim, "pending_review", "r-1")) is None
    assert checker.check_claim(_claim(claim, "pending_review", "r-1", ["k-budget"])) == "Needs review"


def test_an_answered_questions_resolving_review_or_evidence_counts_as_citing_the_question():
    context = deepcopy(CONTEXT)
    context["answered_questions"][0].update(answered_by_review_id="r-resolved", answer_evidence_id="e-answer")
    checker = ClaimChecker(context)
    for linked in ("r-resolved", "e-answer"):
        assert checker.check_claim(_claim("Retention is 30 days.", "answered_question", "aq-1", [linked])) == "Answered question"
    # a linked id supports; it is never a primary record, and an unlinked id is still withheld
    assert checker.check_claim(_claim("Retention is 30 days.", "pending_review", "r-resolved")) is None
    assert checker.check_claim(_claim("Retention is 30 days.", "answered_question", "aq-1", ["r-other"])) is None
    # the link adds no figures the Question does not have
    assert checker.check_claim(_claim("Retention is 45 days.", "answered_question", "aq-1", ["r-resolved"])) is None


def test_structure_cannot_detect_a_sentence_that_mixes_authority_levels():
    """Pinned limit (Paige, Nov 10): the primary record is valid and every figure is in a cited record, so this
    passes, although it states a pending $45,000 as if it were Current State. Prompts, evals and human review own this."""
    checker = ClaimChecker(CONTEXT)
    assert checker.check_claim(_claim("The pilot budget is $40,000 and rises to $45,000.", "current_state", "k-budget", ["r-1"])) == "Current State"


# --- preparing the raw answer --------------------------------------------------------------------------------


def test_prepare_withholds_extra_overlong_and_empty_claims_and_drops_model_headline():
    raw = {"job": "current_fact", "headline": "Approved!", "summary": "x",
           "claims": [_claim(f"Claim {i}.") for i in range(5)] + [_claim("x" * 301), _claim("  ")],
           "sections": []}
    prepared, withheld = prepare_answer_raw(raw)
    assert [c["text"] for c in prepared["claims"]] == ["Claim 0.", "Claim 1.", "Claim 2.", "Claim 3."]
    assert withheld == 3 and prepared["headline"] == DEFAULT_HEADLINE and prepared["summary"] == ""


def test_an_older_answer_summary_is_withheld_not_shown():
    prepared, withheld = prepare_answer_raw({"job": "current_fact", "headline": "Approved", "summary": "Budget approved.", "sections": []})
    assert prepared["claims"] == [] and withheld == 1


def test_fixed_headlines_never_take_a_headline_from_the_browser():
    assert fixed_headline("meeting_prep") == "Meeting brief"
    assert fixed_headline("refinement", {"headline": "Catch-up"}) == "Catch-up"
    assert fixed_headline("refinement", {"headline": "Budget approved!"}) == DEFAULT_HEADLINE
    assert set(FIXED_HEADLINES.values()) >= {"What State has on record", "Recorded changes", "Draft from State's records"}


# --- through run_ask on the seeded demo ----------------------------------------------------------------------


def _seeded(tmp_path, project=None):
    conn = connect(f"sqlite://{tmp_path / 'claims.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    bootstrap_juniper_demo_data(conn)
    if project:
        conn.project_id = project
    return conn


SELECTION = {"job": "current_fact", "state_ids": ["k-data"], "review_ids": ["demo-review-create-budget"],
             "blocking_question_ids": [], "question_ids": [], "history_ids": ["demo-history-rollout-sequence"],
             "evidence_ids": ["ask-evidence-tier2-slack"], "answered_question_ids": []}


class _FakeAsk:
    def __init__(self, answer, selection=SELECTION):
        self.answer, self.selection = answer, selection

    def select(self, prompt):
        return deepcopy(self.selection)

    def synthesize(self, prompt):
        return deepcopy(self.answer)

    def stream(self, prompt):
        text = json.dumps({"selection": self.selection, "answer": self.answer})
        for start in range(0, len(text), 37):     # small chunks, split anywhere
            yield text[start:start + 37]


def _answer(claims, sections=()):
    return {"job": "current_fact", "claims": claims, "sections": list(sections), "source_ids": [], "uncertainty_ids": [],
            "suggested_refinements": [], "suggested_question": None}


def test_run_ask_shows_checked_claims_with_a_fixed_headline_and_a_labelled_summary(tmp_path):
    conn = _seeded(tmp_path)
    try:
        answer = run_ask(conn, _FakeAsk(_answer([
            _claim("The pilot stays read-only.", "current_state", "k-data"),
            _claim("The pilot is approved at $95,000.", "current_state", "k-data"),        # figure not in the record
            _claim("Recording the budget is awaiting review.", "pending_review", "demo-review-create-budget"),
        ])), "Is the pilot read-only?")["answer"]
        assert answer["headline"] == "What State has on record"
        assert [(c["label"], c["text"]) for c in answer["claims"]] == [
            ("Current State", "The pilot stays read-only."), ("Needs review", "Recording the budget is awaiting review.")]
        assert answer["withheld_claims"] == 1
        assert answer["summary"].split("\n") == [
            "[Current State] The pilot stays read-only.", "[Needs review] Recording the budget is awaiting review.", WITHHELD_LINE]
        assert "95,000" not in json.dumps(answer)
    finally:
        conn.close()


def test_a_model_worded_card_falls_back_to_record_text_only_after_its_reference_passes(tmp_path):
    conn = _seeded(tmp_path)
    try:
        answer = run_ask(conn, _FakeAsk(_answer([_claim("Pilot data use is limited.", "current_state", "k-data")], [
            {"kind": "established", "title": "Context", "items": [
                {"text": "The pilot stays read-only.", "record_type": "state", "record_id": "k-data", "detail": None},
                {"text": "Read-only for 90 days.", "record_type": "state", "record_id": "k-data", "detail": None},
                {"text": "Tier 2 is in by Oct 1.", "record_type": "evidence", "record_id": "ask-evidence-tier2-slack", "detail": None},
                {"text": "Budget is $40,000.", "record_type": "state", "record_id": "k-budget-missing", "detail": None},
                {"text": "Juniper's lease ends soon.", "record_type": "state", "record_id": "j-lease-end", "detail": None},
            ]}])), "Is the pilot read-only, and is Tier 2 included?")["answer"]
        items = next(s for s in answer["sections"] if s["title"] == "Context")["items"]
        assert [(i["wording"], i["record_id"]) for i in items] == [
            ("model", "k-data"), ("record_fallback", "k-data"), ("record_fallback", "ask-evidence-tier2-slack")]
        assert items[1]["text"].startswith("The pilot uses the minimum customer and account data")
        assert items[2]["text"].startswith("“Tier 2 should be fine to include too") and "2026-09-02" in items[2]["detail"]
        assert answer["withheld_items"] == 2        # an unknown id and another project's record: withheld, never replaced
        assert "Juniper" not in json.dumps(answer) and "$40,000" not in json.dumps(answer)
    finally:
        conn.close()


def test_a_claim_citing_another_projects_record_is_withheld(tmp_path):
    conn = _seeded(tmp_path, project="juniper")
    try:
        selection = {**SELECTION, "state_ids": ["k-data"], "review_ids": [], "history_ids": [], "evidence_ids": []}
        answer = run_ask(conn, _FakeAsk(_answer([_claim("The pilot stays read-only.", "current_state", "k-data")]), selection),
                         "Is the pilot read-only?")["answer"]
        assert answer["claims"] == [] and answer["withheld_claims"] == 1
        assert answer["summary"] == ALL_WITHHELD_LINE
    finally:
        conn.close()


def test_streaming_sends_only_checked_claims_and_matches_the_final_answer(tmp_path):
    conn = _seeded(tmp_path)
    try:
        provider = _FakeAsk(_answer([
            _claim("The pilot stays read-only.", "current_state", "k-data"),
            _claim("The pilot is approved at $95,000.", "current_state", "k-data"),
            _claim("Recording the budget is awaiting review.", "pending_review", "demo-review-create-budget"),
        ], [{"kind": "established", "title": "Context", "items": [
            {"text": "Read-only for 90 days.", "record_type": "state", "record_id": "k-data", "detail": None},
            {"text": "Juniper's lease ends soon.", "record_type": "state", "record_id": "j-lease-end", "detail": None}]}]))
        events = list(stream_ask_events(conn, provider, "Is the pilot read-only?"))
        names = [name for name, _ in events]
        assert "delta" not in names
        claims = [payload for name, payload in events if name == "claim"]
        assert [c["status"] for c in claims] == ["shown", "withheld", "shown"]
        assert "95,000" not in json.dumps(claims)
        final = events[-1][1]["answer"]
        assert [c["claim"] for c in claims if c["status"] == "shown"] == final["claims"]
        assert names.index("claim") > names.index("preview")
        [section] = [payload for name, payload in events if name == "section"]
        assert section["withheld_items"] == 1 and [i["wording"] for i in section["section"]["items"]] == ["record_fallback"]
        assert "90 days" not in json.dumps(events[:-1]) and "Juniper" not in json.dumps(events)
        assert section["section"] in final["sections"]
    finally:
        conn.close()


def test_scanner_waits_for_the_selection_then_returns_claims_and_sections_as_they_complete():
    scanner = _StreamedAnswerScanner()
    text = json.dumps({"selection": {"job": "current_fact"}, "answer": {
        "job": "current_fact", "claims": [_claim("A [x]."), _claim("B.")],
        "sections": [{"kind": "other", "title": "T", "items": []}], "source_ids": ["claims"]}})
    cut = text.index('"answer"')
    assert scanner.feed(text[:cut - 3]) == [] and scanner.selection is None
    got = scanner.feed(text[cut - 3:cut + 40])
    assert scanner.selection == {"job": "current_fact"}
    for start in range(cut + 40, len(text), 5):
        got += scanner.feed(text[start:start + 5])
    assert [(kind, obj.get("text") or obj.get("title")) for kind, obj in got] == [("claim", "A [x]."), ("claim", "B."), ("section", "T")]


def test_a_refinement_rechecks_the_previous_claims_and_bullets_clear_them(tmp_path):
    conn = _seeded(tmp_path)
    try:
        first = run_ask(conn, _FakeAsk(_answer(
            [_claim("The pilot stays read-only.", "current_state", "k-data")],
            [{"kind": "established", "title": "Context", "items": [
                {"text": "Read-only pilot.", "record_type": "state", "record_id": "k-data", "detail": None}]}])),
            "Is the pilot read-only?")
        again = run_ask(conn, _FakeAsk(_answer([])), "shorten it", previous_answer=first["answer"])
        assert again["timing"]["pipeline"] == "deterministic_refinement"
        assert [c["text"] for c in again["answer"]["claims"]] == ["The pilot stays read-only."]
        bullets = run_ask(conn, _FakeAsk(_answer([])), "make this 3 bullets", previous_answer=first["answer"])
        assert bullets["answer"]["claims"] == [] and bullets["answer"]["summary"] == ""
        tampered = {**first["answer"], "headline": "Budget approved!", "summary": "Budget approved!",
                    "claims": [{**first["answer"]["claims"][0], "text": "Approved at $95,000.", "label": "Current State"}]}
        checked = run_ask(conn, _FakeAsk(_answer([])), "shorten it", previous_answer=tampered)["answer"]
        assert checked["claims"] == [] and checked["withheld_claims"] == 1 and checked["headline"] == DEFAULT_HEADLINE
    finally:
        conn.close()


def test_cache_key_names_the_answer_shape():
    """An answer cached in the older shape (headline + summary) must never be served after #567."""
    import inspect
    assert '"answer_shape": "claims-v2-citation-nudge"' in inspect.getsource(ask_cache_key)


def test_streamed_eval_transport_times_the_first_checked_content(tmp_path):
    from eval.quality_harness import _streamed_ask

    conn = _seeded(tmp_path)
    try:
        final, latency = _streamed_ask(conn, _FakeAsk(_answer([_claim("The pilot stays read-only.", "current_state", "k-data")])),
                                       "Is the pilot read-only?")
        assert latency["transport"] == "stream" and latency["first_content_ms"] is not None
        assert latency["first_content_ms"] <= latency["total_ms"]
        assert final["timing"]["first_validated_ms"] <= final["timing"]["total_ms"]
        assert [c["text"] for c in final["answer"]["claims"]] == ["The pilot stays read-only."]
    finally:
        conn.close()
