"""Regression coverage for the state.md #104/#105 follow-up pass (2026-09-13),
after the long discovery-note stress test found three real gaps in the first
Phase 1 pass:

1. A grouped operating policy (dashboard read-only + dual escalation
   sign-off) was dropped entirely in 3/5 raw live samples -- Evidence
   containing several distinct consequential items let a few salient
   recommendations stand in for the rest of the note.
2. An explicit Question answer (q-retention) was missed in 4/5 raw live
   samples -- resolves_question_ids wasn't reliably checked against every
   open Question shown to the model.
3. Ask answered "has the pilot launch date been decided?" as though no
   relevant records existed at all, even though an open Review proposed
   exactly that -- the grounding rules only described Reviews as relevant
   when they challenge an already-selected Current State record, never as
   the sole record answering a request Current State is silent on.

These are prompt-instruction fixes (consequentiality_guidance.py and
ask_service.py's _grounding_rules()), so the tests below pin the instruction
text -- following the same convention as
test_ask_pending_review_authority.py's confirmed/resolved-language tests --
rather than asserting live model compliance, which the live scripts
(qa_raw_provider_diagnosis.py, qa_long_discovery_note_ask_check.py) exist to
sample directly. They cannot prove the model complies, only that the
instruction is still present and hasn't been silently dropped or weakened.
"""
from __future__ import annotations

import sqlite3

from anthropic_provider import AnthropicProvider
from ask_contract import AskSelection
from ask_provider import _filter_candidate_payload
from ask_service import _grounding_rules, _one_call_prompt, _selector_prompt, _synthesis_prompt
from consequentiality_guidance import CONSEQUENTIALITY_AND_GROUPING_GUIDANCE
from database_migration_backed import get_test_db
from interpretation_runtime.validation.semantic_validation import InterpretationContextSnapshot
from openai_provider import OpenAIProvider

_CANDIDATES = {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}


def _empty_context_connection():
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    return db_context, connection


# --- Interpretation side: completeness scan + Question-linking checklist ---

def test_consequentiality_guidance_instructs_a_paragraph_by_paragraph_completeness_scan():
    assert "re-scan the Evidence paragraph by paragraph" in CONSEQUENTIALITY_AND_GROUPING_GUIDANCE
    assert "do not stop early" in CONSEQUENTIALITY_AND_GROUPING_GUIDANCE


def test_consequentiality_guidance_instructs_checking_every_open_question_before_finalizing():
    assert "check each open Question shown above against this Evidence" in CONSEQUENTIALITY_AND_GROUPING_GUIDANCE
    assert "resolves_question_ids" in CONSEQUENTIALITY_AND_GROUPING_GUIDANCE


def test_anthropic_prompt_contains_the_completeness_and_question_check_instructions():
    db_context, connection = _empty_context_connection()
    try:
        built = AnthropicProvider(model_identifier="test", api_key="test")._build_prompt(
            InterpretationContextSnapshot(state_items={}, open_reviews={}),
            {"id": "e1", "content": "x"},
            connection,
        )
    finally:
        connection.close()
        db_context.__exit__(None, None, None)
    assert "re-scan the Evidence paragraph by paragraph" in built
    assert "check each open Question shown above against this Evidence" in built


def test_openai_prompt_contains_the_completeness_and_question_check_instructions():
    db_context, connection = _empty_context_connection()
    try:
        built = OpenAIProvider(api_key="test")._build_prompt(
            InterpretationContextSnapshot(state_items={}, open_reviews={}),
            {"id": "e1", "content": "x"},
            connection,
        )
    finally:
        connection.close()
        db_context.__exit__(None, None, None)
    assert "re-scan the Evidence paragraph by paragraph" in built
    assert "check each open Question shown above against this Evidence" in built


# --- Ask side: a silent Current State topic must not hide a relevant Review

def test_grounding_rules_require_surfacing_a_review_when_state_is_silent():
    rules = _grounding_rules()
    assert "Current State having no entry on a topic is not evidence that nothing relevant exists" in rules
    assert "never report no relevant records exist merely because Current State itself is silent" in rules


def test_one_call_prompt_carries_the_silent_state_rule():
    prompt = _one_call_prompt("Has the pilot launch date been decided?", _CANDIDATES, None)
    assert "Current State having no entry on a topic is not evidence that nothing relevant exists" in prompt


def test_selector_prompt_carries_the_silent_state_rule():
    prompt = _selector_prompt("Has the pilot launch date been decided?", _CANDIDATES, None)
    assert "Current State having no entry on a topic is not evidence that nothing relevant exists" in prompt


def test_synthesis_prompt_carries_the_silent_state_rule():
    selection = AskSelection(
        job="current_fact", state_ids=[], review_ids=[], blocking_question_ids=[],
        question_ids=[], history_ids=[], evidence_ids=[],
    )
    context = {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}
    prompt = _synthesis_prompt("Has the pilot launch date been decided?", selection, context, None)
    assert "Current State having no entry on a topic is not evidence that nothing relevant exists" in prompt


# --- Root cause found live: a mechanical retrieval filter, not a model gap ---
# _filter_candidate_payload's strict "date" anchor lookup only matched the
# literal token "date" in a record's text -- a Review that names an actual
# date ("committed for November 3rd") never contains that word, so it was
# silently removed from candidates before the model ever saw it. No amount of
# Ask prompt wording could have fixed this: the record was gone by the time
# the prompt was built. See ask_provider.py's _record_mentions_a_date_value.

def test_date_lookup_keeps_a_review_that_names_a_date_without_the_word_date():
    payload = {
        "reviews": [{
            "id": "review_launch",
            "decision_question": "Pilot launch is committed for November 3rd.",
            "why_consequential": "Launch readiness moves from planning-contingent to calendar-committed.",
        }],
        "state": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    result = _filter_candidate_payload("Has the pilot launch date been decided?", payload)
    assert [r["id"] for r in result["reviews"]] == ["review_launch"]


def test_date_lookup_still_drops_an_unrelated_bystander_record():
    payload = {
        "reviews": [{
            "id": "review_unrelated",
            "decision_question": "Should the vendor's no-training-data claim remain trusted?",
            "why_consequential": "Legal flagged a contract risk.",
        }],
        "state": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    result = _filter_candidate_payload("Has the pilot launch date been decided?", payload)
    assert result["reviews"] == []


def test_date_lookup_still_keeps_a_record_matching_the_literal_word_date():
    payload = {
        "reviews": [{
            "id": "review_literal_date",
            "decision_question": "Should the launch date field be set to Q4?",
            "why_consequential": "A concrete date has not been recorded yet.",
        }],
        "state": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    result = _filter_candidate_payload("Has the pilot launch date been decided?", payload)
    assert [r["id"] for r in result["reviews"]] == ["review_literal_date"]
