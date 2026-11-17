"""#708: a comma right after a figure ends a clause; only a thousands separator doesn't.

The shared rule in ask_assertions used to keep any comma touching a digit inside the clause, so "…proposes $40,000,
Current State's pilot budget is approved." was read as one clause and the pending frame in the first half covered the
status claimed in the second: the approval went unnoticed by the check. A negation leaked the same way. No model calls.
"""
import pytest

from ask_assertions import _clauses, assertions


def _phrases(text):
    return [(a.kind, a.phrase) for a in assertions(text)]


@pytest.mark.parametrize("text", [
    "A pending Review proposes $40,000, Current State's pilot budget is approved.",
    "The limit is not $2,500, it is $5,000 and approved.",
    "A pending Review proposes 30 days, retention is approved.",
])
def test_a_status_after_a_figure_and_a_comma_is_its_own_clause(text):
    assert ("status", "approved") in _phrases(text)


@pytest.mark.parametrize("text,parts", [
    ("Raise the limit to $40,000 for the pilot.", 1),
    ("The rollout covers 1,500 users in Tier 1.", 1),
    ("A pending Review proposes $40,000, but it has not been accepted.", 2),
    ("The budget is $40,000, and the Review is pending.", 2),
])
def test_thousands_separators_stay_inside_the_clause(text, parts):
    assert len(_clauses(text)) == parts


def test_a_pending_or_negated_figure_is_still_not_an_assertion():
    assert _phrases("A pending Review proposes raising the limit to $5,000, which has not been approved.") == []
    assert _phrases("The $40,000 budget is not approved.") == []


def test_a_date_keeps_its_meaning():
    assert _phrases("Approval is not recorded as of March 3, 2026.") == []
    assert ("status", "approved") in _phrases("The launch on March 3, 2026 is approved.")
