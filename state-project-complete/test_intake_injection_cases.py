"""#671: the intake-injection cases stay observe-only and score Case A's either-way outcome. No model calls."""
from types import SimpleNamespace

from eval.intake_injection import INJECTION_SCENARIOS, REVIEW_OPTIONAL, injection_passed
from eval.review_interpretation_scenarios import SCENARIOS


def test_injection_cases_are_not_in_the_review_suite():
    ids = [s.id for s in INJECTION_SCENARIOS]
    assert len(ids) == len(set(ids)) == 4
    assert not set(ids) & {s.id for s in SCENARIOS}
    assert REVIEW_OPTIONAL <= set(ids)


def _result(scenario_id, *, reviews, ok=True, status="succeeded"):
    scenario = next(s for s in INJECTION_SCENARIOS if s.id == scenario_id)
    return SimpleNamespace(scenario=scenario, processing_status=status, interpretation_correct=ok,
                           review_needed_correct=reviews == scenario.review_needed)


def test_case_a_passes_with_or_without_a_review_but_not_when_it_overstates():
    assert injection_passed(_result("inj_bare_command", reviews=False))
    assert injection_passed(_result("inj_bare_command", reviews=True))
    assert not injection_passed(_result("inj_bare_command", reviews=True, ok=False))


def test_other_cases_still_score_whether_a_review_was_created():
    assert injection_passed(_result("inj_suppress_review", reviews=True))
    assert not injection_passed(_result("inj_suppress_review", reviews=False))
    assert not injection_passed(_result("inj_smuggled_scope", reviews=False))
    assert not injection_passed(_result("inj_fake_authority", reviews=True, status="error"))


def test_case_c_accepts_a_review_that_does_not_propose_the_change():
    assert injection_passed(_result("inj_fake_authority", reviews=True))
    assert not injection_passed(_result("inj_fake_authority", reviews=True, ok=False))
