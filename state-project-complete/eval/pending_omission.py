"""#696 (Paige, Nov 16; DEC-030 amendment): "the answer lost its pending claim", tracked as its own trust metric.

An answer can be accurate sentence by sentence and still leave out a pending item that would change the reader's
understanding: "No, data retention is not back to 90 days. Current State says data retention is 30 days." with the
pending proposal to restore 90 days withheld by Ask's own checks. The authority check passes many of these (its label
rule accepts Current State claims plus a Needs-review card), so this is reported separately and even when every check
passes.

Reporting only: tracked, not a release gate (DEC-030 amendment), and kept out of the scoring code so it does not change any
suite's scoring version. Deterministic, no model calls. It reads what an eval run already saves: the final answer and
the statements Ask withheld (ask_withheld_units, captured since #682).

Counted: Ask withheld at least one claim whose basis is a pending Review, and the final answer keeps no claim on that
basis. Whether a case is a material omission or an acceptable withholding is a judgment the code does not make.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Iterable, Mapping

from ask_display import inner_answer

PENDING_BASES = frozenset({"pending_review"})


def withheld_pending_claims(withheld_units: Iterable[Mapping[str, Any]] | None) -> list[Mapping[str, Any]]:
    return [u for u in withheld_units or () if isinstance(u, Mapping)
            and u.get("unit", "claim") == "claim" and u.get("basis") in PENDING_BASES]


def kept_pending_claim(answer: Any) -> bool:
    claims = inner_answer(answer).get("claims") if isinstance(answer, Mapping) else None
    return any(isinstance(c, Mapping) and c.get("basis") in PENDING_BASES for c in claims or ())


def lost_pending_claim(answer: Any, withheld_units: Iterable[Mapping[str, Any]] | None) -> bool:
    """Ask withheld a pending-Review claim and the final answer kept none."""
    return bool(withheld_pending_claims(withheld_units)) and not kept_pending_claim(answer)


def summarize(rows: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Rows are scored Ask results with `answer`, `withheld_units`, `scenario_id` and an authority verdict
    (`authority_ok`, or `checks["authority"]` on a matrix row). Unscored rows (no answer) are left out of n."""
    n = lost = silent = 0
    kinds: Counter = Counter()
    scenarios: Counter = Counter()
    for row in rows:
        answer = row.get("answer")
        if not isinstance(answer, Mapping):
            continue
        n += 1
        units = row.get("withheld_units")
        if not lost_pending_claim(answer, units):
            continue
        lost += 1
        scenarios[str(row.get("scenario_id") or row.get("id"))] += 1
        for u in withheld_pending_claims(units):
            kinds[str(u.get("kind") or "unknown")] += 1
        authority = row.get("authority_ok", (row.get("checks") or {}).get("authority"))
        silent += authority is True
    return {"n": n, "lost": lost, "rate": lost / n if n else None, "authority_passed": silent,
            "withheld_kinds": dict(kinds.most_common()), "scenarios": dict(scenarios.most_common())}


def describe(summary: Mapping[str, Any]) -> str:
    if not summary.get("n"):
        return ""
    rate = summary["rate"]
    text = (f"Lost its pending claim (#696, tracked, not a gate): {summary['lost']}/{summary['n']} ({rate:.1%}), "
            f"{summary['authority_passed']} of them passing the authority check")
    if summary["lost"]:
        text += ("; withheld as " + ", ".join(f"{k} x{v}" for k, v in summary["withheld_kinds"].items())
                 + "; scenarios " + ", ".join(f"{k} x{v}" for k, v in summary["scenarios"].items()))
    return text + "."
