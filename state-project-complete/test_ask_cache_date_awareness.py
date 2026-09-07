"""Regression coverage for a real staleness bug found in live testing
(2026-09-07): a cached Ask answer describing "Security review is scheduled
for September 3" was still served as-is after September 3 passed. The
grounding rule in ask_service.py's _grounding_rules() already tells the
model to describe a passed date as overdue rather than upcoming -- but that
instruction only takes effect on an actual model call. A cache hit skips
the model entirely and would otherwise replay whatever tense the answer was
generated in indefinitely, since none of the cache key's other inputs
(Current State, Reviews, Questions, History, Evidence, Rules) change just
because a day passed.

ask_cache_key() now also keys on today's date so a cache hit cannot outlive
the day it was generated on, without invalidating same-day repeat questions.
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from unittest.mock import patch

from ask_service import ask_cache_key
from database_migration_backed import get_test_db


def _empty_connection():
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    return db_context, connection


def test_identical_query_and_state_produce_the_same_key_within_the_same_day():
    db_context, connection = _empty_connection()
    try:
        key_a = ask_cache_key(connection, "Prep me for the security meeting.")
        key_b = ask_cache_key(connection, "Prep me for the security meeting.")
        assert key_a == key_b, "same-day repeat questions must still hit the cache"
    finally:
        db_context.__exit__(None, None, None)


def test_cache_key_changes_when_the_calendar_day_changes_with_nothing_else_different():
    db_context, connection = _empty_connection()
    try:
        with patch("ask_service.date") as mock_date:
            mock_date.today.return_value = date(2026, 9, 2)
            key_before = ask_cache_key(connection, "Prep me for the security meeting.")

            mock_date.today.return_value = date(2026, 9, 4)
            key_after = ask_cache_key(connection, "Prep me for the security meeting.")

        assert key_before != key_after, (
            "STALE: a cache key must change once the day rolls over, even when no "
            "authority-bearing record changed -- otherwise a cached answer describing "
            "a since-passed date (e.g. 'scheduled for September 3') can be served "
            "verbatim indefinitely, bypassing the model's own date-awareness "
            "instructions in _grounding_rules() entirely."
        )
    finally:
        db_context.__exit__(None, None, None)
