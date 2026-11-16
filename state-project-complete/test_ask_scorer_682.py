"""#682 scorer wording (Paige, Nov 16): S1 authority phrases count only with "review", both in Ask's own claims; S2 uncertainty phrases.
The excluded phrases ("once accepted", "does not show") must still not count. Deterministic: no model calls."""
from ask_display import displayed_text
from eval.ask_quality_scenarios import SCENARIOS
from eval.quality_harness import _authority_ok, _expresses_uncertainty, _normalize


SCENARIO = next(s for s in SCENARIOS if s.id == "ask_pending_review_not_truth")
CARD = "Leadership asked whether low-risk cases can skip human review; no decision is recorded."


def _answer(*claims, card=CARD):
    sections = [{"kind": "needs_review", "title": "Needs your review",
                 "items": [{"text": card, "record_type": "review", "record_id": "ask-review-0"}]}] if card else []
    return {"answer": {"job": "current_fact", "headline": "What State has on record", "sections": sections,
                       "claims": [{"text": t, "basis": "pending_review", "primary_record_id": "ask-review-0",
                                   "supporting_record_ids": [], "label": "Needs review"} for t in claims]}}


def _authority(answer):
    return _authority_ok(SCENARIO, answer, _normalize(displayed_text(answer, labels=False)))


def test_s1_approved_wording_with_review_in_the_claims_satisfies_authority():
    for claim in ("Leadership's question is an open Review awaiting a decision, not an accepted change.",
                  "It is an open Review awaiting decision, not an accepted decision.",
                  "Whether low-risk cases can skip it is an open Review, not yet decided.",
                  "That Review is still open with no decision recorded.",
                  "That Review is still open; no decision is recorded."):
        assert _authority(_answer(claim)), claim


def test_s1_a_card_alone_cannot_satisfy_authority():
    assert not _authority(_answer("Leadership approved skipping human checks for low-risk cases."))


def test_s1_phrase_in_a_claim_with_review_only_in_a_card_does_not_count():
    assert not _authority(_answer("Leadership's question is awaiting a decision."))


def test_s1_once_accepted_is_excluded():
    assert not _authority(_answer("The open Review would settle this once accepted.", card=None))


def test_s2_record_first_denials_express_uncertainty():
    for text in ("State does not have confirmed launch readiness.",
                 "Launch readiness: a blocking Question is open on whether Security approved the data path."):
        assert _expresses_uncertainty(_normalize(text)), text


def test_s2_does_not_show_is_excluded():
    assert not _expresses_uncertainty(_normalize("State does not show launch readiness."))
