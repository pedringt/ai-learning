"""#639/#643: what a controlled eval run records for the dashboard."""
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import Settings, create_app
from eval.quality_report import analytics_payload as _analytics_payload, failure_details as _failure_details


def _ask_report():
    return {
        "suite": "ask_quality",
        "scoring_version": "ask-13-abc",
        "summary": {"total": 2, "errors": 0, "high_severity_failures": 1, "ask_grounding": 0.5, "uncertainty_accuracy": 1.0,
                    "open_item_accuracy": 1.0, "authority_accuracy": 1.0, "overall_pass_rate": 0.5},
        "results": [
            {"id": "ask_unknown_stays_unknown", "category": "uncertainty", "severity": "high", "passed": False,
             "grounding_ok": False, "required_facts_ok": True, "forbidden_claims_ok": True, "uncertainty_ok": True,
             "open_item_ok": True, "authority_ok": True,
             "failed_items": ["number not in any record: 75", "asserted forbidden claim: 50%"],
             "answer_excerpt": "For planning purposes, use 75% as the agreed target.",
             "answer": {"headline": "For planning purposes, use 75% as the agreed target."}},
            {"id": "ask_change_summary", "passed": True},
        ],
    }


def test_failure_details_name_the_failed_items_without_model_output():
    [detail] = _failure_details(_ask_report())
    assert detail["failed_items"] == ["number not in any record", "asserted forbidden claim: 50%"]
    # DATA_PRIVACY.md: the dashboard does not ingest model responses, so the excerpt stays in the local report.
    assert "answer_excerpt" not in detail
    assert "75" not in str(detail)


def test_the_run_payload_carries_its_scoring_version():
    payload = _analytics_payload(_ask_report(), provider=None)
    assert payload["scoring_version"] == "ask-13-abc"


def test_the_api_stores_and_returns_the_scoring_version_and_failed_items():
    payload = _analytics_payload(_ask_report(), provider=None)
    legacy = {key: value for key, value in payload.items() if key != "scoring_version"}
    legacy["failure_details"] = [{key: value for key, value in item.items() if key != "failed_items"} for item in payload["failure_details"]]
    with tempfile.TemporaryDirectory() as tempdir, patch.dict(os.environ, {"STATE_EVAL_INGEST_KEY": "k"}):
        app = create_app(Settings(database_path=str(Path(tempdir) / "state.db"), provider="anthropic", cors_origins=[]))
        with TestClient(app) as client:
            assert client.post("/api/admin/quality-eval-runs", json=legacy, headers={"X-State-Eval-Key": "k"}).status_code == 201
            assert client.post("/api/admin/quality-eval-runs", json=payload, headers={"X-State-Eval-Key": "k"}).status_code == 201
            recent = client.get("/api/admin/quality-analytics").json()["controlled_evals"]["recent"]
    versions = sorted(str(run.get("scoring_version")) for run in recent)
    assert versions == ["None", "ask-13-abc"]
    newest = next(run for run in recent if run["scoring_version"])
    assert newest["failure_details"][0]["failed_items"] == ["number not in any record", "asserted forbidden claim: 50%"]
