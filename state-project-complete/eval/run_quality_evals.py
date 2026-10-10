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
                "proposed_state_text": r.proposed_state_text,
                "rationale_text": r.rationale_text,
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


def _failure_details(report: dict) -> list[dict]:
    details = []
    is_review = report["suite"] == "review_interpretation"
    for row in report["results"]:
        if row.get("passed"):
            continue
        if is_review:
            failed_checks = [
                name for name, ok in (
                    ("review_needed", row.get("review_needed_correct")),
                    ("interpretation", row.get("interpretation_correct")),
                )
                if ok is False
            ]
            if row.get("processing_status") and row.get("processing_status") != "succeeded":
                failed_checks.append("processing")
            expected = row.get("expected_action")
            observed_action = row.get("observed_action") or row.get("processing_status") or row.get("error")
            proposal = str(row.get("proposed_state_text") or "").strip()
            observed = observed_action
            if proposal:
                observed += " | proposed State: " + proposal[:180]
        else:
            failed_checks = [
                name for name, ok in (
                    ("grounding", row.get("grounding_ok")),
                    ("required_facts", row.get("required_facts_ok")),
                    ("forbidden_claims", row.get("forbidden_claims_ok")),
                    ("uncertainty", row.get("uncertainty_ok")),
                    ("open_item", row.get("open_item_ok")),
                    ("authority", row.get("authority_ok")),
                )
                if ok is False
            ]
            expected = "Grounded answer that preserves uncertainty, open items, and decision authority"
            observed = "Failed checks: " + ", ".join(failed_checks) if failed_checks else (row.get("error") or "Behavior did not meet the controlled expectation")
        details.append({
            "scenario_id": row["id"],
            "category": row.get("category"),
            "severity": row.get("severity", "medium"),
            "expected": str(expected)[:240] if expected else None,
            "observed": str(observed)[:240] if observed else None,
            "failed_checks": failed_checks[:8],
        })
    return details[:16]


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
        "failure_details": _failure_details(report),
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
            if not row.get("error") and "grounding_ok" in row:
                # Ask rows have no expected/observed action; say which checks failed (#484 follow-up:
                # the workflow log used to print an empty line for these).
                checks = ("grounding_ok", "required_facts_ok", "forbidden_claims_ok", "uncertainty_ok", "open_item_ok", "authority_ok")
                detail = "failed " + ", ".join(c.removesuffix("_ok") for c in checks if row.get(c) is False)
            print(f"    - {row['id']}: {detail}")
            # Synthetic scenarios only: a short excerpt of what the model produced, so a failure can
            # be diagnosed from the workflow log without a local paid re-run.
            answer = row.get("answer") if isinstance(row.get("answer"), dict) else {}
            body = answer.get("answer") if isinstance(answer.get("answer"), dict) else answer
            ask_text = f"{body.get('headline') or ''} — {body.get('summary') or ''}".strip(" —") if body else ""
            excerpt = " ".join(str(row.get("proposed_state_text") or ask_text or "").split())
            if excerpt:
                print(f"      output: {excerpt[:240]}{'...' if len(excerpt) > 240 else ''}")
            rationale = " ".join(str(row.get("rationale_text") or "").split())
            if rationale:
                print(f"      rationale: {rationale[:240]}{'...' if len(rationale) > 240 else ''}")


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
