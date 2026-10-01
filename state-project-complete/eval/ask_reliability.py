"""Targeted live-model measurement for Ask structured-completion reliability.

This suite does not score answer quality. It measures whether a fresh streamed Ask
call reaches a contract-valid final payload, and whether the same bounded retry used
by the product recovers a contract miss. Importing this module never loads .env and
never calls a model.
"""
from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path
from typing import Any, Mapping

from ask_service import run_ask, stream_ask_events
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data

PROJECT_ID = "northstar"

QUERIES: dict[str, str] = {
    "decisions_and_human_judgment": (
        "What decisions have already been made about the pilot, and which ones still need a person to decide?"
    ),
    "status_and_unresolved": (
        "What is the current status of the Northstar pilot, and what is still unresolved?"
    ),
    "meeting_risks_and_questions": (
        "What risks or open questions should I bring into the next Northstar meeting?"
    ),
    "status_update_brief": (
        "Based on the project record, what should I know before giving someone a status update on Northstar?"
    ),
    "known_vs_assumed": (
        "What does State know about the pilot right now, and where should I be careful not to assume more than the evidence supports?"
    ),
}

CONTRACT_ERRORS = (ValueError, TypeError, json.JSONDecodeError)


def _seed(database_path: str) -> None:
    connection = connect(f"sqlite://{database_path}")
    try:
        initialize_db(connection)
        bootstrap_demo_data(connection)
        bootstrap_juniper_demo_data(connection)
        connection.commit()
    finally:
        connection.close()


def _first_streamed_attempt(connection, provider, query: str) -> Mapping[str, Any]:
    final_payload = None
    for event_name, event_payload in stream_ask_events(connection, provider, query, None):
        if event_name == "final":
            final_payload = event_payload
    if final_payload is None:
        raise ValueError("Ask stream ended without a validated final payload")
    return final_payload


def summarize(runs: list[Mapping[str, Any]]) -> dict[str, Any]:
    total = len(runs)
    contract_failures = [r for r in runs if r.get("first_outcome") == "contract_failure"]
    recovered = [r for r in contract_failures if r.get("recovered_on_retry")]
    unrecovered = [r for r in runs if r.get("unrecovered")]
    provider_errors = [r for r in runs if r.get("first_outcome") == "provider_error"]
    first_valid = [r for r in runs if r.get("first_outcome") == "valid"]

    def rate(n: int, d: int):
        return round(n / d, 4) if d else None

    return {
        "runs": total,
        "first_attempt_valid_rate": rate(len(first_valid), total),
        "contract_failure_rate": rate(len(contract_failures), total),
        "retry_recovery_rate": rate(len(recovered), len(contract_failures)),
        "unrecovered_failure_rate": rate(len(unrecovered), total),
        "provider_error_rate": rate(len(provider_errors), total),
        "model_calls": sum(int(r.get("model_calls") or 0) for r in runs),
    }


def run(provider, *, repeats: int = 2, queries: Mapping[str, str] = QUERIES, project_id: str = PROJECT_ID) -> dict[str, Any]:
    started = time.time()
    runs: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory() as tmp:
        database_path = str(Path(tmp) / "ask-reliability.db")
        _seed(database_path)
        connection = connect(f"sqlite://{database_path}")
        try:
            connection.project_id = project_id
            for query_id, query in queries.items():
                for attempt in range(repeats):
                    entry: dict[str, Any] = {
                        "query_id": query_id,
                        "attempt": attempt,
                        "first_outcome": None,
                        "recovered_on_retry": False,
                        "unrecovered": False,
                        "model_calls": 1,
                    }
                    call_started = time.time()
                    try:
                        _first_streamed_attempt(connection, provider, query)
                        entry["first_outcome"] = "valid"
                    except CONTRACT_ERRORS as exc:
                        entry["first_outcome"] = "contract_failure"
                        entry["first_error"] = f"{type(exc).__name__}: {str(exc)[:240]}"
                        entry["model_calls"] = 2
                        try:
                            run_ask(connection, provider, query, None)
                            entry["recovered_on_retry"] = True
                        except Exception as retry_exc:
                            entry["unrecovered"] = True
                            entry["retry_error"] = f"{type(retry_exc).__name__}: {str(retry_exc)[:240]}"
                    except Exception as exc:
                        entry["first_outcome"] = "provider_error"
                        entry["unrecovered"] = True
                        entry["first_error"] = f"{type(exc).__name__}: {str(exc)[:240]}"
                    entry["elapsed_s"] = round(time.time() - call_started, 2)
                    runs.append(entry)
        finally:
            connection.close()
    return {
        "suite": "ask_completion_reliability",
        "project": project_id,
        "repeats": repeats,
        "elapsed_seconds": round(time.time() - started, 2),
        "summary": summarize(runs),
        "runs": runs,
    }
