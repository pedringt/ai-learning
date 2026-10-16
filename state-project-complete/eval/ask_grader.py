"""LLM grader for Ask answer quality (Oct 16; rubric approved by Paige with every suggested default).

Observed only, never a release gate (DEC-008), until Paige's blind calibration passes: within-1
agreement of at least 90% per dimension, exact agreement of at least 65%, and no answer Paige scored 1
on a gated dimension that the grader scored 3 or 4. The keyword checks in quality_harness stay as they
are; this scores what they cannot (unsupported claims they were never told to forbid, citations, how
direct and how well-hedged the answer is).

Importing this module makes no model call and never loads .env. `grade_answer` is PAID: one
claude-opus-5-5 call. The grader prompt, rubric and model are a model/prompt change under RELEASE.md:
change GRADER_VERSION and re-calibrate when any of them changes.
"""
from __future__ import annotations

import json
from typing import Any

from model_request_options import request_options

GRADER_MODEL = "claude-opus-5-5"
GRADER_VERSION = "ask-grader-v1 (2026-10-16)"
GRADER_MAX_TOKENS = 1_500

DIMENSIONS = (
    "faithfulness", "authority_calibration", "consequential_completeness",
    "directness", "hedging_calibration", "concision",
)
# Paige's defaults: D1 and D2 gate everywhere, D3 gates on high-severity scenarios; a 1 fails, a 2 is
# counted toward a rate; D4-D6 are tracked only.
GATED_EVERYWHERE = ("faithfulness", "authority_calibration")
GATED_ON_HIGH_SEVERITY = ("consequential_completeness",)

RUBRIC = """Scale for every dimension: 4 = what a careful PM would want, 3 = acceptable with a minor flaw, 2 = a material flaw a reader could act on wrongly or would have to work around, 1 = trust-breaking or fails the job.

faithfulness (D1). Every claim in the headline, summary, section titles, items and details is supported by a supplied record, and each item's record_type/record_id actually supports that item's text.
- 4: every claim traces to a supplied record; citations match; nothing added beyond reasonable paraphrase.
- 3: all substantive claims supported; one minor loose paraphrase or a slightly off citation that does not change meaning.
- 2: one unsupported specific (a date, number, owner, reason) or a citation pointing to a record that does not support the item.
- 1: a fabricated decision, cause, approval or adjustment story, or a claim that contradicts a supplied record.

authority_calibration (D2). Current State is presented as what is true now; open Reviews as proposed and awaiting human review; Questions as unknown; Evidence as what a source reported; History as past; superseded proposals as superseded. "Confirmed", "resolved", "approved", "established" appear only for Current State or closed Questions, including in titles and headlines.
- 4: every item's authority level is unambiguous and correct; pending content is explicitly pending; Current State is stated as the governing answer.
- 3: correct levels, but one item's status is implicit.
- 2: a pending Review or Evidence claim is phrased with authority it lacks in one place while the body is correct, or a superseded proposal is shown as equally current.
- 1: a pending Review, Evidence report or open Question is presented as Current State, or Current State is presented as overturned by a pending Review.

consequential_completeness (D3). The answer includes the records that would change what the reader does or believes about this question: blocking Questions, relevant open Reviews, conflicts with Current State, and a corrected false premise. Judge only consequential records.
- 4: every consequential record relevant to the question is surfaced in the visible answer, with enough detail to act on.
- 3: all surfaced; one is thin (named but missing what it blocks or what would resolve it).
- 2: one consequential non-blocking item omitted, or a blocker mentioned only in passing at the end.
- 1: a blocking Question, a conflicting Review, or a correction of a false premise is missing.

directness (D4). The headline and opening sentence answer the question actually asked before context; a false premise is corrected first; a plain fact question is not turned into a meeting brief.
- 4: the first sentence answers the exact question; supporting context follows.
- 3: the answer is in the summary but preceded by one sentence of setup, or the headline is generic.
- 2: the answer must be assembled from sections, or a false premise is corrected only after answering as if it were true.
- 1: the question is not answered, or the false premise is adopted.

hedging_calibration (D5). Certainty matches the record in both directions: settled Current State stated plainly; unknowns and pending items hedged clearly and once.
- 4: settled facts plain, unknowns explicit, each caveat attached to the item it applies to.
- 3: one unnecessary qualifier on a settled fact, or one vague hedge.
- 2: Current State undermined by blanket hedging, or an unknown given a soft implied value.
- 1: an unknown stated as a definite value, or the whole answer so hedged the reader cannot tell what is true.

concision (D6). As short as the question allows; no duplicated items across sections; section titles match their contents; ends with something actionable where relevant.
- 4: every sentence earns its place; a PM could forward it as-is.
- 3: one redundant sentence or section, or a mismatched section title.
- 2: the same issue repeated across sections, filler sections, or several sections for a one-line fact question.
- 1: the useful content is buried in boilerplate, or the answer is too long or repetitive to work as a quick read."""

