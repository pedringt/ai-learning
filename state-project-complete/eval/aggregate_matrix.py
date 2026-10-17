#!/usr/bin/env python3
"""Summarize eval-matrix repeat files (eval/matrix.py) into per-scenario pass rates with 95% intervals.

    python -m eval.aggregate_matrix matrix-results --out matrix-summary.md --json matrix-summary.json

Reads every ``*.json`` under the directory (recursively) whose schema is the matrix's. Errors and
timeouts are counted apart from behaviour failures and are left out of pass rates. When
GITHUB_STEP_SUMMARY is set, the Markdown is appended to it. Makes no model calls and loads no .env.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.matrix import PRICING, PRICING_SOURCE, SCHEMA, call_cost


def wilson_interval(passes: int, n: int, z: float = 1.959964) -> tuple[float, float] | None:
    """95% Wilson score interval for a pass rate; None when n is 0."""
    if n <= 0:
        return None
    p = passes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def percentile(values: list[float], q: float) -> float | None:
    """Nearest-rank percentile (q in 0..100)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(q / 100 * len(ordered)))
    return ordered[rank - 1]


def load_repeats(paths: Iterable[Path]) -> list[dict[str, Any]]:
    repeats = []
    for path in paths:
        try:
            data = json.loads(Path(path).read_text())
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("schema") == SCHEMA:
            repeats.append(data)
    # The same repeat can arrive twice (a re-run job); keep the last one per suite/model/repeat.
    unique: dict[tuple, dict[str, Any]] = {}
    for data in repeats:
        unique[(data.get("suite"), data.get("model"), data.get("repeat"))] = data
    return [unique[k] for k in sorted(unique, key=lambda k: (str(k[0]), str(k[1]), k[2] if isinstance(k[2], int) else -1))]


def load_dir(directory: Path) -> list[dict[str, Any]]:
    return load_repeats(sorted(Path(directory).rglob("*.json")))


def _rate(passes: int, n: int) -> float | None:
    return passes / n if n else None


