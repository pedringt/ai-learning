"""DEC-023 item 7: the absence-wording scorer, with hand-written answers. No model calls."""
from __future__ import annotations

from eval import absence_wording as aw


def _answer(*claims: str) -> dict:
    return {"headline": claims[0], "summary": " ".join(claims), "claims": [{"text": c} for c in claims], "sections": []}


ABSENT = next(c for c in aw.CASES if c.id == "ab3")
DENIAL = next(c for c in aw.CASES if c.id == "dn1")
MISSED = next(c for c in aw.CASES if c.id == "nr2")


def test_record_first_absence_passes():
    assert aw.score(ABSENT, _answer("State has no recorded budget for a Japan expansion."), "")["passed"]


def test_world_denial_and_invented_numbers_fail():
    denial = aw.score(DENIAL, _answer("No, Security has not approved the Frankfurt move."), "")
    assert not denial["passed"] and denial["world_denials"]
    invented = aw.score(ABSENT, _answer("State has no recorded Japan budget; plan on about $250,000."), "")
    assert not invented["passed"] and invented["invented_numbers"]


def test_a_no_record_claim_for_a_record_outside_context_is_flagged():
    assert not aw.score(MISSED, _answer("State has no record of what Legal said about the DPA."), "")["passed"]


def test_absence_relative_to_what_ask_looked_at_is_not_a_false_claim():
    relative = aw.score(MISSED, _answer("The records I looked at don't show what Legal said about the DPA."), "")
    assert relative["passed"] and relative["says_relative_absence"]
    assert aw.score(ABSENT, _answer("I couldn't find a Japan expansion budget in the records I looked at."), "")["passed"]


def test_every_not_retrieved_answer_is_really_outside_todays_context(tmp_path):
    from ask_service import _compact_candidates, _trim_candidates_for_query
    from eval import context_size_experiment as cse
    with cse._connection() as connection:
        full = _compact_candidates(connection)
        for case in (c for c in aw.CASES if c.kind == "not_retrieved"):
            in_context = {r["id"] for v in _trim_candidates_for_query(case.question, full).values() for r in v}
            assert not set(case.answer_ids) & in_context, case.id
            assert set(case.answer_ids) <= {r["id"] for v in full.values() for r in v}, case.id   # it does exist
