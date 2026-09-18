"""Privacy-safe product analytics for the State portfolio/demo.

This module intentionally stores metadata about product use, never project
content. Authoritative project outcomes continue to come from State's own
Evidence / Review / Question / History records. The analytics store only fills
behavioral and controlled-eval gaps that those records cannot answer.
"""
from __future__ import annotations

import math
import os
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from db import connect

EVENT_RETENTION_DAYS = 90
EVAL_RETENTION_DAYS = 365

ALLOWED_EVENT_NAMES = {
    "state_demo_opened",
    "view_opened",
    "outbound_link_opened",
    "ask_submitted",
    "ask_completed",
    "ask_failed",
    "ask_cancelled",
    "api_failure",
}

SAFE_VIEWS = {"overview", "open-items", "project-overview", "notes", "history", "settings"}


class ProductEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    session_id: str | None = Field(default=None, max_length=120)
    project_id: str | None = Field(default=None, max_length=120)
    environment: str | None = Field(default=None, max_length=40)
    build: str | None = Field(default=None, max_length=120)
    ref_label: str | None = Field(default=None, max_length=120)
    outcome: str | None = Field(default=None, max_length=80)
    source_type: str | None = Field(default=None, max_length=80)
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)
    view: str | None = Field(default=None, max_length=80)
    destination_origin: str | None = Field(default=None, max_length=300)
    status_code: int | None = Field(default=None, ge=100, le=599)


class EvalRunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suite: str = Field(default="consequentiality", min_length=1, max_length=120)
    run_kind: Literal["controlled_eval", "synthetic_eval"] = "controlled_eval"
    build: str | None = Field(default=None, max_length=120)
    provider: str | None = Field(default=None, max_length=80)
    model_identifier: str | None = Field(default=None, max_length=160)
    total: int = Field(ge=0)
    precision: float | None = Field(default=None, ge=0, le=1)
    recall: float | None = Field(default=None, ge=0, le=1)
    false_positives: int = Field(default=0, ge=0)
    false_negatives: int = Field(default=0, ge=0)
    errors: int = Field(default=0, ge=0)
    high_severity_failures: int = Field(default=0, ge=0)
    question_usefulness: float | None = Field(default=None, ge=0, le=1)
    ask_grounding: float | None = Field(default=None, ge=0, le=1)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _hours_between(start, end) -> float | None:
    a, b = _parse_ts(start), _parse_ts(end)
    if not a or not b:
        return None
    return max(0.0, (b - a).total_seconds() / 3600)


def _within(value, now: datetime, days: int) -> bool:
    dt = _parse_ts(value)
    if not dt:
        return False
    return timedelta(0) <= now - dt <= timedelta(days=days)


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 1)
    rank = (len(ordered) - 1) * p
    lo, hi = math.floor(rank), math.ceil(rank)
    if lo == hi:
        value = ordered[lo]
    else:
        value = ordered[lo] + (ordered[hi] - ordered[lo]) * (rank - lo)
    return round(value, 1)


def _age_bucket(created_at, now: datetime) -> str:
    dt = _parse_ts(created_at)
    if not dt:
        return "unknown"
    days = max(0.0, (now - dt).total_seconds() / 86400)
    if days < 1:
        return "under_1d"
    if days <= 7:
        return "1_to_7d"
    return "over_7d"


