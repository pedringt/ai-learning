"""Model-call usage for Project Health's failure investigator (Oct 19, DEC-012's revisit signal).

Project Health (the portfolio dashboard on Vercel) has no database, so each investigation's model call is
recorded here, in ``model_call_metrics``, as metadata only: which Project Health project, the model, token
counts and duration. Never evidence, prompts or reports (DATA_PRIVACY.md "Project Health privacy boundary").
Rows use the operation ``project_health_investigation:<project>`` and no State project id, and State's own AI
metrics exclude that operation prefix, so the two never mix.
"""
from __future__ import annotations

import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse
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


class ProjectHealthReleaseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_key: str = Field(pattern=r"^[a-z0-9][a-z0-9:._-]{0,199}$")
    token: str = Field(pattern=r"^[0-9a-f]{32}$")


class ProjectHealthClaimInput(BaseModel):
    """A cooldown claim for one Project Health paid action (DEC-012 guards, Nov 8). Keys carry no content."""
    model_config = ConfigDict(extra="forbid")

    claim_key: str = Field(pattern=r"^[a-z0-9][a-z0-9:._-]{0,199}$")
    ttl_seconds: int = Field(ge=1, le=86_400)


def _timestamp(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def claim(connection, claim_key: str, ttl_seconds: int, now: datetime | None = None) -> tuple[str | None, int]:
    """Take claim_key for ttl_seconds unless an unexpired claim holds it. Returns (token, seconds_left); the token
    is None when another claim holds the key.

    One upsert decides it, so two parallel requests cannot both win: the row is inserted, or replaced only when
    the held claim has expired. Reading the token back says whose write stuck.
    """
    now = now or datetime.now(timezone.utc)
    token = uuid.uuid4().hex
    expires = _timestamp(now + timedelta(seconds=ttl_seconds))
    connection.execute("DELETE FROM project_health_claims WHERE expires_at < ?", (_timestamp(now - timedelta(days=1)),))
    connection.execute(
        "INSERT INTO project_health_claims(claim_key,token,expires_at) VALUES (?,?,?) "
        "ON CONFLICT(claim_key) DO UPDATE SET token=excluded.token, expires_at=excluded.expires_at "
        "WHERE project_health_claims.expires_at <= ?",
        (claim_key, token, expires, _timestamp(now)),
    )
    row = dict(connection.execute(
        "SELECT token, expires_at FROM project_health_claims WHERE claim_key = ?", (claim_key,)
    ).fetchone())
    connection.commit()
    if row["token"] == token:
        return token, ttl_seconds
    held_until = datetime.strptime(str(row["expires_at"]), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return None, max(1, int((held_until - now).total_seconds()))


def release(connection, claim_key: str, token: str) -> bool:
    """Give a claim back early (the action it guarded failed), only with the token that took it."""
    held = connection.execute(
        "SELECT 1 FROM project_health_claims WHERE claim_key = ? AND token = ?", (claim_key, token)
    ).fetchone()
    connection.execute("DELETE FROM project_health_claims WHERE claim_key = ? AND token = ?", (claim_key, token))
    connection.commit()
    return held is not None


def _require_usage_key(supplied: str | None) -> None:
    expected = os.getenv("PROJECT_HEALTH_USAGE_KEY", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Project Health usage ingestion is not configured")
    # Constant-time, like the decisions API: a plain != leaks how much of the key matched (#626).
    if not hmac.compare_digest(str(supplied or "").encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid Project Health usage key")


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
        _require_usage_key(x_project_health_usage_key)
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

    @application.post("/api/admin/project-health-claims")
    def post_project_health_claim(payload: ProjectHealthClaimInput, x_project_health_usage_key: str | None = Header(default=None)):
        _require_usage_key(x_project_health_usage_key)
        connection = connect(settings.connection_url())
        try:
            token, seconds = claim(connection, payload.claim_key, payload.ttl_seconds)
        finally:
            connection.close()
        if token:
            return {"claimed": True, "ttl_seconds": seconds, "token": token}
        return JSONResponse(status_code=409, content={"claimed": False, "retry_after_seconds": seconds},
                            headers={"Retry-After": str(seconds)})

    @application.post("/api/admin/project-health-claims/release")
    def post_project_health_claim_release(payload: ProjectHealthReleaseInput, x_project_health_usage_key: str | None = Header(default=None)) -> dict:
        _require_usage_key(x_project_health_usage_key)
        connection = connect(settings.connection_url())
        try:
            return {"released": release(connection, payload.claim_key, payload.token)}
        finally:
            connection.close()
