"""DEC-023 item 6 (#653): should Copy Context keep only the records relevant to the task text? Measured, not decided.

Copy Context ("Working context" mode) copies every Current State item, pending Review and open Question. This
measures, on the #653 benchmark fixture and with no model call, what a deterministic filter on the "What are you
working on?" text would keep: the share of each task's needed records that survive, and how much smaller the copy
gets. The needed records are true by construction (the cases and records were written together).

Nothing in the product changes. `python -m eval.run_copy_context_benchmark` prints the table.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping

from eval import retrieval_benchmark as rb

COPY_BUCKETS = ("state", "reviews", "questions")


@dataclass(frozen=True)
class TaskCase:
    id: str
    task: str
    needed: tuple[str, ...]
    note: str = ""


CASES: tuple[TaskCase, ...] = (
    TaskCase("t1", "Prepare the Corvo vendor contract renewal", ("s-retention", "r-retention", "r-contract-sign")),
    TaskCase("t2", "Write the public launch announcement", ("s-public-launch", "s-languages")),
    TaskCase("t3", "Plan agent training and onboarding", ("s-agent-cohorts", "r-cohorts", "q-open-01")),
    TaskCase("t4", "Draft the accessibility conformance response", ("s-web-access", "r-control")),
    TaskCase("t5", "Budget review with the finance director", ("s-budget", "s-pilot-budget")),
    TaskCase("t6", "Redesign email notifications", ("s-notifications", "r-notify")),
    TaskCase("t7", "Refund handling for Tier 1", ("q-open-05", "s-escalation")),
    TaskCase("t8", "Security review of single sign-on for external staff", ("s-identity",)),
    TaskCase("t9", "Forecast ticket volume and staffing", ("s-volume", "r-volume", "s-staffing")),
    TaskCase("t10", "Clean up plan names in the glossary", ("s-glossary", "r-glossary")),
    TaskCase("t11", "Write the go-live checklist", ("s-public-launch",), "paraphrase: no shared word"),
    TaskCase("t12", "Weekend coverage schedule", ("s-staffing",), "only 'weekend' is shared"),
)


def copy_records(connection: Any) -> dict[str, list[dict]]:
    """What Copy Context's Working mode copies: every Current State item, open Review and open Question."""
    connection.project_id = rb.PROJECT
    full = rb.pool(connection, None)
    return {bucket: list(full[bucket]) for bucket in COPY_BUCKETS}


def copy_text(records: Mapping[str, list[dict]]) -> str:
    """The copied lines, shaped like buildContextText (context-product-polish.js), without the fixed header."""
    lines = [f"- {r.get('topic')}: {r.get('statement')}" for r in records.get("state", [])]
    lines += [f"- [Needs review] {r.get('decision_question')}" for r in records.get("reviews", [])]
    lines += [f"- [{'Blocking' if r.get('blocking') else 'Open question'}] {r.get('text')}" for r in records.get("questions", [])]
    return "\n".join(lines)


def _ranked(task: str, records: Mapping[str, list[dict]], score: Callable[[set[str], Mapping], float],
            terms: set[str], cap: int | None, matched_only: bool) -> dict[str, list[dict]]:
    out = {}
    for bucket in COPY_BUCKETS:
        scored = sorted(((score(terms, r), -i, r) for i, r in enumerate(records[bucket])), key=lambda x: (x[0], x[1]), reverse=True)
        kept = [r for s, _, r in scored if (s > 0 or not matched_only)]
        out[bucket] = kept[:cap] if cap else kept
    return out


def _bm25(records: Mapping[str, list[dict]]) -> Callable[[set[str], Mapping], float]:
    full = {b: records[b] for b in COPY_BUCKETS}
    pool = {**{b: [] for b in rb.BUCKETS}, **full}
    # Reuse the benchmark's BM25 scoring by ranking the whole copy pool once per call.
    import math
    docs = [rb._record_tokens(r) for b in COPY_BUCKETS for r in pool[b]]
    n, avg = len(docs) or 1, (sum(len(d) for d in docs) / max(1, len(docs))) or 1
    df: dict[str, int] = {}
    for d in docs:
        for t in set(d):
            df[t] = df.get(t, 0) + 1

    def score(terms: set[str], record: Mapping) -> float:
        toks = rb._record_tokens(record)
        total = 0.0
        for t in terms:
            tf = toks.count(t)
            if tf:
                idf = math.log(1 + (n - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
                total += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len(toks) / avg))
        return total
    return score


def variants(records: Mapping[str, list[dict]]) -> dict[str, Callable[[str], dict[str, list[dict]]]]:
    bm25 = _bm25(records)
    today = rb._today_score
    return {
        "everything (today)": lambda task: {b: list(records[b]) for b in COPY_BUCKETS},
        "word match, matched only": lambda task: _ranked(task, records, today, rb._today_terms(task), None, True),
        "word match, top 8 per type": lambda task: _ranked(task, records, today, rb._today_terms(task), 8, False),
        "BM25, matched only": lambda task: _ranked(task, records, bm25, set(rb._tokens(task)), None, True),
        "BM25, top 8 per type": lambda task: _ranked(task, records, bm25, set(rb._tokens(task)), 8, False),
    }


def run(connection: Any) -> dict[str, Any]:
    records = copy_records(connection)
    full_chars = len(copy_text(records))
    results = {}
    for name, fn in variants(records).items():
        rows = []
        for case in CASES:
            kept = fn(case.task)
            ids = {r["id"] for b in COPY_BUCKETS for r in kept[b]}
            rows.append({"case": case.id, "recall": len(set(case.needed) & ids) / len(case.needed),
                         "missed": sorted(set(case.needed) - ids), "items": len(ids), "chars": len(copy_text(kept))})
        results[name] = {
            "recall": round(sum(r["recall"] for r in rows) / len(rows), 3),
            "all_needed_kept": round(sum(1 for r in rows if r["recall"] == 1) / len(rows), 3),
            "mean_items": round(sum(r["items"] for r in rows) / len(rows), 1),
            "mean_chars": round(sum(r["chars"] for r in rows) / len(rows)),
            "share_of_full": round(sum(r["chars"] for r in rows) / len(rows) / full_chars, 3),
            "rows": rows,
        }
    return {"full_items": sum(len(records[b]) for b in COPY_BUCKETS), "full_chars": full_chars, "variants": results}


def format_table(result: Mapping[str, Any]) -> str:
    lines = [f"Full copy: {result['full_items']} items, {result['full_chars']:,} chars",
             f"{'variant':30} {'recall':>6} {'all kept':>8} {'items':>6} {'chars':>7} {'of full':>7}"]
    for name, v in result["variants"].items():
        lines.append(f"{name:30} {v['recall']:6.3f} {v['all_needed_kept']:8.3f} {v['mean_items']:6} {v['mean_chars']:7,} {v['share_of_full']:7.0%}")
    return "\n".join(lines)
