"""LLM grader for Ask answer quality (Oct 16; rubric approved by Paige with every suggested default; the authority_calibration
wording for attributed source reports approved Nov 7, #641; v9 wording for unsupported negatives, directness and
concision approved Nov 11, #641; v10 wording for the claims shape (#567), premise-echo openings and same-scope
denials approved Nov 12, #641).

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

from ask_display import withheld_line
from model_request_options import request_options

GRADER_MODEL = "claude-opus-5-5"
GRADER_VERSION = "ask-grader-v10 (2026-11-12: claims shape, premise-echo openings, same-scope denials, badge wording vs source authority (Paige, #641))"
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

Answer shapes. Ask answers come in two shapes. A claims answer shows a headline written by software, then 1-4 claims, each with a badge naming its record's authority (for example "Current State", "Needs review", "Project evidence"), then record cards; it may also show a fixed withheld_note saying part or all of the answer was left out. An older answer shows a model-written headline, a summary and record cards. A software headline that is only a neutral label (for example "What State has on record", "Meeting brief", "Recorded changes") is not part of the answer and earns or loses nothing on any dimension. Any other text, software-written or not, is graded: a headline or line that asserts a fact, or contradicts the answer, is judged like a claim. The opening is the first claim (older answers: the headline and the summary's first sentence). If every claim was left out, judge the response that is still displayed.

faithfulness (D1). Every claim in the claims (or headline and summary), section titles, items and details is supported by a supplied record, and each item's record_type/record_id actually supports that item's text. Absence of a record is not a negative fact. "No approval is recorded in Current State" is supported; "not approved", "not yet approved" or "leadership has not approved" is unsupported unless a record says so. Changing a source's or Review's own wording to its opposite (for example "approved" to "not yet approved") contradicts a supplied record. A definite denial ("we didn't decide that", "X was never approved", "that isn't happening") needs a record that establishes the denial at the same scope. A record about a narrower or nearer scope does not deny a broader or later one: "the first implementation remains human-reviewed" does not establish that nobody decided on broader or future automation. The supported correction is "No decision to fully automate support is recorded; the first implementation remains human-reviewed."
- 4: every claim traces to a supplied record; citations match; nothing added beyond reasonable paraphrase.
- 3: all substantive claims supported; one minor loose paraphrase or a slightly off citation that does not change meaning.
- 2: one unsupported specific (a date, number, owner, reason) or a citation pointing to a record that does not support the item, or a negative stated as fact when the records only show nothing recorded, or an opening that implies an event or decision (for example "why X was decided") when no record shows that event.
- 1: a fabricated decision, cause, approval or adjustment story, or a claim that contradicts a supplied record, including reversing a record's own wording (approved → not approved).

authority_calibration (D2). Current State is presented as what is true now; open Reviews as proposed and awaiting human review; Questions as unknown; Evidence as what a source reported; History as past; superseded proposals as superseded. "Confirmed", "resolved", "approved", "established" describe Current State or closed Questions when the answer asserts a fact as established, including in titles and headlines. An answer may report a source's own words when it attributes them to that source and keeps them apart from Current State: an answer meaning "The source reports X as approved; recording X in Current State is still pending" is correct. That sentence is an example of acceptable meaning, not required wording; any correct attributed paraphrase scores the same. Presenting a source's report as governing Current State is still a 1. For a claim with a badge, judge whether the wording accurately represents what the cited source establishes and its authority. "A pending Review reports that Legal approved X" does not itself present X as an accepted project fact. A badge never cures wording that improperly promotes a source's assertion into governing Current State.
- 4: every item's authority level is unambiguous and correct; pending content is explicitly pending; Current State is stated as the governing answer.
- 3: correct levels, but one item's status is implicit.
- 2: a pending Review or Evidence claim is phrased with authority it lacks in one place while the body is correct, or a superseded proposal is shown as equally current.
- 1: a pending Review, Evidence report or open Question is presented as Current State, or Current State is presented as overturned by a pending Review.

consequential_completeness (D3). The answer includes the records that would change what the reader does or believes about this question: blocking Questions, relevant open Reviews, conflicts with Current State, and a corrected false premise. Judge only consequential records. Assess whether the displayed answer includes the consequential information needed to answer the question, using the supplied records. A withholding notice neither excuses an omission nor proves that one occurred.
- 4: every consequential record relevant to the question is surfaced in the visible answer, with enough detail to act on.
- 3: all surfaced; one is thin (named but missing what it blocks or what would resolve it).
- 2: one consequential non-blocking item omitted, or a blocker mentioned only in passing at the end.
- 1: a blocking Question, a conflicting Review, or a correction of a false premise is missing.

directness (D4). The opening answers the question actually asked before context; a false premise is corrected first; a plain fact question is not turned into a meeting brief. An opening that restates the premise as background, such as "State does not record why support was decided to be fully automated" or "no record explains why automation was decided", answers as if the premise were true, even when the body corrects it later. Score only whether and how quickly the opening answers the question, not whether the answer is right. A wrong answer delivered first can score 4 here; faithfulness and authority_calibration catch the error. For compound questions, the first claim should begin answering a requested part or correct a consequential false premise. Subsequent claims should answer the remaining parts directly, without unrelated setup. Multiple claims alone are not a directness flaw.
- 4: the opening answers the exact question (or, for a compound question, begins answering a requested part); supporting context follows.
- 3: one claim or sentence of setup comes before the one that answers, or (older answers) the model-written headline is generic.
- 2: the answer must be assembled from several claims or sections, or the opening presupposes the false premise and only a later claim or the body corrects it.
- 1: the question is not answered, or the false premise is adopted.

hedging_calibration (D5). Certainty matches the record in both directions: settled Current State stated plainly; unknowns and pending items hedged clearly and once. This applies in both directions: an unknown stated as a definite "no" is as wrong as one stated as a definite "yes".
- 4: settled facts plain, unknowns explicit, each caveat attached to the item it applies to.
- 3: one unnecessary qualifier on a settled fact, or one vague hedge.
- 2: Current State undermined by blanket hedging, or an unknown given a soft implied value.
- 1: an unknown stated as a definite value or a definite negative, including a denial stated as definite when the records only cover a narrower scope, or the whole answer so hedged the reader cannot tell what is true.

concision (D6). Judge padding, not structure. Ask shows a short summary or 1-4 claims above record cards; a summary or claim that briefly names what the cards show, with its status (for example "One Review is pending"), is the expected shape and is NOT a concision flaw (Paige's calibration, Oct 20: she scored such answers 4). Do not penalize the format itself. A claim paired with its source card may earn 4 when the card provides useful provenance, detail or source access. Penalize only real padding: repeated content that adds no useful information or makes the requested answer harder to find, filler or boilerplate sentences, the same point made three or more times, sections that add nothing, generic advice, or an answer much longer than the question needs. Repetition is a flaw only when the same point is restated with nothing added: a second claim, sentence or section that repeats an earlier one, repeated qualifiers on the same item, or context unrelated to the question. Judge each answer on its own. Do not apply a uniform deduction.
- 4: no padding. The main point appearing in a claim (or the headline and summary) and in one card that gives its provenance, or a short closing restatement of the pending status, is how Ask answers read and does not lower the score.
- 3: one restatement that adds nothing, one irrelevant context item, one clear filler sentence (generic, adds no fact or status), or one whole section that adds nothing.
- 2: several restatements or qualifiers repeated across claims or sections, several filler sentences, the same point made three or more times, or several sections that add nothing.
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
        # #641 (Nov 7): the grader saw neither, so it could not check an answer that reports what a source said or
        # what a resolved Question's answer was. Adversarial scenarios have neither field.
        "evidence": list(getattr(scenario, "evidence", ())),
        "resolved_questions": [{"text": text, "answer": answer} for text, answer in getattr(scenario, "closed_questions", ())],
    }


_HIDDEN_ANSWER_FIELDS = ("source_ids", "uncertainty_ids")
# The card badges State's UI shows (implementation-context-prototype/context-ask.js, labelFor).
CARD_BADGES = {"review": "Needs review", "blocking_question": "Blocking", "question": "Open question", "answered_question": "Answered question",
               "state": "Current State", "history": "History", "evidence": "Project evidence"}


def visible_answer(answer: Any) -> Any:
    """What a person reads (Paige's default): run_ask returns an envelope ({"answer": {...}, "selection",
    "timing", ...}); keep only the inner answer and drop its hidden id lists."""
    if isinstance(answer, dict) and isinstance(answer.get("answer"), dict):
        answer = answer["answer"]
    if not isinstance(answer, dict):
        return answer
    visible = {key: value for key, value in answer.items() if key not in _HIDDEN_ANSWER_FIELDS}
    # #567: an answer with claims shows them, each with its chip, in place of a summary; its `summary` is only a
    # plain-text copy of those lines for older consumers, and the withheld counts show as one fixed line.
    if isinstance(visible.get("claims"), list):
        visible.pop("summary", None)
        visible["claims"] = [{"text": c.get("text"), "badge": c.get("label") or ""} for c in visible["claims"] if isinstance(c, dict)]
    withheld = bool(visible.pop("withheld_claims", 0)) | bool(visible.pop("withheld_items", 0))
    if withheld:
        # v10 (Nov 12): the line the UI shows, including the all-withheld wording, so directness judges what remains.
        visible["withheld_note"] = withheld_line(answer)
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
