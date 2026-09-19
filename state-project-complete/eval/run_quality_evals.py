#!/usr/bin/env python3
"""Run State's Review-interpretation and Ask-quality eval suites.

Requires a real ANTHROPIC_API_KEY. The detailed local report may contain test
case material; optional Product Analytics ingestion sends aggregate metrics
only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "interpretation_runtime"))

from eval.env import load_local_env

load_local_env()

from anthropic_provider import AnthropicProvider
from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS
from eval.quality_harness import (
    ask_quality_metrics,
    review_quality_metrics,
    run_ask_quality_scenario,
    run_review_quality_scenario,
)
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW_SCENARIOS


def _record(url: str, key: str, payload: dict) -> None:
    request = urllib.request.Request(
        url.rstrip("/") + "/api/admin/quality-eval-runs",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-State-Eval-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status >= 300:
            raise RuntimeError(f"Eval ingestion returned HTTP {response.status}")


def _review_report(provider) -> dict:
    started = time.time()
    results = [run_review_quality_scenario(scenario, provider) for scenario in REVIEW_SCENARIOS]
    metrics = review_quality_metrics(results)
    return {
        "suite": "review_interpretation",
        "elapsed_seconds": round(time.time() - started, 2),
        "summary": metrics,
        "results": [
            {
                "id": r.scenario.id,
                "category": r.scenario.category,
                "severity": r.scenario.severity,
                "expected_review_needed": r.scenario.review_needed,
                "actual_review_needed": r.review_recommended,
                "expected_action": r.scenario.expected_action,
                "observed_action": r.observed_action,
                "review_needed_correct": r.review_needed_correct,
                "interpretation_correct": r.interpretation_correct,
                "passed": r.passed,
                "processing_status": r.processing_status,
                "error": r.error,
                "trace_id": r.trace_id,
                "trace_path": r.trace_path,
            }
            for r in results
        ],
    }


def _ask_report(provider) -> dict:
    started = time.time()
    results = [run_ask_quality_scenario(scenario, provider) for scenario in ASK_SCENARIOS]
    metrics = ask_quality_metrics(results)
    return {
        "suite": "ask_quality",
        "elapsed_seconds": round(time.time() - started, 2),
        "summary": metrics,
        "results": [
            {
                "id": r.scenario.id,
                "category": r.scenario.category,
                "severity": r.scenario.severity,
                "grounding_ok": r.grounding_ok,
                "required_facts_ok": r.required_facts_ok,
                "forbidden_claims_ok": r.forbidden_claims_ok,
                "uncertainty_ok": r.uncertainty_ok,
                "open_item_ok": r.open_item_ok,
                "authority_ok": r.authority_ok,
                "passed": r.passed,
                "error": r.error,
                "answer": r.answer,
            }
            for r in results
        ],
    }


def _analytics_payload(report: dict, provider) -> dict:
    summary = report["summary"]
    common = {
        "suite": report["suite"],
        "run_kind": "controlled_eval",
        "build": os.getenv("RENDER_GIT_COMMIT", os.getenv("GITHUB_SHA", "local"))[:120],
        "provider": getattr(provider, "name", "anthropic"),
        "model_identifier": getattr(provider, "model_identifier", os.getenv("CLAUDE_MODEL", "configured-default"))[:160],
        "total": summary["total"],
        "errors": summary["errors"],
        "high_severity_failures": summary["high_severity_failures"],
    }
    if report["suite"] == "review_interpretation":
        common.update({
            "precision": summary["precision"],
            "recall": summary["recall"],
            "false_positives": summary["false_positives"],
            "false_negatives": summary["false_negatives"],
            "interpretation_accuracy": summary["interpretation_accuracy"],
        })
    else:
        common.update({
            "ask_grounding": summary["ask_grounding"],
            "uncertainty_accuracy": summary["uncertainty_accuracy"],
            "open_item_accuracy": summary["open_item_accuracy"],
            "authority_accuracy": summary["authority_accuracy"],
            "overall_pass_rate": summary["overall_pass_rate"],
        })
    return common


def _print_report(report: dict) -> None:
    summary = report["summary"]
    print(f"\n{report['suite']} ({summary['total']} cases, {report['elapsed_seconds']:.1f}s)")
    for key, value in summary.items():
        if key == "total":
            continue
        if isinstance(value, float):
            print(f"  {key}: {value:.1%}")
        else:
            print(f"  {key}: {value}")
    failed = [row for row in report["results"] if not row["passed"]]
    if failed:
        print("  failures:")
        for row in failed:
            detail = row.get("error") or f"{row.get('expected_action', '')} -> {row.get('observed_action', '')}".strip(" ->")
            print(f"    - {row['id']}: {detail}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=("all", "review", "ask"), default="all")
    parser.add_argument("--json", metavar="PATH", help="write the detailed local report")
    parser.add_argument("--record-url", metavar="URL", help="State API base URL for aggregate eval ingestion")
    parser.add_argument("--record-key", metavar="KEY", help="defaults to STATE_EVAL_INGEST_KEY")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because these evals measure real model judgment.")
        return 0

    provider = AnthropicProvider()
    reports = []
    if args.suite in {"all", "review"}:
        reports.append(_review_report(provider))
    if args.suite in {"all", "ask"}:
        reports.append(_ask_report(provider))

    for report in reports:
        _print_report(report)

    if args.json:
        Path(args.json).write_text(json.dumps({"reports": reports}, indent=2))
        print(f"\nWrote detailed report to {args.json}")

    if args.record_url:
        key = args.record_key or os.getenv("STATE_EVAL_INGEST_KEY", "")
        if not key:
            print("\nEval results were not recorded: STATE_EVAL_INGEST_KEY is not set.")
        else:
            for report in reports:
                try:
                    _record(args.record_url, key, _analytics_payload(report, provider))
                    print(f"Recorded aggregate {report['suite']} metrics in State Product Analytics.")
                except Exception as exc:
                    print(f"WARNING: {report['suite']} ran, but analytics ingestion failed: {exc}")

    has_failure = any(any(not row["passed"] for row in report["results"]) for report in reports)
    return 1 if has_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
