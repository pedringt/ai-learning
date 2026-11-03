"""Project Health's copy of the controlled-eval scenario catalog must match the scenario files (#596).

Project Health explains a failed scenario from its contract (Evidence, seeded Current State, expected outcome, unsafe
direction), read from the generated state-eval-catalog.js. A scenario change without a re-export would explain a failure
against a contract the run did not use. Fix a failure here by running `python3 scripts/export_state_eval_catalog.py`.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _exporter():
    spec = importlib.util.spec_from_file_location("export_state_eval_catalog", ROOT / "scripts" / "export_state_eval_catalog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_generated_catalog_matches_the_scenario_files():
    exporter = _exporter()
    committed = (ROOT / "state-eval-catalog.js").read_text(encoding="utf-8")
    assert committed == exporter.render(), "state-eval-catalog.js is stale: run python3 scripts/export_state_eval_catalog.py"


def test_catalog_carries_the_fields_the_dashboard_explains_from():
    data = _exporter().catalog()
    planned = next(item for item in data["review"] if item["id"] == "review_planned_action_not_stated_as_done")
    assert planned["evidence"].startswith("Q3 planning")
    assert planned["expected_action"] == "update_state"
    assert planned["unsafe_if"] == "overstatement"
    assert planned["current_state"] == [["evaluation", "Evaluation uses the Q2 sample split, reported weekly against fixed criteria."]]
    assert all(item["question"] for item in data["ask"])
