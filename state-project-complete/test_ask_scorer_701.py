"""#701 scorer wording (Paige, Nov 16): ask_unknown_stays_unknown's required facts already accept "has no established"
and "does not have a confirmed"; the uncertainty list now does too. Deterministic: no model calls."""
from eval.quality_harness import _expresses_uncertainty, _normalize


def test_the_unknown_scenarios_accepted_wording_expresses_uncertainty():
    # The one miss in about 165 answers (Nov 16): correct, but the uncertainty list lacked both phrasings.
    for text in ("State has no established safe autonomous-resolution percentage.",
                 "State does not have a confirmed figure for safe autonomous resolution."):
        assert _expresses_uncertainty(_normalize(text)), text


def test_a_plain_figure_still_does_not_express_uncertainty():
    assert not _expresses_uncertainty(_normalize("The safe autonomous-resolution percentage is 40%."))
