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
proposed content as settled fact. This asserts the strengthened, explicit
rule (added to _one_call_prompt, _synthesis_prompt, and the shared
_grounding_rules()) is actually present in the assembled prompt text --
a static guardrail against the instruction being silently dropped or
weakened in a future edit. It cannot prove the model complies (that needs
a live-provider eval), but it can prove the instruction is still there.
"""
from __future__ import annotations

from ask_contract import AskSelection
from ask_service import _grounding_rules, _one_call_prompt, _synthesis_prompt

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
