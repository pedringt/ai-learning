"""#709: which project a request works in.

A request names its project with the `X-State-Project-Id` header. When that
project no longer exists (deleted in another tab, or a staging database that
re-seeded on restart), the request is refused with `project_unavailable`. It
used to fall back silently to the shared `active_project` row, which is
Northstar after a delete, so a tab still showing the old project wrote its
notes into Northstar.

The shared row is used only when a request names no project at all: a client
that has not loaded a project yet, or a caller that predates the header.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from db import DB_ERRORS

PROJECT_UNAVAILABLE = "project_unavailable"


class ProjectUnavailableError(Exception):
    def __init__(self, project_id: str):
        super().__init__(project_id)
        self.project_id = project_id


def project_unavailable_http(project_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail={
        "code": PROJECT_UNAVAILABLE,
        "project_id": project_id,
        "error_details": {"error_message": "This project is no longer available. Nothing was saved."},
    })


def project_exists(connection: Any, project_id: str) -> bool:
    return connection.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone() is not None


def scope_connection(connection: Any, requested: str | None, *, allow_unavailable: bool = False) -> None:
    """Point `connection.project_id` at the requested project, or at the shared row when none is named.

    Raises ProjectUnavailableError when `requested` names a project that does not exist, unless
    `allow_unavailable` (routes that manage projects themselves, such as listing and switching, which a tab
    whose project is gone must still be able to call).
    """
    requested = (requested or "").strip() or None
    try:
        row = connection.execute("SELECT project_id FROM active_project WHERE id=1").fetchone()
    except DB_ERRORS:
        # Expected only before migrations have created the table (first startup). On Postgres a failed
        # statement aborts the transaction until a rollback (Sept 14 incident), so roll back before more SQL.
        if connection.is_postgres:
            connection.rollback()
        row = None
    if row:
        connection.project_id = row["project_id"]
    if not requested:
        return
    if project_exists(connection, requested):
        connection.project_id = requested
    elif not allow_unavailable:
        raise ProjectUnavailableError(requested)
