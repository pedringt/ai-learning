"""Withheld Ask statements, kept for review (#662, Paige Nov 14).

When Ask's checks leave a claim or card out of an answer, the person sees only how many and what kind
(ask_display.withheld_line). This module keeps what was left out, so it can be checked: the statement and the
question, each cut to 300 characters, with the reason, kind, cited record, basis, project, build and time. Every
project, production and staging. Rows older than 90 days are deleted on each write. There is no page for this table:
it is read from the Render shell or a script. This is an approved exception in docs/product/DATA_PRIVACY.md.

Best-effort: a failed write is logged and never fails the Ask response.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping

from db import project_id_of

logger = logging.getLogger(__name__)

TEXT_LIMIT = 300
RETENTION_DAYS = 90


def withheld_kind(reason: str | None) -> str:
    """The kind of reason a statement was withheld (ask_display.WITHHELD_KIND_PHRASES keys)."""
    reason = (reason or "").removeprefix("detail line: ")
    if reason.startswith("reference check failed") or reason.startswith("card's record"):
        return "reference"
    if reason.startswith("anchor check failed") or reason.startswith("figure ") or reason.startswith("a date or month"):
        return "figure"
    if reason.startswith("permission ("):
        return "permission"
    if reason.startswith("status ("):
        return "settled"
    if reason.startswith("restates the draft's assumption"):
        return "draft"
    if reason.startswith("freshness verdict"):           # #703 (DEC-029)
        return "freshness"
    if reason.startswith("says no record covers"):       # #704 (DEC-029)
        return "absence"
    return "other"


def _build() -> str:
    sha = (os.getenv("RENDER_GIT_COMMIT") or "").strip()
    return sha[:12] if sha else (os.getenv("STATE_BUILD_REV", "local-dev").strip() or "local-dev")


def _cut(value: Any) -> str | None:
    text = " ".join(str(value or "").split())
    return text[:TEXT_LIMIT] if text else None


def record_withheld(connection: Any, query: str, units: Iterable[Mapping[str, Any]], *, now: datetime | None = None) -> None:
    """Store each withheld unit (decision-log entries from ask_service) and prune rows past the retention period."""
    units = list(units)
    if not units:
        return
    now = now or datetime.now(timezone.utc)
    try:
        project_id = project_id_of(connection)
        build = _build()
        stamp = now.strftime("%Y-%m-%d %H:%M:%S")
        for unit in units:
            connection.execute(
                "INSERT INTO ask_withheld_units(id, project_id, build, unit, kind, reason, basis, record_id, "
                "statement_text, question_text, occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (f"withheld_{uuid.uuid4().hex[:16]}", project_id, build, str(unit.get("unit") or "claim"),
                 withheld_kind(unit.get("reason")), _cut(unit.get("reason")), unit.get("basis"),
                 unit.get("primary_record_id"), _cut(unit.get("raw_text")), _cut(query), stamp),
            )
        cutoff = (now - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
        connection.execute("DELETE FROM ask_withheld_units WHERE occurred_at < ?", (cutoff,))
        connection.commit()
    except Exception:  # broad on purpose: this review log must never fail Ask
        logger.warning("Could not record withheld Ask statements", exc_info=True)
        # A failed INSERT must not leave a Postgres transaction aborted for the rest of the request.
        if getattr(connection, "is_postgres", False):
            connection.rollback()
