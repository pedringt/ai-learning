"""What an Ask answer shows a person, as plain text (#567).

One formatter for everything that must match the screen: the compatibility `summary` on new answers, Copy
(mirrored in context-ask.js `portableText`), and the eval scorers, which score this text rather than the raw
JSON. Authority labels are part of the text ("[Current State] ..."), so nothing downstream loses them.

Works on both answer shapes: claims (#567) and the older headline + summary, so a before/after eval scores
both with the same rules.
"""
from __future__ import annotations

from typing import Any, Mapping

# The chips State's UI shows (context-ask.js labelFor). A test keeps the two in step.
RECORD_LABELS = {
    "state": "Current State", "review": "Needs review", "blocking_question": "Blocking", "question": "Open question",
    "answered_question": "Answered question", "history": "History", "evidence": "Project evidence",
}
WITHHELD_LINE = "Part of this answer couldn't be checked against State's records and was left out."
# #544 (Oct 20, Paige): every answer says it covers only what State has on record.
SCOPE_NOTE = "Based on what's recorded in State. There may be things it doesn't know about."


def inner_answer(answer: Any) -> Mapping[str, Any]:
    """run_ask returns an envelope ({"answer": {...}, "selection", ...}); accept either. Plain answer text (scorer
    tests pass {"answer": "..."}) reads as a summary."""
    if isinstance(answer, Mapping) and isinstance(answer.get("answer"), (Mapping, str)):
        answer = answer["answer"]
    if isinstance(answer, str):
        return {"summary": answer}
    return answer if isinstance(answer, Mapping) else {}


def _labelled(label: str | None, text: str) -> str:
    return f"[{label}] {text}" if label else text


def claim_lines(answer: Any) -> list[str]:
    """The claims as displayed, one per line, each with its chip."""
    return [_labelled(c.get("label"), str(c.get("text") or "").strip())
            for c in inner_answer(answer).get("claims") or [] if isinstance(c, Mapping) and c.get("text")]


def has_withheld(answer: Any) -> bool:
    a = inner_answer(answer)
    return bool(a.get("withheld_claims")) or bool(a.get("withheld_items"))


def displayed_lines(answer: Any, *, include_footer: bool = False) -> list[str]:
    """Every line a person sees, in order. Claims replace the summary when present; an answer without claims
    (the older shape, or a software-written starter answer) shows its summary."""
    a = inner_answer(answer)
    lines: list[str] = []
    if a.get("headline"):
        lines.append(str(a["headline"]).strip())
    if isinstance(a.get("claims"), list):
        lines.extend(claim_lines(a))
    elif a.get("summary"):
        lines.append(str(a["summary"]).strip())
    if has_withheld(a):
        lines.append(WITHHELD_LINE)
    for section in a.get("sections") or []:
        if not isinstance(section, Mapping):
            continue
        items = [i for i in section.get("items") or [] if isinstance(i, Mapping)]
        if not items:
            continue
        lines.append(str(section.get("title") or "").strip())
        for item in items:
            record_type = item.get("record_type")
            lines.append("- " + _labelled(RECORD_LABELS.get(record_type), str(item.get("text") or "").strip()))
            detail = str(item.get("detail") or "").strip()
            if record_type == "blocking_question" and detail.lower().startswith("blocks:"):
                detail = detail.split(":", 1)[1].strip()
            if detail:
                lines.append(f"  {'Blocks: ' if record_type == 'blocking_question' else ''}{detail}")
    # The UI shows the first three refinement chips and, when set, the suggested Question card.
    lines.extend(str(x).strip() for x in (a.get("suggested_refinements") or [])[:3] if str(x).strip())
    if a.get("suggested_question"):
        lines.append(str(a["suggested_question"]).strip())
    if include_footer:
        lines.append(SCOPE_NOTE)
    return [line for line in lines if line]


def displayed_text(answer: Any, *, include_footer: bool = False) -> str:
    return "\n".join(displayed_lines(answer, include_footer=include_footer))


def answer_lead(answer: Any) -> str:
    """What answers the question first: the first displayed claim, without its chip, when the answer has claims
    (the headline is then fixed by software and says nothing about status); otherwise the headline."""
    a = inner_answer(answer)
    claims = [c for c in a.get("claims") or [] if isinstance(c, Mapping) and c.get("text")]
    if claims:
        return str(claims[0]["text"]).strip()
    if a.get("claims") is not None and a.get("withheld_claims"):
        return ""
    return str(a.get("headline") or "").strip()
