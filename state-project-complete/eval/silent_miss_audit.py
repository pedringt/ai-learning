"""Human-calibrated sampling for State's silent no-Review decisions.

This is deliberately an offline/operational audit helper, not a second model
and not a mutation path. It reads already-persisted successful interpretation
records, samples cases whose structured outcome was ``no_review``, snapshots
human-review context, and stores reviewer judgments in a portable JSON bundle.

Nothing here changes Current State, creates Reviews, or edits Evidence.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import random
import tempfile
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from db import connect, project_id_of

AUDIT_OUTCOMES = {"correct", "missed", "ambiguous"}
MISS_SEVERITIES = {"low", "medium", "high", "critical"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _loads_structured_result(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def list_no_review_candidates(connection, *, project_id: str | None = None) -> list[dict[str, Any]]:
    """Return successful no-Review interpretations that created no Review link."""
    pid = project_id or project_id_of(connection)
    rows = connection.execute(
        "SELECT ir.id AS interpretation_record_id, ir.evidence_id, ir.provider, "
        "ir.model_identifier, ir.structured_result, ir.created_at AS interpreted_at, "
        "e.content AS evidence_content, e.source_type, e.submitted_at "
        "FROM interpretation_records ir "
        "JOIN evidence e ON e.id=ir.evidence_id "
        "WHERE ir.processing_status='succeeded' AND e.project_id=? "
        "AND NOT EXISTS (SELECT 1 FROM review_evidence re WHERE re.evidence_id=ir.evidence_id) "
        "ORDER BY ir.created_at DESC, ir.id DESC",
        (pid,),
    ).fetchall()

    candidates: list[dict[str, Any]] = []
    for row in rows:
        structured = _loads_structured_result(row["structured_result"])
        if structured.get("outcome") != "no_review":
            continue
        candidates.append(
            {
                "interpretation_record_id": row["interpretation_record_id"],
                "evidence_id": row["evidence_id"],
                "source_type": row["source_type"],
                "submitted_at": str(row["submitted_at"]),
                "interpreted_at": str(row["interpreted_at"]),
                "provider": row["provider"],
                "model_identifier": row["model_identifier"],
                "evidence_content": row["evidence_content"],
                "no_review_explanation": structured.get("no_review_explanation") or structured.get("summary") or "",
                "interpretation_summary": structured.get("summary") or "",
            }
        )
    return candidates


def select_sample(
    candidates: Iterable[Mapping[str, Any]],
    *,
    sample_size: int,
    seed: int | str | None = None,
    stratify_by_source: bool = True,
) -> list[dict[str, Any]]:
    """Select a bounded, reproducible sample without reviewing every case."""
    if sample_size < 0:
        raise ValueError("sample_size must be >= 0")
    items = [dict(item) for item in candidates]
    if sample_size >= len(items):
        return items
    if sample_size == 0:
        return []

    rng = random.Random(seed)
    if not stratify_by_source:
        return rng.sample(items, sample_size)

    buckets: dict[str, deque[dict[str, Any]]] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        grouped[str(item.get("source_type") or "unknown")].append(item)
    for key, bucket in grouped.items():
        rng.shuffle(bucket)
        buckets[key] = deque(bucket)

    keys = list(buckets)
    rng.shuffle(keys)
    selected: list[dict[str, Any]] = []
    while len(selected) < sample_size and keys:
        next_keys: list[str] = []
        for key in keys:
            bucket = buckets[key]
            if bucket and len(selected) < sample_size:
                selected.append(bucket.popleft())
            if bucket:
                next_keys.append(key)
        keys = next_keys
        rng.shuffle(keys)
    return selected


def _audit_context(connection, project_id: str) -> dict[str, Any]:
    current_state = [
        dict(row)
        for row in connection.execute(
            "SELECT id, topic, statement, version, effective_date FROM current_state_items "
            "WHERE project_id=? AND status='active' ORDER BY topic, id",
            (project_id,),
        ).fetchall()
    ]
    questions = [
        dict(row)
        for row in connection.execute(
            "SELECT id, text, status FROM questions WHERE project_id=? AND status='open' ORDER BY created_at, id",
            (project_id,),
        ).fetchall()
    ]
    reviews = [
        dict(row)
        for row in connection.execute(
            "SELECT id, review_type, decision_question, why_consequential, status FROM review_issues "
            "WHERE project_id=? AND status='open' ORDER BY created_at, id",
            (project_id,),
        ).fetchall()
    ]
    return {"current_state": current_state, "open_questions": questions, "open_reviews": reviews}


def create_audit_bundle(
    connection,
    *,
    sample_size: int = 10,
    seed: int | str | None = None,
    project_id: str | None = None,
    stratify_by_source: bool = True,
) -> dict[str, Any]:
    """Create a portable audit bundle with enough context for human review."""
    pid = project_id or project_id_of(connection)
    candidates = list_no_review_candidates(connection, project_id=pid)
    sampled = select_sample(
        candidates,
        sample_size=sample_size,
        seed=seed,
        stratify_by_source=stratify_by_source,
    )
    context = _audit_context(connection, pid)
    items = []
    for candidate in sampled:
        items.append(
            {
                **candidate,
                "context_snapshot": copy.deepcopy(context),
                "audit": {
                    "outcome": None,
                    "severity": None,
                    "failure_type": None,
                    "note": None,
                    "reviewed_at": None,
                },
            }
        )
    return {
        "schema_version": "silent-miss-audit-v1",
        "project_id": pid,
        "created_at": _now_iso(),
        "sampling": {
            "candidate_count": len(candidates),
            "sample_size_requested": sample_size,
            "sample_size_selected": len(items),
            "seed": seed,
            "stratify_by_source": bool(stratify_by_source),
        },
        "trace_note": "interpretation_record_id is retained for diagnosis; attach a dedicated trace/run ID when #141 provides one.",
        "items": items,
    }


def mark_audit_item(
    bundle: Mapping[str, Any],
    evidence_id: str,
    *,
    outcome: str,
    severity: str | None = None,
    failure_type: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Return a copy of the bundle with one human audit judgment recorded."""
    if outcome not in AUDIT_OUTCOMES:
        raise ValueError(f"outcome must be one of {sorted(AUDIT_OUTCOMES)}")
    if severity is not None and severity not in MISS_SEVERITIES:
        raise ValueError(f"severity must be one of {sorted(MISS_SEVERITIES)}")
    if outcome == "missed" and not severity:
        raise ValueError("severity is required when outcome='missed'")

    updated = copy.deepcopy(dict(bundle))
    for item in updated.get("items", []):
        if item.get("evidence_id") != evidence_id:
            continue
        item["audit"] = {
            "outcome": outcome,
            "severity": severity if outcome == "missed" else None,
            "failure_type": ((failure_type or "").strip() or None) if outcome == "missed" else None,
            "note": (note or "").strip() or None,
            "reviewed_at": _now_iso(),
        }
        return updated
    raise KeyError(f"evidence_id not found in audit bundle: {evidence_id}")


