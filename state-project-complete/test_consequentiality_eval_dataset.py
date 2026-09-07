"""Pytest-integrated wrapper around the labeled consequentiality eval set
(eval/scenarios.py, eval/harness.py). This is the "runnable evaluation
mechanism" the doc's Expected Deliverables ask for, wired into the normal
test suite so it can be run the same way as everything else.

Like test_evidence_intake_consequentiality.py, this exercises the REAL
AnthropicProvider (model judgment, not pipeline mechanics), so it requires
a live ANTHROPIC_API_KEY and skips cleanly without one -- it therefore
never runs in CI (no provider secrets configured there), same as every
other real-provider suite in this repo.

Only must_review/no_review scenarios are hard-asserted, one at a time, so
a failure points at the exact scenario rather than a lump "eval failed."
Ambiguous scenarios run (so a pipeline error there still surfaces) but are
never asserted on -- there is no single correct answer for them; see
eval/scenarios.py's module docstring.

For a human-readable report with precision/recall across the whole set,
run `python3 -m eval.run_eval` directly instead -- pytest's per-test
assertions don't provide a threshold/report this parametrization would just
duplicate.
"""
from __future__ import annotations

import os

import pytest

from eval.harness import run_scenario
from eval.scenarios import AMBIGUOUS, MUST_REVIEW, NO_REVIEW, SCENARIOS

requires_anthropic_key = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set -- this suite tests real model judgment, "
    "not pipeline mechanics, so it cannot run against a scripted fake provider.",
)

_scored_scenarios = [s for s in SCENARIOS if s.expected in (MUST_REVIEW, NO_REVIEW)]
_ambiguous_scenarios = [s for s in SCENARIOS if s.expected == AMBIGUOUS]


@requires_anthropic_key
@pytest.mark.parametrize("scenario", _scored_scenarios, ids=[s.id for s in _scored_scenarios])
def test_eval_scenario_matches_expected_judgment(scenario):
    result = run_scenario(scenario)
    assert result.processing_status == "succeeded", (
        f"Pipeline itself failed (schema/semantic/provider error), not a judgment "
        f"question: {result.processing_status} ({result.error})"
    )
    if scenario.expected == MUST_REVIEW:
        assert result.review_recommended, (
            f"Expected a review recommendation for [{scenario.category}] {scenario.id!r} "
            f"but process_evidence() returned no_review. {scenario.notes}"
        )
    else:
        assert not result.review_recommended, (
            f"Expected no_review for [{scenario.category}] {scenario.id!r} but "
            f"process_evidence() recommended a review. {scenario.notes}"
        )


@requires_anthropic_key
@pytest.mark.parametrize("scenario", _ambiguous_scenarios, ids=[s.id for s in _ambiguous_scenarios])
def test_eval_scenario_ambiguous_case_does_not_crash_the_pipeline(scenario):
    """Ambiguous scenarios have no single correct review/no_review answer
    (see eval/scenarios.py), so this only checks the pipeline itself
    succeeds -- not which way the model's judgment landed."""
    result = run_scenario(scenario)
    assert result.processing_status == "succeeded", (
        f"Pipeline itself failed on an ambiguous scenario: {scenario.id!r} "
        f"({result.error})"
    )