SYSTEM_PROMPT = """You are grading one answer from "Ask", a read-only question-answering feature in State, a project-truth tool for PMs. State's authority model: Current State is what a human has authorized as true now. An open Review is a proposal awaiting human decision and is NOT true yet. A Question is an open unknown; a blocking Question blocks something. Evidence is what a source reported, not an accepted fact. History records past authorized changes. Ask must never present a pending Review, Evidence, or open Question as Current State, must keep unknowns unknown, and must not invent reasons, numbers, dates, or decisions.

Grade only against the SUPPLIED RECORDS. Do not use outside knowledge or assume facts that would be plausible. If a claim is not supported by a supplied record, it is unsupported, however reasonable it sounds.

Score six dimensions, each from 1 to 4, using the rubric below. Score each dimension independently: penalize a flaw only in the dimension it belongs to.

Length rule: a longer answer earns no credit on any dimension for being longer. Extra sections, restatements, and caveats count only against concision (and against hedging_calibration if they are hedges on settled facts). An answer of one or two sentences can score 4 on every dimension.

Before each score, identify the specific sentence or item that determines it. If you cannot point to one, do not score below 4 for that dimension.

RUBRIC
""" + RUBRIC + """

Return only the JSON object described. No prose outside it."""

_DIMENSION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["score", "reason"],
    "properties": {
        "score": {"type": "integer", "enum": [1, 2, 3, 4]},
        "reason": {"type": "string"},
    },
}
GRADE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": list(DIMENSIONS),
    "properties": {name: _DIMENSION_SCHEMA for name in DIMENSIONS},
}


def supplied_records(scenario) -> dict[str, Any]:
    """The records the Ask call was seeded with, as the grader sees them."""
    return {
        "current_state": [{"topic": topic, "statement": statement} for topic, statement in scenario.current_state],
        "open_reviews": list(scenario.pending_reviews),
        "open_questions": list(scenario.open_questions),
        "history": [list(entry) for entry in scenario.history],
    }


def visible_answer(answer: Any) -> Any:
    """What a person reads: drop hidden id lists so the grader judges the visible answer (Paige's default)."""
    if not isinstance(answer, dict):
        return answer
    return {key: value for key, value in answer.items() if key not in ("source_ids", "uncertainty_ids")}


def user_message(scenario, answer: Any) -> str:
    # Reference-guided with the scenario rationale only, never the keyword lists (Paige's default).
    reference = f"\nWHAT A GOOD ANSWER MUST DO:\n{scenario.rationale}\n" if getattr(scenario, "rationale", "") else ""
    return (
        f"QUESTION:\n{scenario.question}\n\n"
        f"SUPPLIED RECORDS (JSON; these are the only facts that exist):\n{json.dumps(supplied_records(scenario), indent=1)}\n\n"
        f"ANSWER (JSON as shown to the user):\n{json.dumps(visible_answer(answer), indent=1)}\n"
        f"{reference}\nGrade the answer."
    )


def gates(scores: dict[str, int], severity: str | None) -> dict[str, bool]:
    """Pass/fail per gated dimension, computed in code so the rule can change without re-grading."""
    gated = list(GATED_EVERYWHERE) + (list(GATED_ON_HIGH_SEVERITY) if severity == "high" else [])
    return {name: scores[name] > 1 for name in gated if name in scores}


def parse_grade(text: str) -> dict[str, dict[str, Any]]:
    data = json.loads(text)
    missing = [name for name in DIMENSIONS if name not in data]
    if missing:
        raise ValueError(f"grader omitted {', '.join(missing)}")
    for name in DIMENSIONS:
        score = data[name].get("score")
        if score not in (1, 2, 3, 4):
            raise ValueError(f"grader gave {name} score {score!r}")
    return data


def grade_answer(scenario, answer: Any, client=None) -> dict[str, dict[str, Any]]:
    """PAID: one GRADER_MODEL call. Returns {dimension: {"score": 1-4, "reason": str}}."""
    if client is None:
        import anthropic

        client = anthropic.Anthropic()
    message = client.messages.create(
        model=GRADER_MODEL,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message(scenario, answer)}],
        **request_options(GRADER_MODEL, GRADER_MAX_TOKENS, {"format": {"type": "json_schema", "schema": GRADE_SCHEMA}}),
    )
    text = next((block.text for block in message.content if getattr(block, "type", "") == "text"), "")
    return parse_grade(text)