def summarize_audit(bundle: Mapping[str, Any]) -> dict[str, Any]:
    items = list(bundle.get("items", []))
    outcomes = Counter((item.get("audit") or {}).get("outcome") for item in items)
    correct = outcomes.get("correct", 0)
    missed = outcomes.get("missed", 0)
    ambiguous = outcomes.get("ambiguous", 0)
    denominator = correct + missed
    miss_rate = (missed / denominator) if denominator else None
    severity = Counter()
    failure_types = Counter()
    for item in items:
        audit = item.get("audit") or {}
        if audit.get("outcome") != "missed":
            continue
        if audit.get("severity"):
            severity[audit["severity"]] += 1
        if audit.get("failure_type"):
            failure_types[audit["failure_type"]] += 1
    return {
        "sample_size": len(items),
        "reviewed": correct + missed + ambiguous,
        "correct_no_review": correct,
        "confirmed_silent_misses": missed,
        "ambiguous": ambiguous,
        "miss_rate_among_decided": miss_rate,
        "miss_rate_denominator": denominator,
        "severity_distribution": dict(sorted(severity.items())),
        "recurring_failure_patterns": dict(failure_types.most_common()),
        "caution": "This sample is for trend detection and failure discovery, not a precise production-wide accuracy estimate.",
    }


