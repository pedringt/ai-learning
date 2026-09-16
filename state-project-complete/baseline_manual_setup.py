"""Direct Starting State entry for Baseline Setup.

When a person already knows the project's starting truth, they should not need
an AI interpretation step between their words and the Starting State draft.
This route saves exactly what they enter as immutable Evidence, then routes
those user-authored facts through State's normal proposal/confirmation
machinery. Nothing becomes Current State until the person confirms the draft.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from baseline_setup import (
    is_baseline_setup,
    record_interpretation_metadata,
    strip_internal_provider_metadata,
)
from db import connect
from interpretation_pipeline_integrated import new_id


class ManualStartingStateFact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    statement: str = Field(min_length=1, max_length=4_000)
    area_name: str = Field(default="General", max_length=80)
    topic: str = Field(default="Starting fact", max_length=120)

    @field_validator("statement")
    @classmethod
    def statement_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("statement must not be blank")
        return value

    @field_validator("area_name")
    @classmethod
    def normalize_area(cls, value: str) -> str:
        return value.strip() or "General"

    @field_validator("topic")
    @classmethod
    def normalize_topic(cls, value: str) -> str:
        return value.strip() or "Starting fact"


class ManualStartingStateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[ManualStartingStateFact] = Field(min_length=1, max_length=20)


class ManualStartingStateProvider:
    """Deterministic provider for facts the person entered directly.

    This deliberately does not call a model. It only expresses the person's
    exact text in the same proposal contract the rest of Baseline Setup uses,
    so canonical validation, History, provenance, and confirmation stay intact.
    """

    name = "manual-starting-state"
    model_identifier = "manual-starting-state-v1"

    def __init__(self, facts: list[ManualStartingStateFact]):
        self._facts = facts

    def interpret(self, *, context, evidence, connection=None):
        recommendations = []
        for fact in self._facts:
            recommendations.append({
                "review_type": "missing_understanding",
                "decision_question": f"Should Starting State establish {fact.topic}?",
                "why_consequential": "This user-entered fact defines the project's initial maintained understanding.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": fact.statement,
                    "rationale": "Entered directly by the user during Baseline Setup.",
                    "proposed_area_name": fact.area_name,
                    "proposed_topic": fact.topic,
                }],
            })
        raw = {
            "summary": "User-entered Starting State facts are ready for confirmation.",
            "topics": list(dict.fromkeys(fact.area_name for fact in self._facts)),
            "outcome": "review_recommended",
            "review_recommendations": recommendations,
        }
        record_interpretation_metadata(str(evidence.get("id") or ""), raw, [raw])
        return strip_internal_provider_metadata(raw)


def _project_id_from_request(request: Request) -> str:
    project_id = (request.headers.get("X-State-Project-Id") or "").strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="X-State-Project-Id is required")
    return project_id


def _evidence_content(items: list[ManualStartingStateFact]) -> str:
    parts = ["Manual Starting State"]
    for fact in items:
        parts.append(
            f"Section: {fact.area_name}\nTitle: {fact.topic}\nFact: {fact.statement}"
        )
    return "\n\n".join(parts)


def register_baseline_manual_setup_routes(app: Any, settings: Any) -> None:
    @app.post("/api/baseline/manual", status_code=201)
    def post_manual_starting_state(payload: ManualStartingStateInput, request: Request) -> dict:
        project_id = _project_id_from_request(request)
        connection = connect(settings.connection_url())
        try:
            connection.project_id = project_id
            exists = connection.execute(
                "SELECT id FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if exists is None:
                raise HTTPException(status_code=404, detail="Project not found")
            if not is_baseline_setup(connection):
                raise HTTPException(
                    status_code=409,
                    detail={"code": "baseline_not_active"},
                )

            evidence_id = new_id("evidence")
            connection.execute(
                "INSERT INTO evidence(id, content, source_type, source_name, project_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    evidence_id,
                    _evidence_content(payload.items),
                    "manual_starting_state",
                    "Manual Starting State",
                    project_id,
                ),
            )
            connection.commit()

            # Use the composed, authority-bearing pipeline hook. Import here so
            # api.py has already installed Baseline metadata persistence.
            import api_core

            result = api_core.process_evidence(
                connection,
                evidence_id=evidence_id,
                provider=ManualStartingStateProvider(payload.items),
            )
            if result.processing_status != "succeeded":
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "manual_starting_state_failed",
                        "evidence_id": evidence_id,
                        "interpretation_record_id": result.interpretation_record_id,
                    },
                )

            return {
                "evidence_id": evidence_id,
                "interpretation_record_id": result.interpretation_record_id,
                "processing_status": result.processing_status,
                "draft_fact_count": len(payload.items),
            }
        finally:
            connection.close()
