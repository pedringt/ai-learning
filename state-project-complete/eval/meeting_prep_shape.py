"""#246: how often does the model's RAW meeting-prep answer already have its final shape?

The backend reshapes a `meeting_prep` answer after the model writes it (`_normalize_meeting_prep`): it merges
repeated section kinds, reorders sections, caps items and sections, drops duplicate records and rewrites titles.
If the model writes something the backend then changes, an answer that streams to the screen as written visibly
grows, reshuffles and shrinks when it finishes (#239). The prompt now states the backend's final shape, generated
from the same constants (`MEETING_PREP_*` in `ask_contract.py`); this module measures how well the model follows it.

`shape_report()` is deterministic and makes no model call: it takes the model's raw `answer` object, runs the real
normalizer on a copy, and reports what changed. `summarize()` turns repeated runs into rates. Running it against a
real model is paid: use `python -m eval.run_meeting_prep_shape` (`--dry-run` shows the call count first).
"""
from __future__ import annotations

import copy
from typing import Any, Iterable, Mapping

from ask_contract import MEETING_PREP_SECTION_ORDER, AskSynthesis
from ask_service import _normalize_meeting_prep

# What a person actually triggers: the drawer's "What should I know?" starter, and a typed prep request.
QUERIES: dict[str, str] = {
    "starter_briefing": (
        "Give me the most consequential project briefing for right now. Prioritize what matters most, then keep "
        "accepted Current State, pending Reviews, and unresolved Questions clearly separate."
    ),
    "prep_status_meeting": "Help me prepare for a project status meeting: what decisions are needed and what should we get answered?",
}
PROJECTS = ("northstar", "juniper")


def _item_key(item) -> tuple[str, str]:
    return (item.record_type, item.record_id or item.text.strip().lower())


def _signature(answer: AskSynthesis) -> list[tuple[str, str, tuple[tuple[str, str], ...]]]:
    """What a person sees, in order: (kind, title, the records shown) for every section that has items."""
    return [(s.kind, s.title, tuple(_item_key(i) for i in s.items)) for s in answer.sections if s.items]


def shape_report(answer_raw: Mapping[str, Any]) -> dict[str, Any]:
    """Compare the model's raw answer with what the backend keeps. `stable` means nothing changes at all."""
    try:
        before = AskSynthesis.model_validate(answer_raw)
    except Exception as exc:  # a schema-invalid answer is its own outcome, not a shape result
        return {"valid": False, "applies": False, "error": str(exc)[:200]}
    if before.job != "meeting_prep":
        return {"valid": True, "applies": False, "job": before.job}
    after = _normalize_meeting_prep(copy.deepcopy(before))

    sig_before, sig_after = _signature(before), _signature(after)
    items_before = sum(len(s[2]) for s in sig_before)
    items_after = sum(len(s[2]) for s in sig_after)
    kinds_before = [s[0] for s in sig_before]
    unique_kinds = list(dict.fromkeys(kinds_before))
    titles_after = {s[0]: s[1] for s in sig_after}
    titles_before = {}
    for kind, title, _ in sig_before:
        titles_before.setdefault(kind, title)
    return {
        "valid": True,
        "applies": True,
        "job": "meeting_prep",
        "sections_before": len(sig_before),
        "sections_after": len(sig_after),
        "items_before": items_before,
        "items_after": items_after,
        "items_dropped": items_before - items_after,
        "sections_lost": len(sig_before) - len(sig_after),                   # merged together or dropped
        "repeated_kinds": len(kinds_before) - len(unique_kinds),
        "out_of_order": unique_kinds != sorted(unique_kinds, key=MEETING_PREP_SECTION_ORDER.index),
        "retitled": any(titles_before.get(kind) != title for kind, title in titles_after.items() if titles_before.get(kind) is not None),
        # What a person would see while a live stream is drawing: content shrinking or moving.
        "visible_shrink": items_after < items_before or len(sig_after) < len(sig_before),
        "stable": sig_before == sig_after,
    }


def summarize(reports: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Rates over repeated runs. Only runs where the model chose `meeting_prep` say anything about its shape."""
    reports = list(reports)
    applicable = [r for r in reports if r.get("applies")]

    def rate(key, pool):
        return round(sum(1 for r in pool if r.get(key)) / len(pool), 2) if pool else None

    def mean(key, pool):
        return round(sum(r[key] for r in pool) / len(pool), 2) if pool else None

    return {
        "runs": len(reports),
        "invalid_rate": round(sum(1 for r in reports if not r.get("valid")) / len(reports), 2) if reports else None,
        "chose_meeting_prep_rate": round(len(applicable) / len(reports), 2) if reports else None,
        "stable_rate": rate("stable", applicable),
        "visible_shrink_rate": rate("visible_shrink", applicable),
        "out_of_order_rate": rate("out_of_order", applicable),
        "retitled_rate": rate("retitled", applicable),
        "repeated_kinds_rate": rate("repeated_kinds", applicable),
        "items_dropped_mean": mean("items_dropped", applicable),
        "sections_lost_mean": mean("sections_lost", applicable),
    }
