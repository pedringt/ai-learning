"""Model-call usage for Project Health's failure investigator (Oct 19, DEC-012's revisit signal).

Project Health (the portfolio dashboard on Vercel) has no database, so each investigation's model call is
recorded here, in ``model_call_metrics``, as metadata only: which Project Health project, the model, token
counts and duration. Never evidence, prompts or reports (DATA_PRIVACY.md "Project Health privacy boundary").
Rows use the operation ``project_health_investigation:<project>`` and no State project id, and State's own AI
metrics exclude that operation prefix, so the two never mix.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import connect
from product_analytics import MODEL_PRICING_AS_OF, _estimated_model_cost

OPERATION_PREFIX = "project_health_investigation:"
PROJECTS = ("state", "tastemake", "narc", "authority-lab")


class ProjectHealthUsageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: Literal["state", "tastemake", "narc", "authority-lab"]
    provider: Literal["anthropic"] = "anthropic"
    model_identifier: str = Field(min_length=1, max_length=160)
    duration_ms: int = Field(ge=0, le=600_000)
    input_tokens: int = Field(ge=0, le=1_000_000)
    output_tokens: int = Field(ge=0, le=1_000_000)


def usage_summary(rows: list[dict], days: int) -> dict:
    """Aggregate usage rows (already limited to the window) into counts, tokens and estimated cost."""
    by_project: dict[str, dict] = {}
    unpriced = 0
    total_cost = 0.0
    for row in rows:
        project = str(row.get("operation") or "")[len(OPERATION_PREFIX):] or "unknown"
        cost = _estimated_model_cost(row)
        entry = by_project.setdefault(project, {"calls": 0, "estimated_usd": 0.0})
        entry["calls"] += 1
        if cost is None:
            unpriced += 1
        else:
            entry["estimated_usd"] = round(entry["estimated_usd"] + cost, 6)
            total_cost += cost
    return {
        "days": days,
        "calls": len(rows),
        "input_tokens": sum(int(r.get("input_tokens") or 0) for r in rows),
        "output_tokens": sum(int(r.get("output_tokens") or 0) for r in rows),
        "estimated_usd": round(total_cost, 6),
        "unpriced_calls": unpriced,
        "pricing_as_of": MODEL_PRICING_AS_OF,
        "by_project": by_project,
        "privacy": {"content_included": False},
    }


def register_project_health_usage(application: FastAPI, settings) -> None:
    @application.get("/api/admin/project-health-usage")
    def get_project_health_usage(days: int = Query(default=30, ge=1, le=90)) -> dict:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        connection = connect(settings.connection_url())
        try:
            rows = [dict(row) for row in connection.execute(
                "SELECT operation,model_identifier,input_tokens,output_tokens,duration_ms,occurred_at FROM model_call_metrics "
                "WHERE operation LIKE ? AND occurred_at >= ?",
                (OPERATION_PREFIX + "%", since),
            ).fetchall()]
            return usage_summary(rows, days)
        finally:
            connection.close()

    @application.post("/api/admin/project-health-usage", status_code=201)
    def post_project_health_usage(payload: ProjectHealthUsageInput, x_project_health_usage_key: str | None = Header(default=None)) -> dict:
        expected = os.getenv("PROJECT_HEALTH_USAGE_KEY", "").strip()
        if not expected:
            raise HTTPException(status_code=503, detail="Project Health usage ingestion is not configured")
        if x_project_health_usage_key != expected:
            raise HTTPException(status_code=403, detail="Invalid Project Health usage key")
        connection = connect(settings.connection_url())
        try:
            row_id = f"phusage_{uuid.uuid4().hex[:16]}"
            connection.execute(
                "INSERT INTO model_call_metrics(id,project_id,operation,provider,model_identifier,duration_ms,input_tokens,output_tokens) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (row_id, None, OPERATION_PREFIX + payload.project, payload.provider, payload.model_identifier,
                 payload.duration_ms, payload.input_tokens, payload.output_tokens),
            )
            connection.commit()
            return {"status": "recorded", "id": row_id}
        finally:
            connection.close()
