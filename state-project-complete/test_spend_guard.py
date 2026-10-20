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

    def test_project_health_calls_do_not_count_toward_states_cap(self) -> None:
        self.connection.execute(
            "INSERT INTO model_call_metrics(id, project_id, operation, provider, model_identifier, duration_ms, "
            "input_tokens, output_tokens) VALUES ('ph1', NULL, 'project_health_investigation:narc', 'anthropic', "
            "'claude-opus-5-5', 1, 10000000, 0)",
        )
        self.connection.commit()
        self.assertEqual(today_spend_usd(self.connection), 0.0)

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


class BudgetMessageTests(unittest.TestCase):
    """Oct 20: when the AI budget is used up, visitors see a calm, honest message (Paige's wording)."""

    def test_provider_budget_errors_are_recognised_and_ordinary_errors_are_not(self) -> None:
        from spend_guard import is_ai_budget_exhausted
        oct20 = ("Error code: 429 - {'type': 'error', 'error': {'type': 'rate_limit_error', 'message': \"You have reached "
                 "your API usage limits: your organization has crossed its monthly API usage threshold\", 'details': "
                 "{'error_code': 'enforced_spend_limit_reached'}}}")
        self.assertTrue(is_ai_budget_exhausted(oct20))
        self.assertTrue(is_ai_budget_exhausted("Your credit balance is too low to access the Anthropic API."))
        self.assertTrue(is_ai_budget_exhausted(DailySpendCapReached(CAP_REACHED_MESSAGE)))
        self.assertFalse(is_ai_budget_exhausted("Error code: 429 - rate_limit_error: Number of requests per minute exceeded"))
        self.assertFalse(is_ai_budget_exhausted("Request timed out."))

    def test_ask_shows_the_budget_message_when_the_account_limit_is_hit(self) -> None:
        from spend_guard import AI_BUDGET_MESSAGE

        class _BudgetHitProvider:
            def run(self, prompt):
                raise RuntimeError("Error code: 429 - enforced_spend_limit_reached: You have reached your API usage limits")

        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(Settings(database_path=str(Path(tmp) / "s.db"), provider="anthropic", cors_origins=[]), provider=None)
            with TestClient(app) as client:
                app.state.ask_provider = _BudgetHitProvider()
                response = client.post("/api/ask", json={"query": "What is the pilot status?"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], AI_BUDGET_MESSAGE)
        self.assertIn("personal AI budget", AI_BUDGET_MESSAGE)
