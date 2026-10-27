"""Project Health's decision and change log (Oct 27; Paige chose server storage with key-only writes).

The log used to live in each browser's localStorage, so an entry existed only on the device that wrote it. Project
Health (the portfolio dashboard on Vercel) has no database, so the entries live here. Anyone may read them; adding or
removing one needs ``PROJECT_HEALTH_DECISION_KEY``, a separate admin key Paige enters on the dashboard. Entries are her
own short notes, never State project content, prompts, evidence or model output (DATA_PRIVACY.md).
"""
from __future__ import annotations

import hmac
import os
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import connect

ProjectId = Literal["state", "tastemake", "narc", "authority-lab"]
MAX_ENTRIES = 30


class ProjectHealthDecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectId
    type: Literal["decision", "change", "experiment"] = "decision"
    text: str = Field(min_length=1, max_length=1000)


def _require_key(supplied: str | None) -> None:
    expected = os.getenv("PROJECT_HEALTH_DECISION_KEY", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="The Project Health decision log is not configured for writes")
    if not hmac.compare_digest(str(supplied or "").encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid Project Health decision key")


def _entry(row: dict) -> dict:
    return {"id": row["id"], "type": row["entry_type"], "text": row["text"], "createdAt": str(row["created_at"])}


def register_project_health_decisions(application: FastAPI, settings) -> None:
    @application.get("/api/project-health-decisions")
    def list_project_health_decisions(project: ProjectId = Query(...)) -> dict:
        connection = connect(settings.connection_url())
        try:
            rows = [dict(row) for row in connection.execute(
                "SELECT id,entry_type,text,created_at FROM project_health_decisions WHERE project = ? "
                "ORDER BY created_at DESC, id DESC LIMIT ?",
                (project, MAX_ENTRIES),
            ).fetchall()]
            return {"project": project, "entries": [_entry(row) for row in rows]}
        finally:
            connection.close()

    @application.post("/api/project-health-decisions", status_code=201)
    def add_project_health_decision(payload: ProjectHealthDecisionInput, x_project_health_decision_key: str | None = Header(default=None)) -> dict:
        _require_key(x_project_health_decision_key)
        text = payload.text.strip()
        if not text:
            raise HTTPException(status_code=422, detail="The entry is empty")
        row = {
            "id": f"phdec_{uuid.uuid4().hex[:16]}",
            "entry_type": payload.type,
            "text": text,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f"),  # microseconds keep same-second entries in order
        }
        connection = connect(settings.connection_url())
        try:
            connection.execute(
                "INSERT INTO project_health_decisions(id,project,entry_type,text,created_at) VALUES (?,?,?,?,?)",
                (row["id"], payload.project, row["entry_type"], row["text"], row["created_at"]),
            )
            connection.commit()
            return _entry(row)
        finally:
            connection.close()

    @application.delete("/api/project-health-decisions/{entry_id}")
    def remove_project_health_decision(entry_id: str, x_project_health_decision_key: str | None = Header(default=None)) -> dict:
        _require_key(x_project_health_decision_key)
        connection = connect(settings.connection_url())
        try:
            # Look first: the cursor wrapper does not promise a rowcount on both SQLite and Postgres.
            found = connection.execute("SELECT id FROM project_health_decisions WHERE id = ?", (entry_id,)).fetchone()
            if not found:
                raise HTTPException(status_code=404, detail="Entry not found")
            connection.execute("DELETE FROM project_health_decisions WHERE id = ?", (entry_id,))
            connection.commit()
        finally:
            connection.close()
        return {"status": "removed", "id": entry_id}
