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
