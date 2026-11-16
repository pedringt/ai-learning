"""Project Health's shared investigation records (DEC-025, Nov 15; Paige chose server storage with recorded outcomes).

Investigation history used to live in each browser's localStorage and marked itself resolved when a project turned
Healthy. Records now live here so every visitor sees the same history. Only real problems create one, and the server
writes every record's text: the Vercel investigator posts the AI report's redacted first line with the usage key after
it has verified a current failure, and the State eval record is built here from the latest recorded eval run. A project
and problem has at most one open record. Paige sets the outcome with ``PROJECT_HEALTH_DECISION_KEY``; nothing closes on
its own. No prompts, evidence bodies, State project content or full reports (DATA_PRIVACY.md).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import connect
from project_health_decisions_api import _require_key as _require_decision_key
from project_health_usage_api import _require_usage_key

ProjectId = Literal["state", "tastemake", "narc", "authority-lab"]
Outcome = Literal["awaiting_evidence", "investigating", "accepted_limitation", "resolved"]
OPEN_OUTCOMES = (None, "awaiting_evidence", "investigating")
MAX_RECORDS = 20
EVAL_SUITE_LABELS = {"review_interpretation": "Update understanding", "ask_quality": "Answer quality"}


class InvestigationRecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectId
    problem_key: str = Field(pattern=r"^[a-z0-9:-]{1,60}$")
    trigger: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=300)
    evidence: list[str] = Field(default_factory=list, max_length=8)


class StateEvalInvestigationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_id: str | None = Field(default=None, pattern=r"^[a-z0-9_]{1,80}$")


class InvestigationOutcomeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Outcome
    note: str = Field(default="", max_length=500)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")


def _record(row: dict) -> dict:
    try:
        evidence = json.loads(row.get("evidence_json") or "[]")
    except (TypeError, ValueError):
        evidence = []
    return {
        "id": row["id"], "project": row["project"], "problemKey": row["problem_key"], "trigger": row["trigger_label"],
        "summary": row["summary"], "evidence": evidence if isinstance(evidence, list) else [],
        "outcome": row.get("outcome"), "outcomeNote": row.get("outcome_note") or "", "outcomeAt": row.get("outcome_at"),
        "createdAt": str(row["created_at"]), "lastSeenAt": str(row["last_seen_at"]),
    }


def record_open(connection, project: str, problem_key: str, trigger: str, summary: str, evidence: list[str]) -> tuple[dict, bool]:
    """Create a record, or touch the open one for the same project and problem. Returns (record, created)."""
    now = _now()
    rows = [dict(row) for row in connection.execute(
        "SELECT * FROM project_health_investigations WHERE project = ? AND problem_key = ? ORDER BY created_at DESC",
        (project, problem_key),
    ).fetchall()]
    open_row = next((row for row in rows if row.get("outcome") in OPEN_OUTCOMES), None)
    if open_row:
        connection.execute("UPDATE project_health_investigations SET last_seen_at = ? WHERE id = ?", (now, open_row["id"]))
        connection.commit()
        return _record({**open_row, "last_seen_at": now}), False
    row = {
        "id": f"phinv_{uuid.uuid4().hex[:16]}", "project": project, "problem_key": problem_key,
        "trigger_label": trigger.strip()[:120], "summary": summary.strip()[:300],
        "evidence_json": json.dumps([str(item).strip()[:80] for item in evidence if str(item).strip()][:8]),
        "outcome": None, "outcome_note": None, "outcome_at": None, "created_at": now, "last_seen_at": now,
    }
    connection.execute(
        "INSERT INTO project_health_investigations(id,project,problem_key,trigger_label,summary,evidence_json,created_at,last_seen_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (row["id"], project, problem_key, row["trigger_label"], row["summary"], row["evidence_json"], now, now),
    )
    connection.commit()
    return _record(row), True


def state_eval_failures(connection) -> list[dict]:
    """The latest recorded run per eval suite that has failures: suite, build and failed scenario ids."""
    failing = []
    for suite in EVAL_SUITE_LABELS:
        row = connection.execute(
            "SELECT build,failure_details_json FROM product_eval_runs WHERE suite = ? ORDER BY created_at DESC LIMIT 1",
            (suite,),
        ).fetchone()
        if not row:
            continue
        try:
            details = json.loads(dict(row).get("failure_details_json") or "[]")
        except (TypeError, ValueError):
            details = []
        ids = [str(item.get("scenario_id")) for item in details if isinstance(item, dict) and item.get("scenario_id")]
        if ids:
            failing.append({"suite": suite, "build": str(dict(row).get("build") or ""), "scenario_ids": ids})
    return failing


def state_eval_summary(failing: list[dict]) -> str:
    parts = []
    for item in failing:
        build = item["build"][:7] or "an unrecorded build"
        count = len(item["scenario_ids"])
        parts.append(f"Latest {EVAL_SUITE_LABELS[item['suite']]} run (build {build}) failed {count} scenario{'' if count == 1 else 's'}: "
                     + ", ".join(item["scenario_ids"][:3]) + ("…" if count > 3 else ""))
    return "; ".join(parts)[:300]


def register_project_health_investigations(application: FastAPI, settings) -> None:
    @application.get("/api/project-health-investigations")
    def list_project_health_investigations(project: ProjectId = Query(...)) -> dict:
        connection = connect(settings.connection_url())
        try:
            rows = [dict(row) for row in connection.execute(
                "SELECT * FROM project_health_investigations WHERE project = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                (project, MAX_RECORDS),
            ).fetchall()]
            return {"project": project, "records": [_record(row) for row in rows]}
        finally:
            connection.close()

    @application.post("/api/admin/project-health-investigations")
    def post_project_health_investigation(payload: InvestigationRecordInput, x_project_health_usage_key: str | None = Header(default=None)) -> dict:
        _require_usage_key(x_project_health_usage_key)
        connection = connect(settings.connection_url())
        try:
            record, created = record_open(connection, payload.project, payload.problem_key, payload.trigger, payload.summary, payload.evidence)
            return {"created": created, "record": record}
        finally:
            connection.close()

    @application.post("/api/project-health-investigations/state-eval")
    def post_state_eval_investigation(payload: StateEvalInvestigationInput) -> dict:
        connection = connect(settings.connection_url())
        try:
            failing = state_eval_failures(connection)
            if not failing:
                raise HTTPException(status_code=409, detail="The latest recorded State eval runs have no failures to record.")
            failed_ids = {sid for item in failing for sid in item["scenario_ids"]}
            if payload.scenario_id and payload.scenario_id not in failed_ids:
                raise HTTPException(status_code=409, detail="That scenario did not fail in the latest recorded run.")
            trigger = "AI eval failure · " + payload.scenario_id if payload.scenario_id else "AI eval"
            evidence = [EVAL_SUITE_LABELS[item["suite"]] + " eval run" for item in failing]
            record, created = record_open(connection, "state", "ai-eval", trigger, state_eval_summary(failing), evidence)
            return {"created": created, "record": record}
        finally:
            connection.close()

    @application.post("/api/project-health-investigations/{record_id}/outcome")
    def post_project_health_investigation_outcome(record_id: str, payload: InvestigationOutcomeInput,
                                                  x_project_health_decision_key: str | None = Header(default=None)) -> dict:
        _require_decision_key(x_project_health_decision_key)
        connection = connect(settings.connection_url())
        try:
            row = connection.execute("SELECT * FROM project_health_investigations WHERE id = ?", (record_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Unknown investigation record")
            now, note = _now(), payload.note.strip() or None
            connection.execute(
                "UPDATE project_health_investigations SET outcome = ?, outcome_note = ?, outcome_at = ? WHERE id = ?",
                (payload.outcome, note, now, record_id),
            )
            connection.commit()
            return _record({**dict(row), "outcome": payload.outcome, "outcome_note": note, "outcome_at": now})
        finally:
            connection.close()
