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
from datetime import date
from typing import Any

from model_request_options import request_options

GRADER_MODEL = "claude-opus-5-5"
GRADER_VERSION = "ask-grader-v5 (2026-10-20: concision judges padding, not summary-card echo)"
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

concision (D6). Judge padding, not structure. Ask always shows a short summary above record cards; a summary that briefly names what the cards show, with its status (for example "One Review is pending"), is the expected shape and is NOT a concision flaw (Paige's calibration, Oct 20: she scored such answers 4). Penalize only real padding: filler or boilerplate sentences, the same point made three or more times, sections that add nothing, generic advice, or an answer much longer than the question needs.
- 4: no padding; any echo of a card is brief and adds its status or meaning.
- 3: one filler sentence or one section that adds nothing.
- 2: several filler sentences, the same point made three or more times, or several sections that add nothing.
- 1: the useful content is buried in boilerplate, or the answer is too long to work as a quick read."""

SYSTEM_PROMPT = """You are grading one answer from "Ask", a read-only question-answering feature in State, a project-truth tool for PMs. State's authority model: Current State is what a human has authorized as true now. An open Review is a proposal awaiting human decision and is NOT true yet. A Question is an open unknown; a blocking Question blocks something. Evidence is what a source reported, not an accepted fact. History records past authorized changes. Ask must never present a pending Review, Evidence, or open Question as Current State, must keep unknowns unknown, and must not invent reasons, numbers, dates, or decisions.

Grade only against the SUPPLIED RECORDS. Do not use outside knowledge or assume facts that would be plausible. If a claim is not supported by a supplied record, it is unsupported, however reasonable it sounds.

Score six dimensions, each from 1 to 4, using the rubric below. Score each dimension independently: penalize a flaw only in the dimension it belongs to.

Length rule: a longer answer earns no credit on any dimension for being longer. Padding counts only against concision (and against hedging_calibration if it hedges settled facts). An answer of one or two sentences can score 4 on every dimension.

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


def _question_record(text: str) -> dict[str, Any]:
    blocking = text.upper().startswith("BLOCKING:")
    clean = text.split(":", 1)[1].strip() if blocking else text
    return {"text": clean, "blocking": blocking, "blocks": "Launch readiness" if blocking else None}


def supplied_records(scenario) -> dict[str, Any]:
    """The records the Ask call was seeded with, as the grader sees them."""
    return {
        "current_state": [{"topic": topic, "statement": statement} for topic, statement in scenario.current_state],
        "open_reviews": list(scenario.pending_reviews),
        # Oct 20: the same blocking status and "blocks" text the Ask test seeds (quality_harness
        # _seed_ask_scenario); without them the grader scored "non-blocking" and "launch readiness" as invented.
        "open_questions": [_question_record(text) for text in scenario.open_questions],
        "history": [list(entry) for entry in scenario.history],
    }


_HIDDEN_ANSWER_FIELDS = ("source_ids", "uncertainty_ids")
# The card badges State's UI shows (implementation-context-prototype/context-ask.js, labelFor).
CARD_BADGES = {"review": "Needs review", "blocking_question": "Blocking", "question": "Open question",
               "state": "Current State", "history": "History", "evidence": "Project evidence"}


def visible_answer(answer: Any) -> Any:
    """What a person reads (Paige's default): run_ask returns an envelope ({"answer": {...}, "selection",
    "timing", ...}); keep only the inner answer and drop its hidden id lists."""
    if isinstance(answer, dict) and isinstance(answer.get("answer"), dict):
        answer = answer["answer"]
    if not isinstance(answer, dict):
        return answer
    visible = {key: value for key, value in answer.items() if key not in _HIDDEN_ANSWER_FIELDS}
    # Oct 20: each card shows a status badge in the UI (context-ask.js labelFor); give the grader the same
    # label so it judges what a person sees.
    sections = []
    for section in visible.get("sections") or []:
        if isinstance(section, dict):
            items = [{**item, "badge": CARD_BADGES.get(item.get("record_type"), "")} if isinstance(item, dict) else item
                     for item in section.get("items") or []]
            section = {**section, "items": items}
        sections.append(section)
    if sections:
        visible["sections"] = sections
    return visible


def user_message(scenario, answer: Any, today: date | None = None) -> str:
    # Reference-guided with the scenario rationale only, never the keyword lists (Paige's default).
    reference = f"\nWHAT A GOOD ANSWER MUST DO:\n{scenario.rationale}\n" if getattr(scenario, "rationale", "") else ""
    # Oct 19: Ask is told today's date and may say a date has passed; without it the grader scored a
    # correct "the October 1 target has already passed" as fabricated (graded run 38981586083).
    return (
        f"TODAY'S DATE (Ask was given this date): {(today or date.today()).isoformat()}\n\n"
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


# Paige's calibration bar (Oct 16 defaults).
CALIBRATION_WITHIN_ONE = 0.90
CALIBRATION_EXACT = 0.65


def calibration_report(pairs: list[tuple[str, dict[str, int], dict[str, int], str | None]]) -> dict[str, Any]:
    """Agreement between Paige's blind grades and the grader's, per dimension.

    `pairs` holds (answer_id, paige_scores, grader_scores, severity). The grader passes when, for every
    dimension, within-one agreement >= 90% and exact agreement >= 65%, and no answer Paige scored 1 on a
    gated dimension got a 3 or 4 from the grader (a missed fail is worse than a false alarm).
    """
    per_dim: dict[str, dict[str, Any]] = {}
    missed_fails = []
    for name in DIMENSIONS:
        rows = [(aid, p[name], g[name]) for aid, p, g, _sev in pairs if name in p and name in g]
        if not rows:
            continue
        exact = sum(1 for _aid, a, b in rows if a == b) / len(rows)
        within = sum(1 for _aid, a, b in rows if abs(a - b) <= 1) / len(rows)
        per_dim[name] = {"n": len(rows), "exact": exact, "within_one": within,
                         "passes": exact >= CALIBRATION_EXACT and within >= CALIBRATION_WITHIN_ONE}
    for aid, p, g, severity in pairs:
        gated = list(GATED_EVERYWHERE) + (list(GATED_ON_HIGH_SEVERITY) if severity == "high" else [])
        for name in gated:
            if p.get(name) == 1 and g.get(name, 0) >= 3:
                missed_fails.append({"answer_id": aid, "dimension": name, "paige": 1, "grader": g[name]})
    return {"dimensions": per_dim, "missed_fails": missed_fails,
            "passes": bool(per_dim) and all(d["passes"] for d in per_dim.values()) and not missed_fails}
