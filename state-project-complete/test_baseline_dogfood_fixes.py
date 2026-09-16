"""Regression coverage for the 2026-09-15 Baseline dogfood follow-up."""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

import api
import baseline_async_intake
import baseline_setup
from baseline_prompt_hardening import _QUALITY_GUIDANCE


class FailIfCalledProvider:
    name = "fail-if-called"
    model_identifier = "fail-if-called-v1"

    def __init__(self):
        self.called = False

    def interpret(self, *, context, evidence, connection=None):
        self.called = True
        raise AssertionError("provider should not have been called")


def _settings(path: str):
    return api.Settings(database_path=path, cors_origins=[], demo_bootstrap=True)


def test_processed_baseline_project_can_be_deleted_with_coverage_row_present():
    """Migration 015 coverage must be deleted before its Evidence parent."""
    with tempfile.TemporaryDirectory() as tempdir:
        settings = _settings(str(Path(tempdir) / "state.db"))
        with TestClient(api.create_app(settings=settings)) as client:
            created = client.post("/api/projects", json={"name": "Delete me"})
            assert created.status_code == 200
            project = created.json()
            headers = {"X-State-Project-Id": project["id"]}

            manual = client.post(
                "/api/baseline/manual",
                headers=headers,
                json={"items": [{
                    "area_name": "Product",
                    "topic": "Purpose",
                    "statement": "This project exists to exercise deletion after Baseline processing.",
                }]},
            )
            assert manual.status_code == 201, manual.text

            deleted = client.delete(f"/api/projects/{project['id']}", headers=headers)
            assert deleted.status_code == 200, deleted.text
            assert deleted.json()["status"] == "deleted"
            remaining = client.get("/api/projects").json()["items"]
            assert project["id"] not in {item["id"] for item in remaining}


def test_queued_baseline_analysis_quietly_stops_if_project_was_deleted():
    """A late background task must not call the model for a deleted project."""
    with tempfile.TemporaryDirectory() as tempdir:
        settings = _settings(str(Path(tempdir) / "state.db"))
        with TestClient(api.create_app(settings=settings)):
            pass
        provider = FailIfCalledProvider()
        baseline_async_intake._analyze_in_background(
            settings,
            provider,
            "project_already_deleted",
            "evidence_already_deleted",
        )
        assert provider.called is False


def test_structured_numbered_source_is_chunked_by_source_section():
    source = """Project notes

1. Product overview
State maintains current project understanding.

2. Product principles
Evidence is immutable. Humans authorize Current State.

3. Technical approach
The frontend is deployed on Vercel and the API runs separately.
"""
    chunks = baseline_setup.split_evidence_text(source, max_chars=5000)
    assert len(chunks) >= 3
    assert any(chunk.startswith("1. Product overview") for chunk in chunks)
    assert any(chunk.startswith("2. Product principles") for chunk in chunks)
    assert any(chunk.startswith("3. Technical approach") for chunk in chunks)
    assert not any("1. Product overview" in chunk and "2. Product principles" in chunk for chunk in chunks)


def test_baseline_quality_prompt_requires_structure_and_decomposition():
    guidance = _QUALITY_GUIDANCE
    assert "meaningful source headings and numbered sections" in guidance
    assert '"General" is a last resort' in guidance
    assert "MUST include a useful non-empty proposed_area_name and proposed_topic" in guidance
    assert "independently maintainable facts" in guidance
    assert "Do not summarize an entire section or multiple sections into one giant" in guidance
