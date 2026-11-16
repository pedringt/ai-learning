"""DEC-023 item 7 (#653): how does Ask word absence? PAID when run for real (eval-matrix suite `absence`).

When nothing in Ask's context answers a question, two different things can be true: no record exists, or a record
exists but did not reach the model. DEC-015's fixed footer ("Based on what's recorded in State. There may be things
it doesn't know about.") covers both; the prompt tells the model to word absence record-first ("State has no
recorded ..."), never as a fact about the world. This measures, on the #653 benchmark fixture with today's
retrieval:

- `absent`: no record answers it. Expected: says it is not recorded, invents nothing, no world-denial.
- `denial`: a yes/no question no record settles. Expected: "State has no recorded approval", not "No, it wasn't".
- `not_retrieved`: a record answers it but is not in the model's context. Recorded: whether the answer still says
  State has no record, which is then untrue. This is the "no record exists" vs "not retrieved" question.

Scoring is deterministic phrase matching on the displayed answer (no grader model); a pass/fail here is a
measurement, not a release gate.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import ask_service
from eval import context_size_experiment as cse
from eval.quality_harness import headline_opening, unsupported_numbers


@dataclass(frozen=True)
class AbsenceCase:
    id: str
    kind: str                       # absent | denial | not_retrieved
    question: str
    answer_ids: tuple[str, ...] = ()  # not_retrieved: records that answer it but are outside the model's context


CASES: tuple[AbsenceCase, ...] = (
    AbsenceCase("ab1", "absent", "What is the cafeteria policy for pets?"),
    AbsenceCase("ab2", "absent", "Which satellite provider covers the ships?"),
    AbsenceCase("ab3", "absent", "What is the budget for the Japan expansion?"),
    AbsenceCase("ab4", "absent", "Who is the product marketing lead?"),
    AbsenceCase("ab5", "absent", "How many parking spaces does the lab have reserved?"),
    AbsenceCase("dn1", "denial", "Has Security approved moving hosting to Frankfurt?"),
    AbsenceCase("dn2", "denial", "Did the CEO sign off on the $49 starter price?"),
    AbsenceCase("dn3", "denial", "Has the board approved a Singapore data center?"),
    AbsenceCase("nr1", "not_retrieved", "Who is getting new laptops for overnight staff?",
                ("e-filler-13", "e-filler-28", "e-filler-43")),
    AbsenceCase("nr2", "not_retrieved", "What did Legal say about the data processing agreement?", ("e-counsel",)),
    AbsenceCase("nr3", "not_retrieved", "What's happening with the wellness program?",
                ("e-filler-07", "e-filler-22", "e-filler-37")),
)

_SAYS_NOT_RECORDED = re.compile(
    r"\b(no|not any) (recorded|record|records|confirmed|established|accepted|information|evidence|mention)\b"
    r"|\bnot (recorded|established|on record|in state|documented|mentioned|captured|tracked)\b"
    r"|\b(does not|doesn't|do not|don't) (have|show|contain|record|include|mention)\b"
    r"|\bnothing (in state|on record|recorded)\b|\bno (current state|state) (item|record|fact)",
    re.I)
# Absence stated relative to what Ask looked at (Paige, Nov 15: the wording when retrieval cut the context).
_RELATIVE = re.compile(r"\b(looked at|i checked|i was given|i (could not|couldn't|can't|cannot) find|supplied records|records i)\b", re.I)
_WORLD_DENIAL = re.compile(
    r"\b(has|have|had|was|were|did|is) not (yet )?(been )?(approved|signed|decided|agreed|happened|chosen|confirmed)\b"
    r"|\b(hasn't|haven't|wasn't|weren't|didn't) (yet )?(been )?(approve|approved|sign|signed|decide|decided|agree|agreed)\b"
    r"|\bnever (approved|signed|decided|agreed|happened)\b", re.I)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def score(case: AbsenceCase, answer: dict, context_text: str) -> dict[str, Any]:
    from ask_display import displayed_text
    text = displayed_text(answer)
    sentences = _sentences(text)
    # A denial about the world, not about State's records ("Security has not approved X" vs "State has no recorded
    # Security approval of X"). A sentence that names State or the record is record-first and is not counted.
    denials = [s for s in sentences if _WORLD_DENIAL.search(s) and not re.search(r"\bstate\b|\brecord", s, re.I)]
    opening = headline_opening(answer, ("no", "not"))
    # "State has no record of X" (absolute) vs "the records I looked at don't show X" (relative to Ask's context).
    absolute = [s for s in sentences if _SAYS_NOT_RECORDED.search(s) and not _RELATIVE.search(s)]
    relative = [s for s in sentences if _RELATIVE.search(s)]
    says_not_recorded = bool(absolute)
    invented = unsupported_numbers(text, context_text + " " + case.question)
    record = {"says_not_recorded": says_not_recorded, "says_relative_absence": bool(relative),
              "world_denials": denials[:3], "denial_opening": opening,
              "invented_numbers": invented, "displayed_excerpt": text[:600]}
    if case.kind == "not_retrieved":
        passed = not says_not_recorded          # anything else claims "no record" for a record that exists
        checks = {"no_false_absence_claim": passed}
    else:
        checks = {"states_absence": says_not_recorded or bool(relative), "no_world_denial": not denials and not opening,
                  "no_invented_numbers": not invented}
        passed = all(checks.values())
    record.update(checks=checks, failed_checks=[k for k, v in checks.items() if not v], passed=passed,
                  outcome="pass" if passed else "fail")
    return record


def run_one(case: AbsenceCase, ask_provider: Any) -> dict[str, Any]:
    """PAID: one streamed Ask on the benchmark fixture with today's retrieval."""
    record: dict[str, Any] = {"scenario_id": case.id, "kind": case.kind, "failure_mode": None}
    with cse._connection() as connection:
        candidates = ask_service._trim_candidates_for_query(case.question, ask_service._compact_candidates(connection))
        in_context = {r["id"] for records in candidates.values() for r in records}
        record["answer_in_context"] = sorted(set(case.answer_ids) & in_context)
        record["context_cut"] = ask_service._context_was_cut(ask_service._compact_candidates(connection), candidates) \
            if hasattr(ask_service, "_context_was_cut") else None
        context_text = " ".join(str(v) for records in candidates.values() for r in records for v in r.values()
                                if isinstance(v, (str, int, float)))
        final = None
        try:
            for name, payload in ask_service.stream_ask_events(connection, ask_provider, case.question):
                if name == "final":
                    final = payload
        except Exception as exc:  # broad on purpose: one failed call is a recorded outcome, not a crashed run
            record.update(outcome="error", passed=None, checks={}, failed_checks=[], error=f"{type(exc).__name__}: {exc}"[:300])
            return record
    record.update(score(case, final.get("answer") or {}, context_text))
    record["headline"] = (final.get("answer") or {}).get("headline")
    return record
