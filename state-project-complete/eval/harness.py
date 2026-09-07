"""Shared plumbing for running eval/scenarios.py through the real
interpretation pipeline. Used by both run_eval.py (a standalone script for
a human to run locally with a real ANTHROPIC_API_KEY) and
test_consequentiality_eval_dataset.py (the pytest-integrated, CI-skip-clean
wrapper around the same scenarios).

Deliberately mirrors the seeding/process pattern already established in
test_evidence_intake_consequentiality.py rather than inventing a second way
to do it -- see that file's _DBContext/_seeded_connection/_process for the
original.
"""
from __future__ import annotations

import os
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List

from dotenv import load_dotenv

# Loads state-project-complete/.env if present, so a real key can be dropped
# into a plain gitignored file (no terminal/shell export required) --
# harmless no-op if the file doesn't exist, and never overrides a variable
# already set in the real environment.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

sys.path.insert(0, "phase2_current")

from anthropic_provider import AnthropicProvider
from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence

from eval.scenarios import SCENARIOS, Scenario

REQUIRES_KEY_REASON = (
    "ANTHROPIC_API_KEY not set -- this eval measures real model judgment, "
    "not pipeline mechanics, so it cannot run against a scripted fake "
    "provider. Set the key and re-run locally for a real signal."
)


class _DBContext:
    def __init__(self, db_context, connection):
        self.db_context = db_context
        self._connection = connection

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __setattr__(self, name, value):
        if name in ("db_context", "_connection"):
            super().__setattr__(name, value)
        else:
            setattr(self._connection, name, value)


def _seeded_connection(scenario: Scenario):
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    for state_id, (topic, statement) in scenario.state_items.items():
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, 1),
        )
    for qid, text, blocking in scenario.questions:
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', ?)",
            (qid, text, 1 if blocking else 0),
        )
    connection.commit()
    return _DBContext(db_context, connection)


@dataclass
class ScenarioResult:
    scenario: Scenario
    review_recommended: bool
    processing_status: str
    error: str = ""

    @property
    def matches_expected(self) -> bool:
        """Only meaningful for must_review/no_review; ambiguous scenarios
        have no single correct answer, so callers should not treat a
        mismatch there as a failure."""
        if self.scenario.expected == "must_review":
            return self.review_recommended
        if self.scenario.expected == "no_review":
            return not self.review_recommended
        return True  # ambiguous: always counts as "not wrong"


def run_scenario(scenario: Scenario, provider=None) -> ScenarioResult:
    conn = _seeded_connection(scenario)
    try:
        conn.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            (f"e-{scenario.id}", scenario.content),
        )
        conn.commit()
        result = process_evidence(
            conn,
            evidence_id=f"e-{scenario.id}",
            provider=provider or AnthropicProvider(),
        )
        return ScenarioResult(
            scenario=scenario,
            review_recommended=len(result.review_ids) > 0,
            processing_status=result.processing_status,
        )
    except Exception as exc:  # pragma: no cover -- surfaced in the report, not swallowed
        return ScenarioResult(
            scenario=scenario,
            review_recommended=False,
            processing_status="error",
            error=str(exc),
        )
    finally:
        conn.db_context.__exit__(None, None, None)


def run_all(scenarios: List[Scenario] = None, provider=None) -> List[ScenarioResult]:
    return [run_scenario(s, provider=provider) for s in (scenarios or SCENARIOS)]


def precision_recall(results: List[ScenarioResult]):
    """Precision/recall computed only over must_review/no_review scenarios
    (ambiguous scenarios are excluded -- there's no ground truth to score
    them against, per the doc's explicit warning against overfitting to one
    answer for genuinely ambiguous cases)."""
    scored = [r for r in results if r.scenario.expected in ("must_review", "no_review")]
    actually_should_review = [r for r in scored if r.scenario.expected == "must_review"]
    surfaced = [r for r in scored if r.review_recommended]
    true_positives = [r for r in actually_should_review if r.review_recommended]
    false_negatives = [r for r in actually_should_review if not r.review_recommended]
    false_positives = [
        r for r in scored if r.scenario.expected == "no_review" and r.review_recommended
    ]
    recall = len(true_positives) / len(actually_should_review) if actually_should_review else None
    precision = len(true_positives) / len(surfaced) if surfaced else None
    return {
        "total_scored": len(scored),
        "should_have_reviewed": len(actually_should_review),
        "surfaced_for_review": len(surfaced),
        "true_positives": true_positives,
        "false_negatives": false_negatives,
        "false_positives": false_positives,
        "recall": recall,
        "precision": precision,
    }