def regression_candidates(bundle: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Export confirmed meaningful misses in a form suitable for eval drafting."""
    results = []
    for item in bundle.get("items", []):
        audit = item.get("audit") or {}
        if audit.get("outcome") != "missed":
            continue
        results.append(
            {
                "source": "silent_miss_audit",
                "evidence_id": item.get("evidence_id"),
                "interpretation_record_id": item.get("interpretation_record_id"),
                "evidence_content": item.get("evidence_content"),
                "previous_no_review_explanation": item.get("no_review_explanation"),
                "severity": audit.get("severity"),
                "failure_type": audit.get("failure_type"),
                "human_note": audit.get("note"),
                "expected_behavior": "Human-confirmed miss: future evals should surface the consequential change for Review without directly mutating Current State.",
            }
        )
    return results


def load_bundle(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_bundle(path: str | Path, bundle: Mapping[str, Any]) -> None:
    """Atomically persist the human audit record as JSON."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, delete=False) as handle:
        json.dump(bundle, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temp_name = handle.name
    Path(temp_name).replace(target)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sample and review State no-Review decisions for silent misses.")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="Create a new audit bundle from the database.")
    create.add_argument("output")
    create.add_argument("--database-url", default=os.getenv("DATABASE_URL", "sqlite:///state.db"))
    create.add_argument("--project-id", default=None)
    create.add_argument("--sample-size", type=int, default=10)
    create.add_argument("--seed", default=None)
    create.add_argument("--no-stratify", action="store_true")

    mark = sub.add_parser("mark", help="Record one human judgment in an existing bundle.")
    mark.add_argument("bundle")
    mark.add_argument("evidence_id")
    mark.add_argument("outcome", choices=sorted(AUDIT_OUTCOMES))
    mark.add_argument("--severity", choices=sorted(MISS_SEVERITIES))
    mark.add_argument("--failure-type")
    mark.add_argument("--note")

    summary = sub.add_parser("summary", help="Print the audit summary.")
    summary.add_argument("bundle")

    export = sub.add_parser("export-regressions", help="Export confirmed misses as eval/regression candidates.")
    export.add_argument("bundle")
    export.add_argument("output")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "create":
        with connect(args.database_url) as connection:
            connection.project_id = args.project_id or connection.project_id
            bundle = create_audit_bundle(
                connection,
                sample_size=args.sample_size,
                seed=args.seed,
                project_id=args.project_id,
                stratify_by_source=not args.no_stratify,
            )
        save_bundle(args.output, bundle)
        print(json.dumps(summarize_audit(bundle), indent=2, sort_keys=True))
        return 0
    if args.command == "mark":
        bundle = load_bundle(args.bundle)
        updated = mark_audit_item(
            bundle,
            args.evidence_id,
            outcome=args.outcome,
            severity=args.severity,
            failure_type=args.failure_type,
            note=args.note,
        )
        save_bundle(args.bundle, updated)
        print(json.dumps(summarize_audit(updated), indent=2, sort_keys=True))
        return 0
    if args.command == "summary":
        print(json.dumps(summarize_audit(load_bundle(args.bundle)), indent=2, sort_keys=True))
        return 0
    if args.command == "export-regressions":
        candidates = regression_candidates(load_bundle(args.bundle))
        save_bundle(args.output, {"schema_version": "silent-miss-regression-candidates-v1", "items": candidates})
        print(f"Exported {len(candidates)} confirmed miss(es) to {args.output}")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())