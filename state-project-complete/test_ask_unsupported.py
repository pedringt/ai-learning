"""#703 / #704 (Paige, Nov 16): an Ask answer never gives a freshness verdict on Current State (the model has no
confirmation data), and never says no record covers something a record in the project covers, whether retrieval sent
that record or not. Paraphrases that must be withheld, near misses that must be shown, and the record-first denials
other evals depend on (#701 scope). No model calls: scripted answers through the real run_ask and stream paths."""
from __future__ import annotations

import json
from copy import deepcopy

import pytest

import ask_service
from ask_service import _compact_candidates, run_ask, stream_ask_events
from ask_unsupported import false_absence, freshness_verdict
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data

VIP_Q = "Is the VIP carve-out out of date?"


@pytest.fixture
def northstar(tmp_path):
    conn = connect(f"sqlite://{tmp_path / 'northstar.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    conn.project_id = "northstar"
    yield conn
    conn.close()


@pytest.fixture
def project(northstar):
    return _compact_candidates(northstar)


# --- #703: freshness verdicts ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("text", [
    "The VIP exception was confirmed recently, so the exception is not stale in Current State.",   # prod, Nov 16
    "…so the exception is not yet stale in Current State.",
    "The VIP exception is stale.",
    "The escalation path is up to date.",
    "The escalation path is up-to-date.",
    "Nothing in Current State is outdated.",
    "The VIP carve-out is out of date.",
    "The VIP exception is still current.",
    "The VIP exception doesn't need a re-check.",
    "Current State says the VIP exception is up to date.",          # Current State holds no freshness verdict to report
    "Finance confirmed it, so the VIP exception is not stale in Current State.",
    "The escalation path needs a recheck.",
])
def test_a_freshness_verdict_on_current_state_is_recognised(text):
    assert freshness_verdict(text, about_state=True)


@pytest.mark.parametrize("text,about_state", [
    ("The records I looked at don't show whether the VIP exception is stale.", True),   # an open question, no verdict
    ("Ask the owner if the escalation path is out of date.", True),
    ("The vendor notice says the help article is outdated.", False),                    # content of an Evidence note
    ("VIP accounts continue through manual support workflows.", True),
    ("The VIP exception is not yet stale in the vendor's list.", False),                  # not about Current State
    # Nov 16 replay (adv_number_mismatch_state_vs_review): a freshness word reported from a pending Review is the
    # Review's argument, not Ask's verdict.
    ("A pending Finance review proposes that the limit should be $5,000, saying the $2,500 figure is outdated; this "
     "has not been accepted into Current State, which still sets the limit at $2,500.", True),
    ("Current State sets the limit at $2,500; a pending Finance review is arguing the $2,500 figure is outdated.", True),
    ("A Finance review treats the $2,500 figure as outdated, but it has not been accepted into Current State.", True),
    ("Finance says the $2,500 figure is outdated; Current State still sets the limit at $2,500.", True),
])
def test_wording_that_is_not_a_freshness_verdict_on_current_state_is_left_alone(text, about_state):
    assert freshness_verdict(text, about_state=about_state) is None


# --- #704: existence absence ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("text,query", [
    ("The records I looked at don't show whether the VIP carve-out is out of date, and no Current State record covers it.",
     VIP_Q),                                                                                       # prod API, Nov 16
    ("The records I looked at don't show whether the VIP carve-out is out of date: there is no Current State entry, "
     "Review, or Question about the VIP carve-out among the supplied records.", VIP_Q),            # prod drawer
    ("No Current State record mentions the VIP exception.", ""),
    ("No Current State item covers the VIP carve-out.", ""),
    ("There is no Review about retiring the VIP carve-out.", ""),
    ("None of the records cover the escalation path.", ""),
    ("No record addresses the VIP exception.", ""),
])
def test_a_claim_that_no_record_covers_an_existing_subject_is_caught(project, text, query):
    assert false_absence(text, project, query)


@pytest.mark.parametrize("text", [
    # #701 scope (Nov 16): record-first denials describe the record they're about, and other evals rely on them.
    "State has no established safe autonomous-resolution percentage.",                      # ask_unknown_stays_unknown
    "State has no recorded leadership decision to remove human review.",                    # ask_pending_review_not_truth
    "The records I looked at don't show that retention is resolved.",                       # the premise correction
    "State has no confirmed pilot budget, and the budget Review is still pending.",          # compound budget answers
    "No record establishes that the VIP exception was retired.",
    "No record confirms who owns the escalation path.",
    "I couldn't find a record of a VIP retirement decision in the records I looked at.",
    "State has no record of a signed vendor contract.",
    # Existence claims that are true.
    "No Current State record covers the cafeteria pet policy.",
    "No Current State record covers the pilot budget.",        # "pilot" alone is in most records: not distinctive
])
def test_record_first_denials_and_true_absences_are_left_alone(project, text):
    assert false_absence(text, project, "") is None


