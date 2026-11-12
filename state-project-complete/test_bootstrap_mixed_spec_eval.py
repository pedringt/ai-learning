"""Targeted real-model eval for the bootstrap planning/spec failure found
2026-09-15.

A realistic planning document can contain settled product decisions,
tentative ideas, and explicit open questions at the same time. State must not
classify the whole source as unresolved merely because it uses design language
such as "should". In bootstrap mode we expect at least one proposed maintained
fact AND at least one proposed Question from the same Evidence.

This is intentionally a real-model test. Deterministic prompt-contract tests
prove the guidance is present; this test checks whether the model actually
makes the semantic distinction. It skips when ANTHROPIC_API_KEY is unavailable,
matching the rest of State's model-sensitive eval layer.
"""
from __future__ import annotations

import os

import pytest


from anthropic_provider import AnthropicProvider
from eval import mixed_spec_intake

requires_anthropic_key = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set -- this eval tests real model judgment.",
)


@requires_anthropic_key
def test_bootstrap_mixed_spec_preserves_settled_decisions_and_open_questions():
    # The source and the outcome classifier are shared with the repeated-run
    # measurement (#649, `python -m eval.run_mixed_spec_intake`), so a failure
    # here says which failure it was: the open item dropped, or stated as fact.
    run = mixed_spec_intake.run_once(AnthropicProvider())
    assert not run["failed"], f"Interpretation did not succeed: {run['processing_status']}"
    seen = (f"outcome={run['outcome']}; facts={run['facts']}; questions={run['questions']}; "
            f"review questions={run['review_questions']}")
    assert run["facts"] or run["questions"], (
        "Bootstrap mixed-spec Evidence was silently dropped instead of "
        f"producing Reviews for settled decisions and unresolved questions. {seen}"
    )
    assert run["facts"], (
        "The model treated a mixed planning/spec document as entirely "
        f"unresolved and failed to propose any settled baseline fact. {seen}"
    )
    assert run["questions"], (
        "The model proposed no Question for a genuine unresolved implementation "
        f"question. {seen}"
    )