def _prune(connection, now: datetime) -> None:
    event_cutoff = (now - timedelta(days=EVENT_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    eval_cutoff = (now - timedelta(days=EVAL_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    connection.execute("DELETE FROM product_analytics_events WHERE occurred_at < ?", (event_cutoff,))
    connection.execute("DELETE FROM product_eval_runs WHERE created_at < ?", (eval_cutoff,))
    connection.commit()


def _normalize_project_id(value: str | None) -> str | None:
    value = (value or "").strip()
    return None if not value or value == "unresolved" else value


def _validate_event(payload: ProductEventInput) -> None:
    if payload.name not in ALLOWED_EVENT_NAMES:
        raise HTTPException(status_code=422, detail="Unsupported analytics event")
    if payload.view and payload.view not in SAFE_VIEWS:
        raise HTTPException(status_code=422, detail="Unsupported analytics view")
    if payload.destination_origin:
        origin = payload.destination_origin
        if not (origin.startswith("https://") or origin.startswith("http://")):
            raise HTTPException(status_code=422, detail="destination_origin must be an origin URL")
        # Origins must not include path/query fragments; those can contain content.
        tail = origin.split("://", 1)[-1]
        if "/" in tail or "?" in tail or "#" in tail:
            raise HTTPException(status_code=422, detail="destination_origin must not include a path or query")


def _insert_event(connection, payload: ProductEventInput, now: datetime | None = None) -> dict:
    _validate_event(payload)
    now = now or _utcnow()
    event_id = f"analytics_{uuid.uuid4().hex[:16]}"
    connection.execute(
        """
        INSERT INTO product_analytics_events(
            id,event_name,session_id,project_id,environment,build,ref_label,
            outcome,source_type,duration_ms,view_name,destination_origin,status_code,occurred_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            event_id,
            payload.name,
            payload.session_id,
            _normalize_project_id(payload.project_id),
            payload.environment,
            payload.build,
            payload.ref_label,
            payload.outcome,
            payload.source_type,
            payload.duration_ms,
            payload.view,
            payload.destination_origin,
            payload.status_code,
            now.strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    connection.commit()
    return {"status": "recorded", "id": event_id}


def _project_exists(connection, project_id: str) -> bool:
    return connection.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone() is not None


def _rows(connection, query: str, params=()) -> list[dict]:
    return [dict(row) for row in connection.execute(query, params).fetchall()]


def _scope_filter(project_id: str | None, field: str = "project_id") -> tuple[str, tuple]:
    return (f" WHERE {field}=?", (project_id,)) if project_id else ("", ())


def _aggregate(connection, project_id: str | None, now: datetime) -> dict:
    if project_id and not _project_exists(connection, project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    projects = _rows(connection, "SELECT id,name,created_at FROM projects ORDER BY name")
    where, params = _scope_filter(project_id)
    evidence = _rows(connection, f"SELECT id,project_id,source_type,processing_status,submitted_at FROM evidence{where}", params)
    reviews = _rows(connection, f"SELECT id,project_id,status,resolution,created_at,resolved_at FROM review_issues{where}", params)
    questions = _rows(connection, f"SELECT id,project_id,status,blocking,created_at,resolved_at FROM questions{where}", params)

    history_where = " WHERE s.project_id=?" if project_id else ""
    history_params = (project_id,) if project_id else ()
    history = _rows(
        connection,
        "SELECT h.id,s.project_id,h.changed_at,p.review_id FROM history_transitions h "
        "JOIN current_state_items s ON s.id=h.state_item_id "
        "LEFT JOIN proposed_state_changes p ON p.id=h.proposed_change_id" + history_where,
        history_params,
    )
    interpretation_where = " WHERE e.project_id=?" if project_id else ""
    interpretation_params = (project_id,) if project_id else ()
    interpretations = _rows(
        connection,
        "SELECT ir.id,e.project_id,ir.provider,ir.model_identifier,ir.processing_status,ir.error_code,ir.created_at "
        "FROM interpretation_records ir JOIN evidence e ON e.id=ir.evidence_id" + interpretation_where,
        interpretation_params,
    )
    event_where = " WHERE project_id=?" if project_id else ""
    events = _rows(connection, "SELECT * FROM product_analytics_events" + event_where, params)
    eval_runs = _rows(
        connection,
        "SELECT * FROM product_eval_runs WHERE suite NOT IN (?, ?) ORDER BY created_at DESC LIMIT 20",
        ("review_interpretation", "ask_quality"),
    )

    evidence_30 = [x for x in evidence if _within(x.get("submitted_at"), now, 30)]
    history_7 = [x for x in history if _within(x.get("changed_at"), now, 7)]
    history_30 = [x for x in history if _within(x.get("changed_at"), now, 30)]
    state_change_review_ids = {x.get("review_id") for x in history if x.get("review_id")}
    opened_reviews_30 = [x for x in reviews if _within(x.get("created_at"), now, 30)]
    resolved_reviews_30 = [x for x in reviews if x.get("status") == "resolved" and _within(x.get("resolved_at"), now, 30)]
    opened_questions_30 = [x for x in questions if _within(x.get("created_at"), now, 30)]
    resolved_questions_30 = [x for x in questions if x.get("status") == "resolved" and _within(x.get("resolved_at"), now, 30)]
    open_reviews = [x for x in reviews if x.get("status") == "open"]
    open_questions = [x for x in questions if x.get("status") == "open"]

    review_durations = [
        value for value in (_hours_between(x.get("created_at"), x.get("resolved_at")) for x in reviews if x.get("status") == "resolved")
        if value is not None
    ]
    question_durations = [
        value for value in (_hours_between(x.get("created_at"), x.get("resolved_at")) for x in questions if x.get("status") in {"resolved", "stopped"})
        if value is not None
    ]
    review_ages = Counter(_age_bucket(x.get("created_at"), now) for x in open_reviews)
    question_ages = Counter(_age_bucket(x.get("created_at"), now) for x in open_questions)
    source_mix = Counter((x.get("source_type") or "unknown") for x in evidence_30)

    recent_events_7 = [x for x in events if _within(x.get("occurred_at"), now, 7)]
    recent_events_30 = [x for x in events if _within(x.get("occurred_at"), now, 30)]
    sessions_7 = {x.get("session_id") for x in recent_events_7 if x.get("session_id") and x.get("event_name") == "state_demo_opened"}
    sessions_30 = {x.get("session_id") for x in recent_events_30 if x.get("session_id") and x.get("event_name") == "state_demo_opened"}
    feature_use = Counter(x.get("event_name") for x in recent_events_30)
    view_use = Counter(x.get("view_name") for x in recent_events_30 if x.get("event_name") == "view_opened" and x.get("view_name"))
    ask_events = [x for x in recent_events_30 if x.get("event_name", "").startswith("ask_")]
    ask_latencies = [float(x["duration_ms"]) for x in ask_events if x.get("event_name") == "ask_completed" and x.get("duration_ms") is not None]

    active_project_ids_7 = {x.get("project_id") for x in recent_events_7 if x.get("project_id")}
    active_project_ids_30 = {x.get("project_id") for x in recent_events_30 if x.get("project_id")}

    latest_activity_candidates = []
    for collection, field in ((evidence, "submitted_at"), (reviews, "created_at"), (reviews, "resolved_at"), (questions, "created_at"), (questions, "resolved_at"), (history, "changed_at"), (events, "occurred_at")):
        latest_activity_candidates.extend(_parse_ts(x.get(field)) for x in collection if x.get(field))
    latest_activity_candidates = [x for x in latest_activity_candidates if x]

    interpretation_success = [x for x in interpretations if x.get("processing_status") == "succeeded"]
    interpretation_failed = [x for x in interpretations if x.get("processing_status") == "failed"]
    provider_models = Counter(f"{x.get('provider') or 'unknown'} / {x.get('model_identifier') or 'unknown'}" for x in interpretations)

    project_summaries = []
    for project in projects:
        pid = project["id"]
        if project_id and pid != project_id:
            continue
        p_evidence = [x for x in evidence if x.get("project_id") == pid]
        p_reviews = [x for x in reviews if x.get("project_id") == pid]
        p_questions = [x for x in questions if x.get("project_id") == pid]
        p_history = [x for x in history if x.get("project_id") == pid]
        p_events = [x for x in events if x.get("project_id") == pid]
        p_times = []
        for collection, field in ((p_evidence, "submitted_at"), (p_reviews, "created_at"), (p_reviews, "resolved_at"), (p_questions, "created_at"), (p_questions, "resolved_at"), (p_history, "changed_at"), (p_events, "occurred_at")):
            p_times.extend(_parse_ts(x.get(field)) for x in collection if x.get(field))
        p_times = [x for x in p_times if x]
        project_summaries.append({
            "id": pid,
            "name": project["name"],
            "demo_seeded": pid in {"northstar", "juniper-office-move"},
            "sessions_30d": len({x.get("session_id") for x in p_events if _within(x.get("occurred_at"), now, 30) and x.get("event_name") == "state_demo_opened" and x.get("session_id")}),
            "evidence_30d": sum(1 for x in p_evidence if _within(x.get("submitted_at"), now, 30)),
            "state_changes_30d": sum(1 for x in p_history if _within(x.get("changed_at"), now, 30)),
            "pending_reviews": sum(1 for x in p_reviews if x.get("status") == "open"),
            "blocking_questions": sum(1 for x in p_questions if x.get("status") == "open" and bool(x.get("blocking"))),
            "processing_failures": sum(1 for x in p_evidence if x.get("processing_status") == "failed"),
            "last_activity_at": max(p_times).isoformat() if p_times else None,
        })

    latest_eval = eval_runs[0] if eval_runs else None
    investigations = []
    if any(x.get("processing_status") == "failed" for x in evidence):
        investigations.append({"kind": "processing_failures", "label": "Evidence processing failures are present", "count": sum(1 for x in evidence if x.get("processing_status") == "failed")})
    old_reviews = review_ages.get("over_7d", 0)
    if old_reviews:
        investigations.append({"kind": "aging_reviews", "label": "Reviews have been open more than 7 days", "count": old_reviews})
    old_blockers = sum(1 for x in open_questions if bool(x.get("blocking")) and _age_bucket(x.get("created_at"), now) == "over_7d")
    if old_blockers:
        investigations.append({"kind": "aging_blockers", "label": "Blocking Questions have been open more than 7 days", "count": old_blockers})
    ask_failures = feature_use.get("ask_failed", 0)
    if ask_failures:
        investigations.append({"kind": "ask_failures", "label": "Ask failures were recorded in the last 30 days", "count": ask_failures})
    if latest_eval and ((latest_eval.get("false_negatives") or 0) > 0 or (latest_eval.get("high_severity_failures") or 0) > 0):
        investigations.append({"kind": "eval_regression", "label": "Latest controlled eval has important failures", "count": (latest_eval.get("false_negatives") or 0) + (latest_eval.get("high_severity_failures") or 0)})

    return {
        "generated_at": now.isoformat(),
        "scope": {"project_id": project_id, "label": next((p["name"] for p in projects if p["id"] == project_id), "All projects") if project_id else "All projects"},
        "portfolio_boundary": "Demo/reviewer activity only; not customer adoption or production retention.",
        "overview": {
            "projects_total": len(project_summaries) if project_id else len(projects),
            "projects_with_usage_7d": len(active_project_ids_7 if not project_id else ({project_id} & active_project_ids_7)),
            "projects_with_usage_30d": len(active_project_ids_30 if not project_id else ({project_id} & active_project_ids_30)),
            "demo_sessions_7d": len(sessions_7),
            "demo_sessions_30d": len(sessions_30),
            "evidence_30d": len(evidence_30),
            "state_changes_7d": len(history_7),
            "state_changes_30d": len(history_30),
            "last_activity_at": max(latest_activity_candidates).isoformat() if latest_activity_candidates else None,
        },
        "usage": {
            "event_counts_30d": dict(feature_use),
            "views_30d": dict(view_use),
            "evidence_source_mix_30d": dict(source_mix),
            "reviews_opened_30d": len(opened_reviews_30),
            "reviews_resolved_30d": len(resolved_reviews_30),
            "questions_opened_30d": len(opened_questions_30),
            "questions_resolved_30d": len(resolved_questions_30),
            "ask_submitted_30d": feature_use.get("ask_submitted", 0),
            "ask_completed_30d": feature_use.get("ask_completed", 0),
            "ask_failed_30d": feature_use.get("ask_failed", 0),
            "ask_cancelled_30d": feature_use.get("ask_cancelled", 0),
        },
        "outcomes_and_friction": {
            "pending_reviews": len(open_reviews),
            "blocking_questions": sum(1 for x in open_questions if bool(x.get("blocking"))),
            "other_open_questions": sum(1 for x in open_questions if not bool(x.get("blocking"))),
            "review_age_buckets": {key: review_ages.get(key, 0) for key in ("under_1d", "1_to_7d", "over_7d", "unknown")},
            "question_age_buckets": {key: question_ages.get(key, 0) for key in ("under_1d", "1_to_7d", "over_7d", "unknown")},
            "median_review_resolution_hours": round(median(review_durations), 1) if review_durations else None,
            "median_question_resolution_hours": round(median(question_durations), 1) if question_durations else None,
            "evidence_processing_failures": sum(1 for x in evidence if x.get("processing_status") == "failed"),
            "resolved_reviews_without_state_change_30d": sum(
                1 for review in resolved_reviews_30 if review.get("id") not in state_change_review_ids
            ),
        },
        "reliability": {
            "interpretation_succeeded": len(interpretation_success),
            "interpretation_failed": len(interpretation_failed),
            "provider_models": dict(provider_models),
            "ask_latency_ms": {"sample_size": len(ask_latencies), "p50": _percentile(ask_latencies, 0.5), "p95": _percentile(ask_latencies, 0.95)},
            "token_usage": None,
            "token_usage_note": "Token counts are not persisted consistently across State model paths yet.",
            "model_cost": None,
            "model_cost_note": "State does not fabricate a dollar estimate without versioned pricing and trustworthy token data.",
        },
        "evals": {
            "label": "Controlled evals — separate from demo usage",
            "latest": latest_eval,
            "recent": eval_runs[:8],
        },
        "projects": project_summaries,
        "needs_investigation": investigations,
        "privacy": {
            "content_included": False,
            "event_retention_days": EVENT_RETENTION_DAYS,
            "eval_retention_days": EVAL_RETENTION_DAYS,
        },
    }


def register_product_analytics(application: FastAPI, settings) -> None:
    """Register metadata-only analytics collection and aggregate admin routes."""

    @application.post("/api/analytics/events", status_code=202)
    def post_product_event(payload: ProductEventInput) -> dict:
        connection = connect(settings.connection_url())
        try:
            _prune(connection, _utcnow())
            project_id = _normalize_project_id(payload.project_id)
            if project_id and not _project_exists(connection, project_id):
                # Analytics must never create or mutate product records. A stale/deleted
                # project reference is safely dropped instead of becoming a new truth.
                payload = payload.model_copy(update={"project_id": None})
            return _insert_event(connection, payload)
        finally:
            connection.close()

    @application.get("/api/admin/product-analytics")
    def get_product_analytics(project_id: str | None = Query(default=None, max_length=120)) -> dict:
        connection = connect(settings.connection_url())
        try:
            now = _utcnow()
            _prune(connection, now)
            return _aggregate(connection, _normalize_project_id(project_id), now)
        finally:
            connection.close()

    @application.post("/api/admin/eval-runs", status_code=201)
    def post_eval_run(payload: EvalRunInput, x_state_eval_key: str | None = Header(default=None)) -> dict:
        expected = os.getenv("STATE_EVAL_INGEST_KEY", "").strip()
        if not expected:
            raise HTTPException(status_code=503, detail="Eval result ingestion is not configured")
        if x_state_eval_key != expected:
            raise HTTPException(status_code=403, detail="Invalid eval ingestion key")
        connection = connect(settings.connection_url())
        try:
            _prune(connection, _utcnow())
            run_id = f"eval_{uuid.uuid4().hex[:16]}"
            connection.execute(
                """
                INSERT INTO product_eval_runs(
                    id,suite,run_kind,build,provider,model_identifier,total,precision,recall,
                    false_positives,false_negatives,errors,high_severity_failures,
                    question_usefulness,ask_grounding
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    run_id,payload.suite,payload.run_kind,payload.build,payload.provider,payload.model_identifier,
                    payload.total,payload.precision,payload.recall,payload.false_positives,payload.false_negatives,
                    payload.errors,payload.high_severity_failures,payload.question_usefulness,payload.ask_grounding,
                ),
            )
            connection.commit()
            return {"status": "recorded", "id": run_id}
        finally:
            connection.close()

    # Persist the operational gap that authoritative lifecycle rows cannot answer:
    # Ask usage/failure/latency and generic API failures. Do not duplicate Evidence,
    # Review, Question, or History outcomes that already have authoritative rows.
    @application.middleware("http")
    async def product_analytics_middleware(request: Request, call_next):
        path = request.url.path
        is_ask = path in {"/api/ask", "/api/ask/stream"} and request.method == "POST"
        started = time.perf_counter()
        if is_ask:
            connection = connect(settings.connection_url())
            try:
                _insert_event(connection, ProductEventInput(
                    name="ask_submitted",
                    project_id=request.headers.get("X-State-Project-Id"),
                    environment=getattr(settings, "environment", None),
                    build=os.getenv("RENDER_GIT_COMMIT", os.getenv("VERCEL_GIT_COMMIT_SHA", "unversioned"))[:120],
                ))
            finally:
                connection.close()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            connection = connect(settings.connection_url())
            try:
                _insert_event(connection, ProductEventInput(
                    name="ask_failed" if is_ask else "api_failure",
                    project_id=request.headers.get("X-State-Project-Id"),
                    environment=getattr(settings, "environment", None),
                    duration_ms=elapsed_ms,
                    outcome="exception",
                ))
            finally:
                connection.close()
            raise

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        if is_ask or response.status_code >= 500:
            event_name = "ask_completed" if is_ask and response.status_code < 400 else ("ask_failed" if is_ask else "api_failure")
            connection = connect(settings.connection_url())
            try:
                _insert_event(connection, ProductEventInput(
                    name=event_name,
                    project_id=request.headers.get("X-State-Project-Id"),
                    environment=getattr(settings, "environment", None),
                    duration_ms=elapsed_ms,
                    outcome="success" if response.status_code < 400 else "http_error",
                    status_code=response.status_code,
                ))
            finally:
                connection.close()
        return response
