"""#678 / DEC-026: when a person last confirmed each Current State item, and re-check reminders.

Only a person confirms an item: accepting a Review, "Leave unchanged" on a proposed change, "Dismiss concern" on an
at-risk Review, or "Still true". "Keep tracking" does not. Nothing here ever changes an item's statement; an item
past its re-check interval is only flagged.

An item's last confirmation is ``last_confirmed_at``, falling back to ``updated_at`` (its last accepted change) for
items nobody has confirmed since migration 026. Reminders are off unless the project sets ``recheck_days``; an item's
own ``recheck_days`` overrides the project's.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from db import Connection, project_id_of
from interpretation_pipeline_integrated import new_id

RECHECK_DAY_CHOICES = (30, 60, 90, 180)
MAX_NOTE_LENGTH = 500


class StateItemNotFoundError(LookupError):
    pass


def _as_datetime(value: Any) -> datetime | None:
    """SQLite returns 'YYYY-MM-DD HH:MM:SS' text and Postgres a datetime; both are UTC."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("T", " ").replace("Z", "")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:26], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _iso(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def project_recheck_days(connection: Connection, project_id: str | None = None) -> int | None:
    row = connection.execute("SELECT recheck_days FROM projects WHERE id=?", (project_id or project_id_of(connection),)).fetchone()
    return row["recheck_days"] if row else None


def annotate_state_items(connection: Connection, items: list[dict], *, now: datetime | None = None) -> list[dict]:
    """Add each item's last confirmation, its effective interval and whether it needs a re-check."""
    now = now or datetime.now(timezone.utc)
    project_days = project_recheck_days(connection)
    for item in items:
        confirmed = _as_datetime(item.get("last_confirmed_at")) or _as_datetime(item.get("updated_at"))
        days = item.get("recheck_days") or project_days
        item["last_confirmed_at"] = _iso(confirmed)
        item["effective_recheck_days"] = days
        item["needs_recheck"] = bool(days and confirmed and now - confirmed > timedelta(days=days))
    return items


def confirm_items(connection: Connection, state_ids: Iterable[str]) -> None:
    """Record that a person confirmed these active items now (a Review decision; no History entry of its own)."""
    ids = sorted({sid for sid in state_ids if sid})
    if not ids:
        return
    marks = ",".join("?" for _ in ids)
    connection.execute(
        f"UPDATE current_state_items SET last_confirmed_at=CURRENT_TIMESTAMP "
        f"WHERE status='active' AND project_id=? AND id IN ({marks})",
        (project_id_of(connection), *ids),
    )


def review_confirmation_targets(connection: Connection, review_id: str) -> list[str]:
    """The Current State items a Review is about: its linked items and its proposals' existing targets."""
    rows = connection.execute(
        "SELECT state_item_id FROM review_state_items WHERE review_id=? "
        "UNION SELECT state_item_id FROM proposed_state_changes WHERE review_id=? AND state_item_id IS NOT NULL",
        (review_id, review_id),
    ).fetchall()
    return [row["state_item_id"] for row in rows]


def confirms_on_decision(review_type: str, decision: str) -> bool:
    """DEC-026: accept, Leave unchanged ("keep" on a proposed change) and Dismiss concern ("reject" on an at-risk
    Review) confirm; Keep tracking ("keep" on an at-risk Review) does not. Keyed on the decision, because the
    stored resolution for Keep tracking is 'confirmed_current'."""
    if decision == "accept":
        return True
    if review_type == "state_at_risk":
        return decision == "reject"
    return decision == "keep"


def confirm_still_true(connection: Connection, state_id: str, note: str | None = None) -> dict:
    """A person's explicit "Still true": moves the date and adds a History entry with the optional note."""
    pid = project_id_of(connection)
    row = connection.execute(
        "SELECT id FROM current_state_items WHERE id=? AND status='active' AND project_id=?", (state_id, pid)
    ).fetchone()
    if row is None:
        raise StateItemNotFoundError(state_id)
    note = (note or "").strip()[:MAX_NOTE_LENGTH] or None
    confirmation_id = new_id("confirm")
    connection.execute(
        "INSERT INTO state_confirmations(id, state_item_id, project_id, note) VALUES (?, ?, ?, ?)",
        (confirmation_id, state_id, pid, note),
    )
    confirm_items(connection, [state_id])
    connection.commit()
    return {"id": confirmation_id, "state_item_id": state_id, "note": note}


def set_item_recheck_days(connection: Connection, state_id: str, days: int | None) -> None:
    cursor = connection.execute(
        "UPDATE current_state_items SET recheck_days=? WHERE id=? AND status='active' AND project_id=?",
        (days, state_id, project_id_of(connection)),
    )
    if getattr(cursor, "rowcount", 1) == 0:
        raise StateItemNotFoundError(state_id)
    connection.commit()


def set_project_recheck_days(connection: Connection, days: int | None) -> None:
    connection.execute("UPDATE projects SET recheck_days=? WHERE id=?", (days, project_id_of(connection)))
    connection.commit()


def list_still_true_confirmations(connection: Connection) -> list[dict]:
    """History entries for "Still true", newest first."""
    rows = connection.execute(
        "SELECT c.id, c.state_item_id, c.note, c.confirmed_at, s.statement, s.topic "
        "FROM state_confirmations c JOIN current_state_items s ON s.id=c.state_item_id "
        "WHERE c.project_id=? ORDER BY c.confirmed_at DESC, c.id DESC",
        (project_id_of(connection),),
    ).fetchall()
    return [{**dict(row), "confirmed_at": _iso(_as_datetime(row["confirmed_at"]))} for row in rows]
