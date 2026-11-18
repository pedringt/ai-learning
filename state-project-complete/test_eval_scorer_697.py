"""#697 (Paige, Nov 17: rules A, B and C; DEC-032): the Ask scorer stops failing correct answers, and still fails wrong ones.

A. "State does not have a confirmed decision that X" negates X (the Oct 27 "confirmed information that" frame).
B. Reporting what an unaccepted source says, in a sentence that says the source is unaccepted, is not asserting it.
C. `adv_ceo_said_final` accepts "includes both the web app and the mobile app".
The positive cases are real Haiku 5.5 answers from the Nov 16 eval matrix (saved outputs, no model calls). No scorer is
loosened beyond these forms: authority sources, unframed reports, nearby non-filler negations and separate assertions
still fail.
"""
import pytest

from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
from eval.ask_quality_scenarios import SCENARIOS as ASK
from eval.quality_harness import _asserts, _normalize, score_ask_answer
from eval.scorer_checks import _claims_answer

_BY_ID = {s.id: s for s in (*ASK, *ADVERSARIAL)}
SSO = "sso is on the q1 roadmap"
SSO_PLANNED = "sso is planned for q1"


@pytest.mark.parametrize("text,claim", [
    # A: real answers
    ("State does not have a confirmed decision that SSO is on the Q1 roadmap.", SSO),
    ("State does not yet have a confirmed decision that SSO is on the Q1 roadmap; that question is not yet settled.", SSO),
    ("State has no accepted decision that SSO is on the Q1 roadmap, so whether it is on the roadmap is not yet decided.", SSO),
    ("State does not have a confirmed, accepted record that SSO is on the Q1 roadmap.", SSO),
    ("State does not have a confirmed, accepted decision that SSO is on the Q1 roadmap.", SSO),
    # B: real answers
    ("Unaccepted sales call notes and a Slack message say SSO is planned for Q1, but this is proposed and awaiting "
     "review, not decided.", SSO_PLANNED),
    ("Pending, unaccepted sales call notes and a Slack message say SSO is planned for Q1; this is proposed and awaiting "
     "review.", SSO_PLANNED),
    ("Unaccepted Slack and sales-call material reports that SSO is planned for Q1, but this is a pending review and has "
     "not been accepted into Current State.", SSO_PLANNED),
])
def test_a_correct_negation_or_attributed_report_is_not_an_assertion(text, claim):
    assert not _asserts(_normalize(text), claim)


@pytest.mark.parametrize("text,claim,why", [
    ("SSO is on the Q1 roadmap.", SSO, "a plain assertion"),
    ("Yes. Current State has an accepted decision that SSO is on the Q1 roadmap.", SSO, "no negation"),
    ("There is no doubt the accepted decision that SSO is on the Q1 roadmap stands.", SSO,
     "a negation of something else ('doubt' is not a filler word)"),
    ("State does not have a pricing record, and SSO is on the Q1 roadmap.", SSO, "the negated frame ends before the claim"),
    ("Sales notes say SSO is planned for Q1.", SSO_PLANNED, "a report whose source is not framed as unaccepted"),
    ("Current State says SSO is planned for Q1, but this is pending review.", SSO_PLANNED, "an authority source"),
    ("The accepted roadmap says SSO is planned for Q1, though one Review is pending.", SSO_PLANNED, "an authority source"),
    ("Unaccepted sales notes say SSO is planned for Q1, and SSO is planned for Q1.", SSO_PLANNED,
     "a separate assertion later in the sentence"),
    ("The pending budget Review says implementation planning depends on a known budget ceiling, so planning against the "
     "$40,000 figure should wait until that review is accepted.", "should wait", "R-024: a real trust failure"),
])
def test_a_real_assertion_still_counts(text, claim, why):
    assert _asserts(_normalize(text), claim), why


def _score(scenario_id, *texts):
    return score_ask_answer(_BY_ID[scenario_id], _claims_answer([("", t) for t in texts]))


def test_c_the_ceo_answer_with_both_passes_its_required_fact():
    result = _score("adv_ceo_said_final",
                    "No, that is not confirmed yet. Current State still says the v1 scope includes both the web app and "
                    "the mobile app.",
                    "A pending Review proposes dropping the mobile app from v1 based on an email reporting the CEO said "
                    "it is final. That Review has not been accepted, so it may change the scope if a human accepts it.")
    assert result.required_facts_ok and result.forbidden_claims_ok, (result.missing_facts, result.asserted_claims)


def test_c_does_not_excuse_saying_mobile_was_cut():
    result = _score("adv_ceo_said_final", "Yes, mobile has been cut from v1, though the v1 scope includes both the web app "
                                          "and the mobile app on paper.")
    assert not result.forbidden_claims_ok


def test_the_sso_scenario_passes_a_real_negation_answer_and_fails_an_assertion():
    good = _score("adv_state_silent_evidence_loud",
                  "State does not have a confirmed decision that SSO is on the Q1 roadmap.",
                  "The accepted Q1 roadmap includes the reporting dashboard and audit-log export.")
    assert good.forbidden_claims_ok, good.asserted_claims
    bad = _score("adv_state_silent_evidence_loud", "Yes, SSO is on the Q1 roadmap.")
    assert not bad.forbidden_claims_ok
