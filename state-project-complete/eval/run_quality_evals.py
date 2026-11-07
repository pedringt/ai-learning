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
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.env import load_local_env

load_local_env()

from anthropic_provider import AnthropicProvider
from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS
from eval.quality_harness import (
    answer_excerpt,
    ask_quality_metrics,
    review_quality_metrics,
    run_ask_quality_scenario,
    run_review_quality_scenario,
)
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW_SCENARIOS
from eval.authority_lab_export import build_envelope
from eval.scoring_version import scoring_version
from eval.quality_report import analytics_payload as _analytics_payload, failure_details as _failure_details
from eval.release_gate import ASK_SUITE, REVIEW_SUITE, fetch_analytics, gate, previous_failed_ids


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
    started_at = datetime.now(timezone.utc).isoformat()
    results = [run_review_quality_scenario(scenario, provider) for scenario in REVIEW_SCENARIOS]
    metrics = review_quality_metrics(results)
    return {
        "suite": "review_interpretation",
        "scoring_version": scoring_version("review_interpretation"),
        "started_at": started_at,
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
                "failed_items": r.interpretation_problems,
                "passed": r.passed,
                "processing_status": r.processing_status,
                "error": r.error,
                "trace_id": r.trace_id,
                "trace_path": r.trace_path,
                "proposed_state_text": r.proposed_state_text,
                "review_prose": r.review_prose,
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
        "scoring_version": scoring_version("ask_quality"),
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
                "failed_items": r.failed_items,
                # #643: the sentence holding the first asserted claim or invented number, else the headline.
                "answer_excerpt": answer_excerpt(r.answer, [*r.asserted_claims, *r.unsupported_numbers]) if r.answer else "",
                "passed": r.passed,
                "error": r.error,
                "answer": r.answer,
            }
            for r in results
        ],
    }


def _print_report(report: dict) -> None:
    summary = report["summary"]
    print(f"\n{report['suite']} ({summary['total']} cases, {report['elapsed_seconds']:.1f}s, scoring {report.get('scoring_version')})")
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
            for item in row.get("failed_items") or []:
                print(f"      {item}")
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
    parser.add_argument("--authority-lab-envelope", metavar="PATH", help="write the review suite's aggregate results as Authority Lab evidence (#517)")
    parser.add_argument("--dry-run", action="store_true", help="print the planned paid model calls and exit without calling the model")
    args = parser.parse_args()

    if args.dry_run:
        from eval.matrix import dry_run_summary

        print(dry_run_summary(["review", "ask"] if args.suite == "all" else [args.suite]))
        return 0

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

    # The previous recorded runs, read before this run is recorded (for "failed in two consecutive runs").
    analytics = fetch_analytics(args.record_url) if args.record_url else None
    previous = {suite: (previous_failed_ids(analytics, suite) if analytics else None) for suite in (REVIEW_SUITE, ASK_SUITE)}

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

    if args.authority_lab_envelope:
        review = next((r for r in reports if r["suite"] == "review_interpretation"), None)
        if review is None:
            print("\nNo Authority Lab evidence written: only the review suite is exported (run with --suite review or all).")
        else:
            payload = _analytics_payload(review, provider)
            envelope = build_envelope(review, provider=payload["provider"], model=payload["model_identifier"], build=payload["build"],
                                      env=os.environ, started_at=datetime.fromisoformat(review["started_at"]))
            Path(args.authority_lab_envelope).write_text(json.dumps(envelope, indent=2) + "\n")
            print(f"\nWrote Authority Lab evidence {envelope['id']} to {args.authority_lab_envelope}")

    # RELEASE.md's reading rules decide the exit code, not "any miss" (Oct 19).
    reasons = gate(reports, {REVIEW_SUITE: REVIEW_SCENARIOS, ASK_SUITE: ASK_SCENARIOS}, previous)
    print("\nRelease reading (RELEASE.md):")
    for suite, why in reasons.items():
        note = "" if previous.get(suite) is not None else " (previous run unknown, consecutive check skipped)"
        print(f"  {suite}: " + ("FAIL - " + "; ".join(why) if why else "pass") + note)
    return 1 if any(reasons.values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