# --- through run_ask and the stream ---------------------------------------------------------------------------------

SELECTION = {"job": "current_fact", "state_ids": ["k-vip"], "review_ids": [], "blocking_question_ids": [],
             "question_ids": [], "history_ids": [], "evidence_ids": [], "answered_question_ids": []}


class Scripted:
    def __init__(self, claims, selection=SELECTION):
        self.selection = selection
        self.answer = {"job": "current_fact", "claims": claims, "sections": [], "source_ids": [], "uncertainty_ids": [],
                       "suggested_refinements": [], "suggested_question": None}

    def select(self, prompt):
        return deepcopy(self.selection)

    def synthesize(self, prompt):
        return deepcopy(self.answer)

    def stream(self, prompt):
        text = json.dumps({"selection": self.selection, "answer": self.answer})
        for start in range(0, len(text), 41):
            yield text[start:start + 41]


GROUNDED = {"text": "VIP and other specially handled accounts continue through manual support workflows.",
            "basis": "current_state", "primary_record_id": "k-vip", "supporting_record_ids": []}


def _shown(result):
    return [c["text"] for c in result["answer"]["claims"]]


def _streamed(conn, provider, query):
    return dict(stream_ask_events(conn, provider, query))["final"]


@pytest.mark.parametrize("bad", [
    {"text": "The VIP exception is not stale in Current State.", "basis": "current_state", "primary_record_id": "k-vip",
     "supporting_record_ids": []},
    {"text": "Nothing in Current State is out of date.", "basis": "none", "primary_record_id": None,
     "supporting_record_ids": []},
])
def test_a_freshness_verdict_is_withheld_with_the_existing_line(northstar, bad):
    # A wording the software route doesn't catch, so the scripted model answers it.
    query = "Can we still rely on the VIP exception?"
    for result in (run_ask(northstar, Scripted([GROUNDED, bad]), query), _streamed(northstar, Scripted([GROUNDED, bad]), query)):
        assert _shown(result) == [GROUNDED["text"]]
        assert result["answer"]["withheld_claims"] == 1
        assert result["answer"]["withheld_kinds"] == {"other": 1}         # the existing line, no new wording


def test_a_false_absence_is_withheld_when_the_model_was_sent_the_record(northstar):
    bad = {"text": "The records I looked at don't show whether the VIP carve-out is out of date, and no Current State "
                   "record covers it.", "basis": "none", "primary_record_id": None, "supporting_record_ids": []}
    query = "Does the VIP carve-out still hold?"
    for result in (run_ask(northstar, Scripted([GROUNDED, bad]), query), _streamed(northstar, Scripted([GROUNDED, bad]), query)):
        assert _shown(result) == [GROUNDED["text"]] and result["answer"]["withheld_claims"] == 1


def test_a_false_absence_is_withheld_when_retrieval_cut_the_record(northstar, monkeypatch):
    """Paige's rule: a failure to retrieve never becomes evidence that something doesn't exist."""
    trim = ask_service._trim_candidates_for_query

    def cut(query, candidates):
        kept = trim(query, candidates)
        return {k: [r for r in v if r["id"] not in {"k-vip", "demo-review-retire-vip"}] for k, v in kept.items()}

    monkeypatch.setattr(ask_service, "_trim_candidates_for_query", cut)
    bad = {"text": "No Current State record covers the VIP carve-out.", "basis": "none", "primary_record_id": None,
           "supporting_record_ids": []}
    kept = {"text": "No record establishes that the VIP carve-out was retired.", "basis": "none",
            "primary_record_id": None, "supporting_record_ids": []}
    selection = {**SELECTION, "state_ids": []}
    result = run_ask(northstar, Scripted([kept, bad], selection), "Does the VIP carve-out still hold?")
    assert _shown(result) == [kept["text"]] and result["answer"]["withheld_claims"] == 1


def test_a_true_absence_and_a_record_first_denial_are_shown(northstar):
    claims = [{"text": "No Current State record covers the cafeteria pet policy.", "basis": "none",
               "primary_record_id": None, "supporting_record_ids": []},
              {"text": "State has no recorded leadership decision to remove human review.", "basis": "none",
               "primary_record_id": None, "supporting_record_ids": []}]
    result = run_ask(northstar, Scripted(claims, {**SELECTION, "state_ids": []}), "Is there a pet policy?")
    assert _shown(result) == [c["text"] for c in claims] and result["answer"]["withheld_claims"] == 0
