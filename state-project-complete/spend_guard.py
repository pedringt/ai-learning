"""Daily cap on State's paid model spend (#529, Oct 19; $50/day chosen by Paige).

Ask and Evidence interpretation are open to anonymous visitors, so a script could otherwise spend
hundreds of dollars a day. This adds up today's (UTC) recorded model calls from model_call_metrics,
priced per model, and refuses new model work once the total reaches the cap. Everything that does not
call a model keeps working.

- STATE_DAILY_MODEL_SPEND_CAP_USD sets the cap (default 50). "off" disables it.
- model_call_metrics records Ask and interpretation calls. Two small call types are not recorded (the
  relevance check, about 300 output tokens, and omission detection), so real spend runs slightly above
  the recorded total; the cap is a guard, not an invoice.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("state.spend_guard")

DEFAULT_DAILY_CAP_USD = 50.0
CAP_REACHED_MESSAGE = (
    "State has reached today's AI usage limit, so new questions and new Evidence analysis are paused "
    "until midnight UTC. Everything already in the project is still available."
)

# USD per million tokens (input, output), from the claude-api skill's model table, checked 2026-10-19.
# An unknown model is priced at the most expensive rate so the guard errs toward stopping.
PRICES: dict[str, tuple[float, float]] = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}
_UNKNOWN_PRICE = (4.00, 20.00)


class DailySpendCapReached(RuntimeError):
    """Raised before a model call once today's recorded spend has reached the cap."""


def daily_cap_usd() -> float | None:
    raw = (os.getenv("STATE_DAILY_MODEL_SPEND_CAP_USD") or "").strip().lower()
    if raw == "off":
        return None
    if not raw:
        return DEFAULT_DAILY_CAP_USD
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Ignoring unreadable STATE_DAILY_MODEL_SPEND_CAP_USD=%r; using the default", raw)
        return DEFAULT_DAILY_CAP_USD
    return value if value > 0 else None


def _price(model: str) -> tuple[float, float]:
    for prefix, price in PRICES.items():
        if model == prefix or model.startswith(prefix + "-"):
            return price
    return _UNKNOWN_PRICE


def today_spend_usd(connection: Any, now: datetime | None = None) -> float:
    """Recorded model spend since midnight UTC, across every project. Project Health's investigator records
    its calls in the same table (project_health_usage_api.py); that is portfolio-dashboard spend, not State's,
    so it never counts toward State's cap (Oct 20)."""
    start = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d 00:00:00")
    rows = connection.execute(
        "SELECT model_identifier, COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0) "
        "FROM model_call_metrics WHERE occurred_at >= ? AND operation NOT LIKE 'project_health_%' GROUP BY model_identifier",
        (start,),
    ).fetchall()
    total = 0.0
    for row in rows:
        model, inp, out = row[0], row[1], row[2]
        price_in, price_out = _price(str(model or ""))
        total += (int(inp or 0) * price_in + int(out or 0) * price_out) / 1_000_000
    return total


def check_daily_budget(connection: Any, now: datetime | None = None) -> None:
    """Raise DailySpendCapReached when today's recorded spend has reached the cap."""
    cap = daily_cap_usd()
    if cap is None:
        return
    try:
        spent = today_spend_usd(connection, now)
    except Exception:
        # The guard must never take State down: if the metrics table cannot be read, allow the call
        # (and on Postgres clear the aborted transaction, CLAUDE.md Sept 14 incident).
        logger.warning("Could not read today's model spend; allowing the call", exc_info=True)
        if getattr(connection, "is_postgres", False):
            connection.rollback()
        return
    if spent >= cap:
        logger.warning("Daily model spend cap reached: $%.2f of $%.2f", spent, cap)
        raise DailySpendCapReached(CAP_REACHED_MESSAGE)
