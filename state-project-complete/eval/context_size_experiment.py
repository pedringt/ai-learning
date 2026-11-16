"""DEC-023 follow-up (#653): how much context should Ask send, up to the whole project? PAID when run for real.

Each #653 benchmark question is asked through the real streaming Ask (`stream_ask_events`) on the benchmark fixture,
under five retrieval conditions that change only what the model receives:

- `today`: the current code (since DEC-023: no windows, doubled limits, link expansion; before: recency windows).
- `x1`, `x1_5`, `x2`: no windows (DEC-023), today's word matching, per-type limits scaled 1, 1.5 and 2 times.
- `whole`: no windows and no trimming: every record in the project.

Per call it records whether the model selected the records the question needs (the benchmark's gold ids), whether a
valid answer came back, time to first token and to the finished answer, and token use. The fixture is synthetic, so
these numbers describe it, not production. Benchmark-only: nothing in the product changes.

Run through the eval matrix (suite `contextsize`); `python -m eval.context_size_experiment --dry-run` prints the
plan and the measured prompt sizes without calling a model.
"""
from __future__ import annotations

import argparse
import os
import tempfile
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterator
from unittest import mock

import ask_service
from eval import retrieval_benchmark as rb

CONDITIONS: dict[str, float | None] = {"today": None, "x1": 1.0, "x1_5": 1.5, "x2": 2.0, "whole": 0.0}
CHARS_PER_TOKEN = 3.5      # the matrix's estimate (eval/matrix.py)
# The per-type limits before DEC-023, which the x1/x1_5/x2 conditions scale (run 43676969245 used these).
BASE_LIMITS = {"state": 12, "reviews": 6, "questions": 12, "answered_questions": 6, "history": 10, "evidence": 12}


@dataclass(frozen=True)
class Scenario:
    id: str
    case: rb.Case
    condition: str


def scenarios(conditions: tuple[str, ...] | None = None) -> list[Scenario]:
    """Every case under each condition; `contextnow` runs only `today`, the after side of DEC-023's before/after
    (its before side is run 43676969245's `today`, measured on the code before DEC-023)."""
    names = conditions or tuple(CONDITIONS)
    return [Scenario(f"{case.id}@{condition}", case, condition) for condition in names for case in rb.CASES]


@lru_cache(maxsize=1)
def _fixture_path() -> str:
    from database_migration_backed import initialize_db
    from db import connect_sqlite
    path = os.path.join(tempfile.mkdtemp(prefix="contextsize-"), "bench.db")
    connection = connect_sqlite(path)
    initialize_db(connection)
    rb.build_fixture(connection)
    connection.close()
    return path


@contextmanager
def _connection() -> Iterator[Any]:
    from db import connect_sqlite
    connection = connect_sqlite(_fixture_path())
    connection.project_id = rb.PROJECT
    try:
        yield connection
    finally:
        connection.close()


def _whole(query: str, candidates: Any) -> dict:
    return {bucket: list(candidates[bucket]) for bucket in rb.BUCKETS}


def _scaled(scale: float):
    limits = {k: max(1, round(v * scale)) for k, v in BASE_LIMITS.items()}
    # Today's scoring, mirrored; at scale 1 it selects exactly what the real trim does with no windows (#653: A1).
    return lambda query, candidates: rb._rank_and_limit(query, candidates, rb._today_score, limits, rb._today_terms(query))


@contextmanager
def condition(name: str, connection: Any) -> Iterator[None]:
    """Patch Ask's two retrieval steps for one condition; `today` patches nothing."""
    scale = CONDITIONS[name]
    with ExitStack() as stack:
        if scale is not None:
            full = rb.pool(connection, None)
            stack.enter_context(mock.patch.object(ask_service, "_compact_candidates", lambda _connection: full))
            stack.enter_context(mock.patch.object(ask_service, "_trim_candidates_for_query",
                                                  _whole if scale == 0.0 else _scaled(scale)))
        yield


def prompt_chars(scenario: Scenario) -> int:
    """The size of the prompt this scenario would send (no model call)."""
    with _connection() as connection, condition(scenario.condition, connection):
        candidates = ask_service._trim_candidates_for_query(scenario.case.query, ask_service._compact_candidates(connection))
        return len(ask_service._one_call_prompt(scenario.case.query, candidates, None))


def _selected_ids(selection: dict) -> set[str]:
    return {i for value in (selection or {}).values() if isinstance(value, list) for i in value if isinstance(i, str)}


def run_one(scenario: Scenario, ask_provider: Any) -> dict[str, Any]:
    """PAID: one streamed Ask under one condition."""
    gold = set(scenario.case.gold)
    record: dict[str, Any] = {"scenario_id": scenario.id, "case": scenario.case.id, "family": scenario.case.family,
                              "condition": scenario.condition, "failed_checks": [], "checks": {}, "failure_mode": None}
    with _connection() as connection, condition(scenario.condition, connection):
        record["prompt_chars"] = prompt_chars(scenario)
        final = None
        try:
            for name, payload in ask_service.stream_ask_events(connection, ask_provider, scenario.case.query):
                if name == "final":
                    final = payload
        except Exception as exc:  # broad on purpose: one failed call is a recorded outcome, not a crashed run
            record.update(outcome="error", passed=None, error=f"{type(exc).__name__}: {exc}"[:300])
            return record
    selected = _selected_ids(final.get("selection", {}))
    timing = final.get("timing", {})
    record.update({
        "selected": sorted(selected), "gold": sorted(gold),
        "selection_recall": (len(gold & selected) / len(gold)) if gold else None,
        "forbidden_selected": sorted(set(scenario.case.forbidden) & selected),
        "first_token_ms": timing.get("first_token_ms"), "first_validated_ms": timing.get("first_validated_ms"),
        "provider_ms": timing.get("provider_ms"), "total_ms": timing.get("total_ms"),
        "headline": (final.get("answer") or {}).get("headline"),
    })
    passed = (gold <= selected) if gold else True
    record["checks"] = {"gold_selected": passed}
    if not passed:
        record["failed_checks"] = ["gold_selected"]
    record.update(outcome="pass" if passed else "fail", passed=passed)
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", required=True, help="print the plan and prompt sizes only")
    parser.parse_args()
    items = scenarios()
    print(f"{len(items)} calls per repeat ({len(rb.CASES)} cases x {len(CONDITIONS)} conditions)")
    for name in CONDITIONS:
        sizes = [prompt_chars(s) for s in items if s.condition == name]
        mean = sum(sizes) / len(sizes)
        print(f"  {name:6} mean prompt {mean:,.0f} chars (~{mean / CHARS_PER_TOKEN:,.0f} tokens), max {max(sizes):,}")


if __name__ == "__main__":
    main()
