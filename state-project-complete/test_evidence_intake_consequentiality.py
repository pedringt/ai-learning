"""Golden-scenario regression suite for process_evidence()'s consequentiality
judgment: does the model correctly decide when Evidence must reach a human
Review, versus when it's safe to silently return no_review?

Found via a real miss: the Note "VP says we can move forward on auto
drafting billing quesitons" (typo verbatim, as submitted through the UI) was
sent as Evidence against a Current State that explicitly excludes billing
actions from the pilot's first implementation -- and process_evidence()
returned no review recommendations at all. See test_vp_billing_note_is_a_
regression_case_and_must_reach_review below for the exact repro.

This suite exercises the REAL provider, not FakeProvider(GOLDEN_OUTPUTS) --
the question here is model judgment quality, which a scripted fake cannot
tell you anything about. Every test therefore requires a live
ANTHROPIC_API_KEY and skips cleanly without one, matching the existing
convention in test_live_providers.py. That also means this suite never runs
in CI (no provider secrets configured there) -- run it locally with your own
key to get a real signal, or read it via the deployed Deep QA scenario added
alongside it (see qa/deployed/state-deep-qa.spec.js).

The assertion in every case is on review_recommended (did at least one
review_recommendation come back, i.e. NOT a silent no_review), never on the
exact review_type -- proposed_update vs state_at_risk vs missing_understanding
is the model's call to make per-scenario, and pinning it here would be
overfitting to one plausible classification among several reasonable ones.
"""
from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, "interpretation_runtime")

from anthropic_provider import AnthropicProvider
from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence

requires_anthropic_key = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set -- this suite tests real model judgment, "
    "not pipeline mechanics, so it cannot run against a scripted fake provider.",
)


class _DBContext:
    """Thin passthrough wrapper so callers can use `with` or hold the
    connection directly; mirrors the pattern already used in
    test_acceptance_workflow.py / test_live_providers.py."""

    def __init__(self, db_context, connection):
        self.db_context = db_context
        self._connection = connection

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __setattr__(self, name, value):
        if name in ("db_context", "_connection"):
            super().__setattr__(name, value)
        else:
            setattr(self._connection, name, value)


def _seeded_connection(state_items, questions=()):
    """state_items: dict of id -> (topic, statement). questions: iterable of
    (id, text, blocking) for open Questions to include in context."""
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    for state_id, (topic, statement) in state_items.items():
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, 1),
        )
    for qid, text, blocking in questions:
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', ?)",
            (qid, text, 1 if blocking else 0),
        )
    connection.commit()
    return _DBContext(db_context, connection)


def _process(content, state_items, questions=()):
    conn = _seeded_connection(state_items, questions)
    try:
        conn.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            ("e-scenario", content),
        )
        conn.commit()
        result = process_evidence(conn, evidence_id="e-scenario", provider=AnthropicProvider())
        assert result.processing_status == "succeeded", (
            f"Pipeline itself failed (schema/semantic/provider error), not a judgment question: "
            f"{result.processing_status}"
        )
        return result
    finally:
        conn.db_context.__exit__(None, None, None)


# --- The regression case -----------------------------------------------

@requires_anthropic_key
def test_vp_billing_note_is_a_regression_case_and_must_reach_review():
    """The exact real-world miss. Current State explicitly carves billing
    actions out of the pilot's first implementation; a VP's note about
    moving forward on auto-drafting billing sits close enough to that
    boundary, informally-worded and ambiguous enough (is "drafting" a reply
    an excluded "billing action" or not?), that it must not be silently
    absorbed as no_review. Whichever way the model reads it, the ambiguity
    itself -- combined with an authority figure describing a new
    capability -- is the thing that has to reach a human."""
    result = _process(
        "VP says we can move forward on auto drafting billing quesitons",
        {
            "k-sensitive": (
                "scope",
                "Billing adjustments, ownership changes, refunds, and other sensitive "
                "account actions remain outside the assistant's first implementation.",
            ),
            "k-pilot": (
                "product",
                "The first pilot is focused on basic troubleshooting questions. AI writes "
                "suggested answers using available information; a support rep reviews "
                "before anything customer-facing is sent.",
            ),
        },
    )
    assert len(result.review_ids) > 0, (
        "This is the exact regression: real production returned no review "
        "recommendations for this Evidence against this Current State."
    )


# --- Neighboring consequential cases (should all reach review) ----------

