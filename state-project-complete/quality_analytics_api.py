"""Privacy-safe Review/Ask quality analytics endpoints for State."""
from __future__ import annotations

import os
import uuid
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import connect
from review_quality_analytics import derive_review_quality


class QualityEvalRunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suite: Literal["review_interpretation", "ask_quality"]
    run_kind: Literal["controlled_eval", "synthetic_eval"] = "controlled_eval"
    build: str | None = Field(default=None, max_length=120)
    provider: str | None = Field(default=None, max_length=80)
    model_identifier: str | None = Field(default=None, max_length=160)
    total: int = Field(ge=0)
    errors: int = Field(default=0, ge=0)
    high_severity_failures: int = Field(default=0, ge=0)
    precision: float | None = Field(default=None, ge=0, le=1)
    recall: float | None = Field(default=None, ge=0, le=1)
    false_positives: int = Field(default=0, ge=0)
    false_negatives: int = Field(default=0, ge=0)
    interpretation_accuracy: float | None = Field(default=None, ge=0, le=1)
    ask_grounding: float | None = Field(default=None, ge=0, le=1)
    uncertainty_accuracy: float | None = Field(default=None, ge=0, le=1)
    open_item_accuracy: float | None = Field(default=None, ge=0, le=1)
    authority_accuracy: float | None = Field(default=None, ge=0, le=1)
    overall_pass_rate: float | None = Field(default=None, ge=0, le=1)


def _project_exists(connection, project_id: str) -> bool:
    return connection.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone() is not None


def _rows(connection, query: str, params=()) -> list[dict]:
    return [dict(row) for row in connection.execute(query, params).fetchall()]


def _eval_view(connection) -> dict:
    rows = _rows(connection, "SELECT * FROM product_eval_runs WHERE suite IN (?, ?) ORDER BY created_at DESC LIMIT 24", ("review_interpretation", "ask_quality"))
    latest_review = next((row for row in rows if row.get("suite") == "review_interpretation"), None)
    latest_ask = next((row for row in rows if row.get("suite") == "ask_quality"), None)
    return {
        "latest_review_interpretation": latest_review,
        "latest_ask_quality": latest_ask,
        "recent": rows[:12],
    }


def register_quality_analytics(application: FastAPI, settings) -> None:
    @application.get("/api/admin/quality-analytics")
    def get_quality_analytics(project_id: str | None = Query(default=None, max_length=120)) -> dict:
        normalized = (project_id or "").strip() or None
        connection = connect(settings.connection_url())
        try:
            if normalized and not _project_exists(connection, normalized):
                raise HTTPException(status_code=404, detail="Project not found")
            return {
                "scope": {"project_id": normalized},
                "live_review_quality": derive_review_quality(connection, normalized),
                "controlled_evals": _eval_view(connection),
                "privacy": {"content_included": False},
            }
        finally:
            connection.close()

    @application.post("/api/admin/quality-eval-runs", status_code=201)
    def post_quality_eval_run(payload: QualityEvalRunInput, x_state_eval_key: str | None = Header(default=None)) -> dict:
        expected = os.getenv("STATE_EVAL_INGEST_KEY", "").strip()
        if not expected:
            raise HTTPException(status_code=503, detail="Eval result ingestion is not configured")
        if x_state_eval_key != expected:
            raise HTTPException(status_code=403, detail="Invalid eval ingestion key")
        connection = connect(settings.connection_url())
        try:
            run_id = f"quality_eval_{uuid.uuid4().hex[:16]}"
            connection.execute(
                """
                INSERT INTO product_eval_runs(
                    id,suite,run_kind,build,provider,model_identifier,total,errors,high_severity_failures,
                    precision,recall,false_positives,false_negatives,interpretation_accuracy,ask_grounding,
                    uncertainty_accuracy,open_item_accuracy,authority_accuracy,overall_pass_rate
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    run_id,payload.suite,payload.run_kind,payload.build,payload.provider,payload.model_identifier,
                    payload.total,payload.errors,payload.high_severity_failures,payload.precision,payload.recall,
                    payload.false_positives,payload.false_negatives,payload.interpretation_accuracy,
                    payload.ask_grounding,payload.uncertainty_accuracy,payload.open_item_accuracy,
                    payload.authority_accuracy,payload.overall_pass_rate,
                ),
            )
            connection.commit()
            return {"status": "recorded", "id": run_id}
        finally:
            connection.close()
