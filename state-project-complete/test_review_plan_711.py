"""#711 (Paige, Nov 18: "Record the plan"): an agreed future change gets a Review that records the agreement as planned
and not yet done, as its own Current State item, leaving the existing fact as it is.

Deterministic: these score hand-written outcomes of `review_planned_action_not_stated_as_done`; no model calls. The
passing proposal text is a real Haiku 5.5 output from eval matrix run 44352443141 (Nov 18).
"""
from pathlib import Path

import pytest

from eval.quality_harness import ReviewQualityResult
from eval.review_interpretation_scenarios import SCENARIOS

SCENARIO = next(s for s in SCENARIOS if s.id == "review_planned_action_not_stated_as_done")
PLAN = "The team agreed to revise the evaluation criteria and sample definition together before the next test round; no revision has been made yet."


def _result(action, text="", rows="", review=True):
    return ReviewQualityResult(scenario=SCENARIO, review_recommended=review, observed_action=action,
                               processing_status="succeeded", proposed_state_text=text, proposal_rows=rows)


def test_recording_the_plan_beside_the_existing_fact_passes():
    result = _result("update_state", PLAN, "create target=None status=pending supersedes=None | affected: ")
    assert result.passed, result.interpretation_problems


@pytest.mark.parametrize("result,why", [
    (_result("preserve_evidence_only", review=False), "no Review: the decision never reaches a person"),
    (_result("state_at_risk", rows=" | affected: quality-state-0"), "a 'may change' warning loses the decision"),
    (_result("open_question"), "a Question about whether it happened loses the decision"),
    (_result("update_state", "Evaluation uses the Q2 sample split and fixed criteria; the team agreed to revise both "
                             "before the next test round, not yet done.",
             "update target=quality-state-0 status=pending supersedes=None | affected: quality-state-0"),
     "rewrites the existing fact instead of recording the plan beside it"),
    (_result("update_state", "The evaluation criteria were revised together for the next test round.",
             "create target=None status=pending supersedes=None | affected: "), "states the plan as done"),
    (_result("update_state", "Evaluation criteria and sample definition are planned to be revised together.",
             "create target=None status=pending supersedes=None | affected: "), "doesn't say it hasn't happened yet"),
])
def test_anything_else_fails(result, why):
    assert not result.passed, why


def test_the_intake_instructions_carry_the_rule():
    source = (Path(__file__).resolve().parent / "anthropic_provider.py").read_text()
    assert "planned != committed" in source                                   # the #480 epistemic rule stays
    assert "raise it though State is still accurate" in source                # #711: still accurate is no reason to stay silent
    assert "missing_understanding create, agreed, not yet done; never edit the existing item" in source
    # Run 44369067949: without this contrast, "leadership asked whether…" became an at-risk flag 13/30 times.
    assert "Asked/considered only: open_question; opinion isn't a decision" in source