@requires_anthropic_key
def test_new_capability_approval_reaches_review():
    """A clean analogue of the regression case: an authority approves a new
    capability that Current State doesn't yet reflect."""
    result = _process(
        "Security approved extending the automation pilot to account-lockout "
        "tickets, not just password resets, starting next sprint.",
        {
            "k-password": (
                "automation",
                "Password-reset tickets are approved for automation, but approval does "
                "not by itself establish that automation has been implemented or deployed.",
            ),
        },
    )
    assert len(result.review_ids) > 0


@requires_anthropic_key
def test_direct_contradiction_of_existing_state_reaches_review():
    """Evidence that flatly reverses what Current State says happened."""
    result = _process(
        "Security paused all password-reset automation this morning after a "
        "false-positive incident; it is not approved right now.",
        {
            "k-password": (
                "automation",
                "Password-reset tickets are approved for automation, but approval does "
                "not by itself establish that automation has been implemented or deployed.",
            ),
        },
    )
    assert len(result.review_ids) > 0


@requires_anthropic_key
def test_reversed_leadership_decision_reaches_review():
    """A decision Current State treats as unresolved gets reported as
    resolved, in the opposite direction from where it stood."""
    result = _process(
        "Leadership decided against the 50% automation target discussed "
        "earlier; they now want the pilot to stay fully human-reviewed "
        "indefinitely, with no automation percentage pursued at all.",
        {
            "k-autonomy": (
                "automation",
                "Leadership has asked whether 50% autonomous resolution is achievable, "
                "but discovery has not established a safe automation percentage and the "
                "first implementation remains human-reviewed.",
            ),
        },
    )
    assert len(result.review_ids) > 0


@requires_anthropic_key
def test_state_at_risk_evidence_without_a_replacement_reaches_review():
    """Evidence that undermines confidence in existing State without itself
    establishing a replacement fact -- the state_at_risk case."""
    result = _process(
        "Legal flagged that the vendor's no-training-data claim may not "
        "hold under the actual enterprise contract language; they are "
        "still reviewing it and have not reached a conclusion.",
        {
            "k-vendor": (
                "security",
                "The vendor has confirmed customer content is not used to train the "
                "underlying model under the proposed enterprise terms.",
            ),
        },
    )
    assert len(result.review_ids) > 0


# --- Non-consequential noise (should NOT reach review) ------------------
# The point of this suite is catching silent no_review on real consequential
# evidence, not making State send everything to Review. These prove the fix
# (if one is needed) doesn't overcorrect into false positives.

@requires_anthropic_key
def test_pure_restatement_of_existing_state_does_not_reach_review():
    """Evidence that says nothing Current State doesn't already say."""
    result = _process(
        "Reminder for the team: password-reset tickets remain approved for "
        "automation, same as before. No changes here.",
        {
            "k-password": (
                "automation",
                "Password-reset tickets are approved for automation, but approval does "
                "not by itself establish that automation has been implemented or deployed.",
            ),
        },
    )
    assert len(result.review_ids) == 0, (
        f"Expected no_review for a pure restatement; got review_type(s): "
        f"{result.review_ids}"
    )


@requires_anthropic_key
def test_offtopic_chatter_does_not_reach_review():
    """Evidence with no material connection to any maintained State item."""
    result = _process(
        "Team lunch got moved to 12:30 today because the 12:00 slot in the "
        "big conference room was double-booked.",
        {
            "k-password": (
                "automation",
                "Password-reset tickets are approved for automation, but approval does "
                "not by itself establish that automation has been implemented or deployed.",
            ),
        },
    )
    assert len(result.review_ids) == 0


@requires_anthropic_key
def test_vague_observation_without_a_decision_does_not_reach_review():
    """Contrast case for the regression scenario: an observation about a
    topic, with no authority figure approving or deciding anything, should
    read differently from "VP says we can move forward on X"."""
    result = _process(
        "Support mentioned that billing-related questions come up often in "
        "the ticket queue -- just an observation from this week's volume.",
        {
            "k-sensitive": (
                "scope",
                "Billing adjustments, ownership changes, refunds, and other sensitive "
                "account actions remain outside the assistant's first implementation.",
            ),
        },
    )
    assert len(result.review_ids) == 0, (
        f"Expected no_review for a volume observation with no decision or approval "
        f"implied; got review_type(s): {result.review_ids}"
    )
