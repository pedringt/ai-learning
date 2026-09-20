"""Reusable core of the meeting-prep shape measurement (#246). Safe to import from tests.

Importing this module never loads `.env` and never calls a model (issue #224): only the runnable script
`eval/run_meeting_prep_shape.py` loads the local `.env`. See that script for how to run the paid measurement.
"""
from __future__ import annotations

import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

from eval.meeting_prep_shape import PROJECTS, QUERIES, shape_report, summarize

LEGACY_GUIDANCE = "For meeting prep: use at most 4 sections, at most 4 items per section, and at most 3 established Current State items."
PROMPTS = ("new", "legacy", "both")


def _real_ask_provider():
    """The Ask provider the deployed app uses: the configured interpretation provider wrapped in LiveAskProvider."""
    from ask_provider import LiveAskProvider
    from baseline_setup import _provider_from_env

    return LiveAskProvider(_provider_from_env(SimpleNamespace(provider="anthropic")))


def _seed(database_path: str) -> None:
    from database_migration_backed import initialize_db
    from db import connect
    from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data

    connection = connect(f"sqlite://{database_path}")
    try:
        initialize_db(connection)
        bootstrap_demo_data(connection)
        bootstrap_juniper_demo_data(connection)
        connection.commit()
    finally:
        connection.close()


def _ask_raw_answer(provider, database_path: str, project_id: str, query: str) -> dict:
    """The model's raw `answer` for `query`, exactly as the app's one-call Ask path asks for it, before trimming."""
    from ask_service import _compact_candidates, _one_call_prompt, _retrieval_query, _trim_candidates_for_query
    from db import connect

    connection = connect(f"sqlite://{database_path}")
    try:
        connection.project_id = project_id
        candidates = _trim_candidates_for_query(_retrieval_query(query, None), _compact_candidates(connection))
    finally:
        connection.close()
    combined = provider.run(_one_call_prompt(query, candidates, None))
    return dict(combined.get("answer") or {})


def run(provider, *, prompt_variants, repeats: int, projects=PROJECTS, queries=QUERIES) -> dict:
    import ask_service

    started = time.time()
    real_guidance = ask_service.meeting_prep_shape_guidance
    results: dict[str, list[dict]] = {v: [] for v in prompt_variants}
    with tempfile.TemporaryDirectory() as tmp:
        database_path = str(Path(tmp) / "shape.db")
        _seed(database_path)
        try:
            for variant in prompt_variants:
                ask_service.meeting_prep_shape_guidance = (lambda: LEGACY_GUIDANCE) if variant == "legacy" else real_guidance
                for project in projects:
                    for query_id, query in queries.items():
                        for attempt in range(repeats):
                            call_started = time.time()
                            entry = {"prompt": variant, "project": project, "query": query_id, "attempt": attempt}
                            try:
                                answer = _ask_raw_answer(provider, database_path, project, query)
                                entry["report"] = shape_report(answer)
                                entry["answer"] = answer          # kept so a person can read what the model wrote
                            except Exception as exc:
                                entry["report"] = {"valid": False, "applies": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}
                            entry["elapsed_s"] = round(time.time() - call_started, 2)
                            results[variant].append(entry)
        finally:
            ask_service.meeting_prep_shape_guidance = real_guidance
    return {
        "suite": "meeting_prep_shape", "repeats": repeats, "elapsed_seconds": round(time.time() - started, 2),
        "variants": {v: {"summary": summarize(e["report"] for e in runs), "runs": runs} for v, runs in results.items()},
    }


def _fmt(value):
    return "n/a" if value is None else (f"{value:.0%}" if isinstance(value, float) and value <= 1 else str(value))


def print_report(report: dict) -> None:
    print(f"\nmeeting_prep_shape ({report['repeats']} run(s) per project x query, {report['elapsed_seconds']}s)")
    for variant, entry in report["variants"].items():
        s = entry["summary"]
        print(f"\n  prompt = {variant} ({s['runs']} runs)")
        print(f"    chose meeting_prep {_fmt(s['chose_meeting_prep_rate'])} | invalid {_fmt(s['invalid_rate'])}")
        print(f"    already final shape (stable) {_fmt(s['stable_rate'])} | visible shrink {_fmt(s['visible_shrink_rate'])} "
              f"| out of order {_fmt(s['out_of_order_rate'])} | retitled {_fmt(s['retitled_rate'])} | repeated kinds {_fmt(s['repeated_kinds_rate'])}")
        print(f"    items dropped per answer {s['items_dropped_mean']} | sections lost per answer {s['sections_lost_mean']}")
        errors = [r for r in entry["runs"] if r["report"].get("error")]
        for r in errors[:3]:
            print(f"    ERROR ({r['project']}/{r['query']}): {r['report']['error']}")