def _grader_scores(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per grader dimension (graded suite only): answers graded, mean score, and the share scored 1 and 2."""
    by_dim: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        for name, score in (row.get("scores") or {}).items():
            by_dim[name].append(int(score))
    return {name: {"n": len(v), "mean": sum(v) / len(v), "share_1": v.count(1) / len(v), "share_2": v.count(2) / len(v)}
            for name, v in by_dim.items() if v}


def aggregate(repeats: list[dict[str, Any]]) -> dict[str, Any]:
    suites: dict[str, dict[str, Any]] = {}
    for rep in repeats:
        suite = rep["suite"]
        model = rep.get("model")
        s = suites.setdefault(suite, {"suite": suite, "models": set(), "repeats": set(), "incomplete_repeats": 0,
                                      "rows": [], "calls": 0})
        s["models"].add(model)
        s["repeats"].add(rep.get("repeat"))
        s["calls"] += int(rep.get("calls") or 0)
        if not rep.get("complete", True):
            s["incomplete_repeats"] += 1
        for row in rep.get("results", []):
            s["rows"].append((model, row))

    out_suites = []
    totals = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "unpriced_calls": 0}
    for suite in sorted(suites):
        s = suites[suite]
        scenarios: dict[str, dict[str, Any]] = {}
        latencies, inp, outp, cost, unpriced = [], 0, 0, 0.0, 0
        outcomes = Counter()
        for model, row in s["rows"]:
            outcome = row.get("outcome") or "error"
            outcomes[outcome] += 1
            sc = scenarios.setdefault(row.get("scenario_id"), {
                "scenario_id": row.get("scenario_id"), "category": row.get("category"), "severity": row.get("severity"),
                "runs": 0, "n": 0, "passes": 0, "errors": 0, "timeouts": 0, "unscored": 0, "not_run": 0,
                "failure_modes": Counter(), "error_messages": Counter(), "checks": defaultdict(lambda: [0, 0]),
                "observed": Counter(),
            })
            if outcome == "not_run":
                sc["not_run"] += 1
                continue
            sc["runs"] += 1
            if outcome in ("pass", "fail"):
                sc["n"] += 1
                sc["passes"] += outcome == "pass"
            elif outcome == "timeout":
                sc["timeouts"] += 1
            elif outcome == "error":
                sc["errors"] += 1
            else:
                sc["unscored"] += 1
            if outcome == "fail" and row.get("failure_mode"):
                sc["failure_modes"][row["failure_mode"]] += 1
            if outcome == "checked" and row.get("failure_mode"):
                sc["failure_modes"][row["failure_mode"]] += 1
            if outcome in ("error", "timeout"):
                sc["error_messages"][str(row.get("failure_mode") or row.get("error") or outcome)[:160]] += 1
            if outcome == "unscored" and row.get("observed"):
                sc["observed"][row["observed"]] += 1
            for name, ok in (row.get("checks") or {}).items():
                if ok is None:
                    continue
                sc["checks"][name][0] += bool(ok)
                sc["checks"][name][1] += 1
            if row.get("latency_ms") is not None:
                latencies.append(row["latency_ms"])
            for use in row.get("call_usage") or []:
                inp += use.get("input_tokens") or 0
                outp += use.get("output_tokens") or 0
                priced_as = use.get("model") or model  # graded runs mix the Ask model and the grader model
                if priced_as in PRICING:
                    cost += call_cost(priced_as, use.get("input_tokens"), use.get("output_tokens"))
                else:
                    unpriced += 1
        scenario_rows = []
        for sid in sorted(scenarios):
            sc = scenarios[sid]
            interval = wilson_interval(sc["passes"], sc["n"])
            scenario_rows.append({
                "scenario_id": sid, "category": sc["category"], "severity": sc["severity"],
                "runs": sc["runs"], "n": sc["n"], "passes": sc["passes"], "pass_rate": _rate(sc["passes"], sc["n"]),
                "ci95": list(interval) if interval else None,
                "errors": sc["errors"], "timeouts": sc["timeouts"], "unscored": sc["unscored"], "not_run": sc["not_run"],
                "failure_modes": dict(sc["failure_modes"].most_common()),
                "error_messages": dict(sc["error_messages"].most_common()),
                "observed_when_unscored": dict(sc["observed"]),
                "checks": {name: {"passes": v[0], "n": v[1], "rate": _rate(v[0], v[1]),
                                  "ci95": list(wilson_interval(v[0], v[1]) or ()) or None}
                           for name, v in sorted(sc["checks"].items())},
            })
        n = sum(r["n"] for r in scenario_rows)
        passes = sum(r["passes"] for r in scenario_rows)
        check_totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for r in scenario_rows:
            for name, c in r["checks"].items():
                check_totals[name][0] += c["passes"]
                check_totals[name][1] += c["n"]
        interval = wilson_interval(passes, n)
        out_suites.append({
            "suite": suite, "models": sorted(m for m in s["models"] if m), "repeats": len(s["repeats"]),
            "incomplete_repeats": s["incomplete_repeats"], "n": n, "passes": passes, "pass_rate": _rate(passes, n),
            "ci95": list(interval) if interval else None,
            "outcomes": dict(outcomes), "errors": outcomes["error"], "timeouts": outcomes["timeout"],
            "checks": {name: {"passes": v[0], "n": v[1], "rate": _rate(v[0], v[1])} for name, v in sorted(check_totals.items())},
            "latency_ms_p50": percentile(latencies, 50), "latency_ms_p95": percentile(latencies, 95),
            "calls": s["calls"], "input_tokens": inp, "output_tokens": outp, "cost_usd": cost, "unpriced_calls": unpriced,
            "scenarios": scenario_rows,
            "grader_scores": _grader_scores([row for _model, row in s["rows"]]),
        })
        totals["calls"] += s["calls"]
        totals["input_tokens"] += inp
        totals["output_tokens"] += outp
        totals["cost_usd"] += cost
        totals["unpriced_calls"] += unpriced
    return {"suites": out_suites, "totals": totals, "pricing_source": PRICING_SOURCE}


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0%}"


def _ci(ci: list[float] | None) -> str:
    return "n/a" if not ci else f"{ci[0]:.0%}-{ci[1]:.0%}"


def _cell(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def to_markdown(summary: dict[str, Any]) -> str:
    t = summary["totals"]
    lines = ["## State eval matrix", ""]
    lines.append(f"Calls {t['calls']} | input tokens {t['input_tokens']:,} | output tokens {t['output_tokens']:,} | "
                 f"estimated cost ${t['cost_usd']:.4f} (actual usage x list price; {summary['pricing_source']})"
                 + (f" | {t['unpriced_calls']} call(s) on an unpriced model" if t["unpriced_calls"] else ""))
    lines.append("")
    lines.append("Pass rates count only scored runs: errors and timeouts are listed separately and are not failures. "
                 "Intervals are 95% Wilson intervals.")
    for s in summary["suites"]:
        lines += ["", f"### {s['suite']} ({', '.join(s['models']) or 'unknown model'}, {s['repeats']} repeat(s)"
                  + (f", {s['incomplete_repeats']} stopped early" if s["incomplete_repeats"] else "") + ")", ""]
        if s["n"]:
            lines.append(f"Overall pass rate **{_pct(s['pass_rate'])}** ({s['passes']}/{s['n']}, 95% CI {_ci(s['ci95'])}).")
        else:
            lines.append("No overall pass/fail for this suite: it reports per-check rates (below).")
        lines.append(f"Errors {s['errors']}, timeouts {s['timeouts']}. Latency per scenario p50 "
                     f"{s['latency_ms_p50'] if s['latency_ms_p50'] is not None else 'n/a'} ms, p95 "
                     f"{s['latency_ms_p95'] if s['latency_ms_p95'] is not None else 'n/a'} ms. "
                     f"Calls {s['calls']}, tokens {s['input_tokens']:,} in / {s['output_tokens']:,} out, ${s['cost_usd']:.4f}.")
        if s["checks"]:
            lines.append("Checks: " + ", ".join(f"{name} {_pct(c['rate'])} ({c['passes']}/{c['n']})" for name, c in s["checks"].items()))
        if s.get("grader_scores"):
            lines += ["", "LLM grader (observed only, not a gate until calibrated; 1-4, higher is better):", "",
                      "| Dimension | Answers | Mean | Scored 1 | Scored 2 |", "|---|---|---|---|---|"]
            for name, g in s["grader_scores"].items():
                lines.append(f"| {name} | {g['n']} | {g['mean']:.2f} | {_pct(g['share_1'])} | {_pct(g['share_2'])} |")
        lines += ["", "| Scenario | n | Passes | Pass rate | 95% CI | Errors | Timeouts | Failure modes |", "|---|---|---|---|---|---|---|---|"]
        for r in sorted(s["scenarios"], key=lambda r: (r["pass_rate"] if r["pass_rate"] is not None else 2, r["scenario_id"])):
            modes = "; ".join(f"{m} x{c}" for m, c in r["failure_modes"].items())
            if r["error_messages"]:
                modes = (modes + "; " if modes else "") + "errors: " + "; ".join(f"{m} x{c}" for m, c in r["error_messages"].items())
            if r["observed_when_unscored"]:
                modes = (modes + "; " if modes else "") + "unscored (ambiguous): " + ", ".join(f"{k} x{v}" for k, v in r["observed_when_unscored"].items())
            if r["n"] == 0 and r["checks"]:
                modes = (modes + "; " if modes else "") + "checks: " + ", ".join(
                    f"{k} {c['passes']}/{c['n']}" for k, c in r["checks"].items())
            lines.append(f"| {_cell(r['scenario_id'])} | {r['n']} | {r['passes']} | {_pct(r['pass_rate'])} | {_ci(r['ci95'])} | "
                         f"{r['errors']} | {r['timeouts']} | {_cell(modes[:600]) or ''} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("directory", help="directory holding the repeat JSON files (searched recursively)")
    parser.add_argument("--out", metavar="PATH", help="write the Markdown summary here")
    parser.add_argument("--json", metavar="PATH", help="write the machine-readable summary here")
    args = parser.parse_args(argv)
    summary = aggregate(load_dir(Path(args.directory)))
    markdown = to_markdown(summary)
    print(markdown)
    if args.out:
        Path(args.out).write_text(markdown)
    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=2))
    step_summary = os.getenv("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a") as handle:
            handle.write(markdown)
    return 0 if summary["suites"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
