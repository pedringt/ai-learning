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
# #662 (Paige, Nov 14): the line says how many statements were left out and what kind, from the check's reason, without
# showing them. Keys are the kinds ask_service records; context-ask.js mirrors these phrases (a test keeps them in step).
WITHHELD_KIND_PHRASES = {
    "reference": "cited a record State doesn't have",
    "figure": "used a number or date that isn't in State's records",
    "settled": "said something was settled that State's records don't establish",
    "permission": "said something could go ahead without a record that allows it",
    "draft": "stated the draft's assumption as fact",
    # #703/#704 (Paige, Nov 16, DEC-029)
    "freshness": "said whether something is out of date, which only its confirmation date shows",
    "absence": "said State has no record of something it does have",
    "other": "couldn't be checked against State's records",
}
# #567 (Nov 11, draft copy for Paige's review): when every claim was withheld, the line says so without implying the
# answer was wrong or that State has nothing on the question.
ALL_WITHHELD_LINE = ("None of this answer could be checked against State's records, so none of it is shown. "
                     "That doesn't mean it was wrong, or that State has nothing on this.")
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


def claim_lines(answer: Any, *, labels: bool = True) -> list[str]:
    """The claims as displayed, one per line, each with its chip (unless labels=False)."""
    return [_labelled(c.get("label") if labels else None, str(c.get("text") or "").strip())
            for c in inner_answer(answer).get("claims") or [] if isinstance(c, Mapping) and c.get("text")]


def has_withheld(answer: Any) -> bool:
    a = inner_answer(answer)
    return bool(a.get("withheld_claims")) or bool(a.get("withheld_items"))


def withheld_counts(answer: Any) -> list[tuple[str, int]]:
    """How many statements were withheld, by kind, most first (ties in WITHHELD_KIND_PHRASES order). Withheld units the
    kinds don't account for (for example claims past the fourth) count as "other"."""
    a = inner_answer(answer)
    kinds = a.get("withheld_kinds") if isinstance(a.get("withheld_kinds"), Mapping) else {}
    counts = {k: int(v) for k, v in kinds.items() if k in WITHHELD_KIND_PHRASES and int(v or 0) > 0}
    rest = int(a.get("withheld_claims") or 0) + int(a.get("withheld_items") or 0) - sum(counts.values())
    if rest > 0:
        counts["other"] = counts.get("other", 0) + rest
    order = list(WITHHELD_KIND_PHRASES)
    return sorted(counts.items(), key=lambda kv: (-kv[1], order.index(kv[0])))


def _kinds_line(counts: list[tuple[str, int]]) -> str:
    total = sum(n for _, n in counts)
    if total == 1:
        return f"1 statement was left out: it {WITHHELD_KIND_PHRASES[counts[0][0]]}."
    if len(counts) == 1:
        who = "both" if total == 2 else f"all {total}"
        return f"{total} statements were left out: {who} {WITHHELD_KIND_PHRASES[counts[0][0]]}."
    parts = [f"{n} {WITHHELD_KIND_PHRASES[k]}" for k, n in counts]
    joined = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + ", and " + parts[-1]
    return f"{total} statements were left out: {joined}."


def withheld_line(answer: Any) -> str | None:
    """The line shown when something was withheld: the fully-withheld line when no claim is left, else how many
    statements were left out and what kind (#662). An answer recorded before #662 has no kinds and keeps the old line."""
    a = inner_answer(answer)
    if not has_withheld(a):
        return None
    shown = [c for c in a.get("claims") or [] if isinstance(c, Mapping) and c.get("text")]
    if isinstance(a.get("claims"), list) and a.get("withheld_claims") and not shown:
        return ALL_WITHHELD_LINE
    if not isinstance(a.get("withheld_kinds"), Mapping):
        return WITHHELD_LINE
    return _kinds_line(withheld_counts(a))


def displayed_lines(answer: Any, *, include_footer: bool = False, labels: bool = True) -> list[str]:
    """Every line a person sees, in order. Claims replace the summary when present; an answer without claims
    (the older shape, or a software-written starter answer) shows its summary.

    labels=False keeps only the answer's words: no chips, no fixed (software) headline, no withheld line and no
    software status prefix on a card ("Answered:", "Blocks:"). The eval keyword checks read this form, so a label
    can never stand in for a fact the answer has to state (#567, Paige Nov 10)."""
    a = inner_answer(answer)
    has_claims = isinstance(a.get("claims"), list)
    lines: list[str] = []
    if a.get("headline") and (labels or not has_claims):
        lines.append(str(a["headline"]).strip())
    if has_claims:
        lines.extend(claim_lines(a, labels=labels))
    elif a.get("summary"):
        lines.append(str(a["summary"]).strip())
    if has_withheld(a) and labels:
        lines.append(withheld_line(a))
    for section in a.get("sections") or []:
        if not isinstance(section, Mapping):
            continue
        items = [i for i in section.get("items") or [] if isinstance(i, Mapping)]
        hypothetical = section.get("hypothetical") if isinstance(section.get("hypothetical"), Mapping) else None
        if not items and not hypothetical:
            continue
        lines.append(str(section.get("title") or "").strip())
        # #567 (Nov 11): a hypothetical draft's assumption line (and any notes) is shown with the draft, always.
        # Software text, so the eval's model-words form (labels=False) leaves it out.
        if hypothetical and labels:
            lines.append(str(hypothetical.get("line") or "").strip())
            lines.extend(str(n).strip() for n in hypothetical.get("notes") or [])
        for item in items:
            record_type = item.get("record_type")
            label = RECORD_LABELS.get(record_type) if labels else None
            lines.append("- " + _labelled(label, str(item.get("text") or "").strip()))
            detail = str(item.get("detail") or "").strip()
            if record_type == "blocking_question" and detail.lower().startswith("blocks:"):
                detail = detail.split(":", 1)[1].strip()
            if record_type == "answered_question" and not labels and detail.lower().startswith("answered"):
                detail = detail.split(":", 1)[1].strip() if ":" in detail else ""
            if detail:
                lines.append(f"  {'Blocks: ' if record_type == 'blocking_question' and labels else ''}{detail}")
    # The UI shows the first three refinement chips and, when set, the suggested Question card.
    lines.extend(str(x).strip() for x in (a.get("suggested_refinements") or [])[:3] if str(x).strip())
    if a.get("suggested_question"):
        lines.append(str(a["suggested_question"]).strip())
    if include_footer:
        lines.append(SCOPE_NOTE)
    return [line for line in lines if line]


def displayed_text(answer: Any, *, include_footer: bool = False, labels: bool = True) -> str:
    return "\n".join(displayed_lines(answer, include_footer=include_footer, labels=labels))


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
