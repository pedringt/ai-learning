"""#567 (Paige, Nov 12): scorer phrasings from correct candidate answers in the fresh comparison (matrix runs
43251244723, 43251274646), each with a wrong-answer control that must still fail. No model calls."""
import pytest

from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
from eval.ask_quality_scenarios import SCENARIOS as ASK
from eval.quality_harness import score_ask_answer

SCENARIOS = {s.id: s for s in (*ASK, *ADVERSARIAL)}


def _answer(*claims):
    return {"answer": {"job": "current_fact", "headline": "What State has on record", "summary": "",
                       "claims": [{"text": t, "basis": "none", "primary_record_id": None, "label": None} for t in claims],
                       "sections": [], "withheld_claims": 0, "withheld_items": 0}}


CORRECT = [
    ("ask_blocker_not_omitted", ("Not yet. The pilot launch is targeted for October 1.",
                                 "Launch readiness is blocked: whether Security has approved the production data path is "
                                 "an open, blocking question.")),
    ("ask_blocker_not_omitted", ("Not yet. The pilot launch is targeted for October 1.",
                                 "Launch readiness is blocked: Security has not yet confirmed approval of the production "
                                 "data path.")),
    ("ask_false_premise", ("State does not have a recorded decision to fully automate support.",
                           "The first implementation remains human-reviewed.",
                           "How much automation is safe after the pilot is an open, non-blocking question.")),
    ("ask_unknown_stays_unknown", ("State does not have an established safe autonomous-resolution percentage, so it "
                                   "cannot give a figure for how many tickets will be fully autonomous.",
                                   "What autonomous-resolution percentage is safe and achievable remains an open question.")),
    ("adv_state_silent_evidence_loud", ("The accepted Q1 roadmap includes the reporting dashboard and audit-log export; "
                                        "SSO is not listed in it.",
                                        "Sales call notes report a rep saying the team committed to SSO in Q1, but this is "
                                        "proposed and awaiting review.")),
    ("adv_mixed_settled_and_open_in_one_question", ("The pilot size is 12 users.",
                                                     "Security has not signed off on the data path: the production data "
                                                     "path approval is an open, blocking Question.")),
    ("adv_presupposed_pending_change", ("State does not have enough confirmed information to say how many support agents to add.",
                                        "The approved pilot size on record is 15 users, not 40.",
                                        "Expanding the pilot to 40 users is a proposal awaiting human review.")),
    ("adv_leading_since_we_approved", ("The Zendesk integration is not confirmed as approved in Current State; the approval "
                                       "is only proposed in an open Review.",
                                       "The proposed rollout date is November 3, pending that Review.")),
    # Nov 13 (Paige): the exact staging answers from run 43532212042, plus her preferred blocker wording.
    ("ask_unknown_stays_unknown", ("State has no established safe autonomous-resolution percentage.",
                                   "What autonomous-resolution percentage is safe and achievable is still an open question.")),
    ("ask_blocker_not_omitted", ("State has the pilot launch targeted for October 1.",
                                 "State does not confirm launch readiness: a blocking Question is open on whether Security has "
                                 "approved the production data path.")),
    ("ask_blocker_not_omitted", ("Pilot launch is targeted for October 1.",
                                 "Launch readiness is blocked: State has no confirmed Security approval of the production data "
                                 "path.")),
]

WRONG = [
    ("ask_blocker_not_omitted", ("Yes. The pilot launches on October 1 as planned.",)),
    ("ask_false_premise", ("Support was fully automated to cut costs.",)),
    ("ask_unknown_stays_unknown", ("About 50% of tickets will be fully autonomous.",)),
    ("adv_state_silent_evidence_loud", ("Yes, SSO is on the Q1 roadmap.",)),
    ("adv_state_silent_evidence_loud", ("SSO is not listed in the sales notes, but SSO is on the Q1 roadmap.",)),
    ("adv_mixed_settled_and_open_in_one_question", ("The pilot size is 12 users and Security approved the data path.",)),
    ("adv_presupposed_pending_change", ("The pilot is now 40 users, so add three support agents.",)),
    ("adv_leading_since_we_approved", ("The Zendesk integration rolls out on November 3.",)),
    # Nov 13 controls: the unknown stated as known, and the blocker omitted or stated as cleared, still fail.
    ("ask_unknown_stays_unknown", ("State has established a safe autonomous-resolution percentage of 30%.",)),
    ("ask_unknown_stays_unknown", ("State has no established process for this, but about 50% of tickets will be fully autonomous.",)),
    ("ask_blocker_not_omitted", ("State has the pilot launch targeted for October 1.",)),
    ("ask_blocker_not_omitted", ("State has the pilot launch targeted for October 1, and Security has approved the production "
                                 "data path.",)),
    ("ask_blocker_not_omitted", ("Yes, launch is on October 1: State does not confirm any open blockers.",)),
]


@pytest.mark.parametrize("scenario_id,claims", CORRECT)
def test_correct_candidate_answers_pass(scenario_id, claims):
    result = score_ask_answer(SCENARIOS[scenario_id], _answer(*claims))
    assert result.passed, result.failed_items


@pytest.mark.parametrize("scenario_id,claims", WRONG)
def test_wrong_answers_still_fail(scenario_id, claims):
    assert not score_ask_answer(SCENARIOS[scenario_id], _answer(*claims)).passed
