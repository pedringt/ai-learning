"""#567: one plain-text form of what an Ask answer displays, used for the compatibility summary, Copy and eval scoring."""
from __future__ import annotations

import json
import re
from pathlib import Path

from ask_display import RECORD_LABELS, SCOPE_NOTE, WITHHELD_LINE, answer_lead, displayed_text
from eval.ask_quality_scenarios import SCENARIOS as ASK_QUALITY_SCENARIOS
from eval.quality_harness import score_ask_answer

ASK_JS = Path(__file__).resolve().parent.parent / "implementation-context-prototype" / "context-ask.js"

CLAIMS_ANSWER = {
    "job": "current_fact",
    "headline": "What State has on record",
    "claims": [
        {"text": "The Q3 planning note says the pilot budget is approved at $40,000.", "label": "Project evidence"},
        {"text": "The pilot budget isn't in Current State yet.", "label": None},
    ],
    "withheld_claims": 1, "withheld_items": 0,
    "sections": [{"kind": "needs_review", "title": "Needs your review", "items": [
        {"text": "Record the $40,000 pilot budget?", "record_type": "review", "record_id": "r1", "detail": None},
        {"text": "Is Legal done?", "record_type": "blocking_question", "record_id": "q1", "detail": "Blocks: Launch"},
    ]}],
    "suggested_refinements": ["Shorten it"],
    "suggested_question": None,
}


def test_claims_answer_displays_labels_withheld_line_and_items():
    assert displayed_text(CLAIMS_ANSWER, include_footer=True).split("\n") == [
        "What State has on record",
        "[Project evidence] The Q3 planning note says the pilot budget is approved at $40,000.",
        "The pilot budget isn't in Current State yet.",
        WITHHELD_LINE,
        "Needs your review",
        "- [Needs review] Record the $40,000 pilot budget?",
        "- [Blocking] Is Legal done?",
        "  Blocks: Launch",
        "Shorten it",
        SCOPE_NOTE,
    ]


def test_older_answer_shape_shows_headline_and_summary():
    older = {"headline": "Pilot budget", "summary": "A Review proposes $40,000.", "sections": [], "suggested_refinements": []}
    assert displayed_text({"answer": older, "selection": {"job": "current_fact"}}) == "Pilot budget\nA Review proposes $40,000."


def test_lead_is_first_claim_when_claims_exist_and_headline_otherwise():
    assert answer_lead(CLAIMS_ANSWER).startswith("The Q3 planning note says")
    assert answer_lead({"headline": "No: not yet", "summary": "x"}) == "No: not yet"
    assert answer_lead({"headline": "What State has on record", "claims": [], "withheld_claims": 2}) == ""


def test_labels_match_the_ui_chips():
    source = ASK_JS.read_text()
    match = re.search(r"const labelFor=type=>\((\{.*?\})\[type\]", source)
    assert match, "labelFor not found in context-ask.js"
    js_labels = json.loads(re.sub(r"(\w+):", r'"\1":', match.group(1)).replace("'", '"'))
    assert js_labels == RECORD_LABELS
    assert SCOPE_NOTE in source


def test_scorer_reads_displayed_text_not_json_fields():
    """Words only in fields a person never reads (ids, the selection) must not satisfy a required fact."""
    scenario = next(s for s in ASK_QUALITY_SCENARIOS if s.id == "ask_question_answer_no_state_mutation")
    answer = {"headline": "Vendor contract", "summary": "The vendor contract remains under review. Retention is 30 days.",
              "sections": [], "suggested_refinements": [], "source_ids": ["answered", "resolved"]}
    result = score_ask_answer(scenario, {"answer": answer, "selection": {"job": "current_fact", "answered_question_ids": ["resolved"]}})
    assert "answered / resolved" in result.missing_facts
