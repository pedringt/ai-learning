"""#701 candidate V3: a claim citing a Review may take a number from the Evidence that Review links to (evidence_ids),
when that Evidence is among the answer's records. Deterministic: no model calls."""
from ask_claims import ClaimChecker

EVIDENCE = {"id": "e-ret", "content": "Legal confirmed vendor retention is 30 days for pilot prompts and outputs."}
OTHER = {"id": "e-other", "content": "The vendor offers 90-day archives."}
REVIEW = {"id": "r-ret", "decision_question": "Are the vendor's stated retention terms authoritative enough?",
          "evidence_ids": ["e-ret"]}
QUESTION = {"id": "q-ret", "text": "What retention terms apply?", "blocking": True}
CORRECTION = {"text": "The premise is not correct: retention is not resolved. Legal's reported 30-day retention is pending review.",
              "basis": "none", "primary_record_id": None, "supporting_record_ids": ["r-ret", "q-ret"]}


def _checker(evidence):
    return ClaimChecker({"reviews": [REVIEW], "questions": [QUESTION], "evidence": evidence})


def test_a_cited_reviews_linked_evidence_supplies_the_figure():
    assert _checker([EVIDENCE, OTHER]).check_claim(CORRECTION) == ""


def test_the_linked_evidence_must_be_selected():
    assert _checker([OTHER]).check_claim(CORRECTION) is None


def test_evidence_the_review_does_not_link_still_cannot_supply_a_figure():
    claim = dict(CORRECTION, text="Retention is not resolved; the vendor offers 90-day archives.")
    assert _checker([EVIDENCE, OTHER]).check_claim(claim) is None


def test_a_pending_review_claim_may_use_its_own_evidence_figure():
    claim = {"text": "A pending Review proposes 30-day retention.", "basis": "pending_review",
             "primary_record_id": "r-ret", "supporting_record_ids": []}
    assert _checker([EVIDENCE]).check_claim(claim) == "Needs review"


# #701 candidate V4: a claim may cite a record the model was shown but did not select.
STATE = {"id": "k-slack", "topic": "sources", "statement": "Slack is approved as an evidence source starting next sprint."}
PENDING = {"id": "r-other", "decision_question": "Should the budget cap be $60,000?", "evidence_ids": []}


def test_v4_a_shown_but_unselected_current_state_record_can_be_cited():
    claim = {"text": "Current State now says Slack is approved as an evidence source starting next sprint.",
             "basis": "current_state", "primary_record_id": "k-slack", "supporting_record_ids": []}
    shown = {"state": [STATE], "reviews": [], "questions": [], "evidence": []}
    assert ClaimChecker({"state": []}, shown=shown).check_claim(claim) == "Current State"
    assert ClaimChecker({"state": []}).check_claim(claim) is None          # without V4: withheld


def test_v4_type_still_matters_and_ids_must_have_been_shown():
    as_state = {"text": "The budget cap is $60,000.", "basis": "current_state", "primary_record_id": "r-other",
                "supporting_record_ids": []}
    shown = {"state": [], "reviews": [PENDING], "questions": [], "evidence": []}
    assert ClaimChecker({"state": []}, shown=shown).check_claim(as_state) is None     # a Review is not Current State
    unknown = dict(as_state, basis="pending_review", primary_record_id="r-never-shown")
    assert ClaimChecker({"state": []}, shown=shown).check_claim(unknown) is None


def test_v4_never_widens_a_none_claims_open_sources():
    claim = {"text": "State has no record of a $60,000 cap.", "basis": "none", "primary_record_id": None,
             "supporting_record_ids": []}
    shown = {"state": [], "reviews": [PENDING], "questions": [], "evidence": []}
    assert ClaimChecker({"state": [STATE]}, shown=shown).check_claim(claim) is None
