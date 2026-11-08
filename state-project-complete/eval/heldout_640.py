"""Score the frozen #640 held-out set (eval/fixtures/640_heldout_v1.json) against question_status.route, offline.

Outcomes are kept apart (Paige, Nov 8), so a system that always asks cannot look safe:
- incorrect: a wrong Question answered, a non-status request intercepted, a status request passed to normal Ask, or a
  direct answer where the request was ambiguous;
- unnecessary clarification: asked although the intended Question was clear;
- success: the right Question answered directly from its record (status checked);
- appropriate clarification and correct pass-through are reported on their own lines.
The labelled model answers in the file are for the deferred fallback approach and are not used here.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from question_status import is_resolved, route

PATH = Path(__file__).parent / "fixtures" / "640_heldout_v1.json"


def evaluate(data: dict[str, Any] | None = None, path: Path | None = None) -> list[dict[str, Any]]:
    data = data or json.loads((path or PATH).read_text())
    questions = data["questions"]
    by_id = {q["id"]: q for q in questions}
    rows = []
    for req in data["requests"]:
        r = route(req["text"], questions)
        expected = req["match"] if req["in_scope"] else "pass"
        got = r.question["id"] if r.kind == "direct" else r.kind
        if not req["in_scope"]:
            outcome = "correct pass-through" if r.kind == "pass" else "incorrect: non-status request intercepted"
        elif expected == "none":
            outcome = "correct pass-through" if r.kind == "pass" else "incorrect: answered or asked with no matching Question"
        elif expected == "clarify":
            outcome = {"clarify": "appropriate clarification", "direct": "incorrect: direct answer to an ambiguous request",
                       "pass": "incorrect: status request passed to normal Ask"}[r.kind]
        else:
            if r.kind == "direct" and got == expected:
                q = by_id[expected]
                card = r.answer["sections"][0]["items"][0]
                if is_resolved(q):  # resolved: an answered card that carries the recorded answer
                    status_ok = card["record_type"] == "answered_question" and str(q.get("answer") or "") in str(card.get("detail"))
                else:  # open: an open card, and any draft text never shown
                    status_ok = card["record_type"] == "question" and not (q.get("answer") and q["answer"] in str(r.answer))
                outcome = "success" if status_ok else "incorrect: wrong status in the response"
            elif r.kind == "direct":
                outcome = "incorrect: wrong Question answered"
            elif r.kind == "clarify":
                outcome = "unnecessary clarification"
            else:
                outcome = "incorrect: status request passed to normal Ask"
        rows.append({"request": req["text"], "expected": expected, "got": got, "outcome": outcome,
                     "reason": r.reason, "note": req.get("note", "")})
    return rows
