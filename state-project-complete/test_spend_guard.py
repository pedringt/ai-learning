"""#529: the daily cap on State's paid model spend (no model calls)."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import get_test_db
from spend_guard import (
    CAP_REACHED_MESSAGE, DailySpendCapReached, check_daily_budget, daily_cap_usd, today_spend_usd,
)


def _record(connection, model: str, inp: int, out: int, when: str | None = None) -> None:
    if when is None:
        connection.execute(
            "INSERT INTO model_call_metrics(id, project_id, operation, provider, model_identifier, duration_ms, "
            "input_tokens, output_tokens) VALUES (?, 'northstar', 'ask', 'anthropic', ?, 1, ?, ?)",
            (f"m{inp}{out}{model}", model, inp, out),
        )
    else:
        connection.execute(
            "INSERT INTO model_call_metrics(id, project_id, operation, provider, model_identifier, duration_ms, "
            "input_tokens, output_tokens, occurred_at) VALUES (?, 'northstar', 'ask', 'anthropic', ?, 1, ?, ?, ?)",
            (f"m{inp}{out}{model}{when}", model, inp, out, when),
        )
    connection.commit()


class SpendGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self._db = get_test_db()
        self.connection = self._db.__enter__()
        self.addCleanup(self._db.__exit__, None, None, None)

    def test_today_spend_prices_each_model_and_ignores_earlier_days(self) -> None:
        _record(self.connection, "claude-haiku-5-5", 1_000_000, 1_000_000)  # $0.60
        _record(self.connection, "claude-opus-5-5", 100_000, 0)  # $0.40
        _record(self.connection, "claude-haiku-5-5", 10_000_000, 0, when="2020-01-01 12:00:00")
        self.assertAlmostEqual(today_spend_usd(self.connection), 1.00, places=6)

    def test_unknown_model_is_priced_at_the_highest_rate(self) -> None:
        _record(self.connection, "some-new-model", 1_000_000, 0)
        self.assertAlmostEqual(today_spend_usd(self.connection), 4.00, places=6)

    def test_cap_raises_once_reached_and_not_before(self) -> None:
        _record(self.connection, "claude-opus-5-5", 0, 2_000_000)  # $40
        check_daily_budget(self.connection)
        _record(self.connection, "claude-opus-5-5", 0, 500_000)  # +$10 = $50
        with self.assertRaises(DailySpendCapReached):
            check_daily_budget(self.connection)

    def test_cap_setting(self) -> None:
        import os
        from unittest import mock
        with mock.patch.dict(os.environ, {"STATE_DAILY_MODEL_SPEND_CAP_USD": ""}):
            self.assertEqual(daily_cap_usd(), 50.0)
        with mock.patch.dict(os.environ, {"STATE_DAILY_MODEL_SPEND_CAP_USD": "12.5"}):
            self.assertEqual(daily_cap_usd(), 12.5)
        with mock.patch.dict(os.environ, {"STATE_DAILY_MODEL_SPEND_CAP_USD": "off"}):
            self.assertIsNone(daily_cap_usd())
            _record(self.connection, "claude-opus-5-5", 0, 10_000_000)
            check_daily_budget(self.connection)  # disabled: never raises


class SpendCapApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"]),
                         provider=None)
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _spend(self, dollars_of_opus_output: float) -> None:
        with sqlite3.connect(self.db_path) as connection:
            _record(connection, "claude-opus-5-5", 0, int(dollars_of_opus_output / 20 * 1_000_000))

    def test_model_routes_return_429_with_a_readable_message_once_capped(self) -> None:
        self._spend(60)
        for path, body in (("/api/ask", {"query": "Are we ready?"}), ("/api/evidence", {"content": "x", "source_type": "manual_note"})):
            response = self.client.post(path, json=body, headers={"Origin": "http://localhost:8000"})
            self.assertEqual(response.status_code, 429, path)
            self.assertEqual(response.json()["detail"], CAP_REACHED_MESSAGE)
            self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:8000")

    def test_reads_and_non_model_writes_keep_working_when_capped(self) -> None:
        self._spend(60)
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/api/bootstrap").status_code, 200)
        response = self.client.post("/api/questions", json={"text": "Who owns retention?", "blocking": False})
        self.assertNotEqual(response.status_code, 429)

    def test_under_the_cap_the_route_is_not_blocked(self) -> None:
        self._spend(1)
        response = self.client.post("/api/ask", json={"query": "Are we ready?"})
        self.assertNotEqual(response.status_code, 429)


class InterpretationGuardTests(unittest.TestCase):
    def test_background_interpretation_checks_the_cap_before_calling_the_model(self) -> None:
        from anthropic_provider import AnthropicProvider

        with get_test_db() as connection:
            _record(connection, "claude-opus-5-5", 0, 3_000_000)  # $60
            provider = AnthropicProvider(api_key="test-key")

            class _NoCall:
                class messages:
                    @staticmethod
                    def create(**kwargs):
                        raise AssertionError("the model must not be called once capped")

            provider._client = _NoCall()
            with self.assertRaises(DailySpendCapReached):
                provider.interpret(context={}, evidence={"id": "e1", "content": "x"}, connection=connection)


if __name__ == "__main__":
    unittest.main()
