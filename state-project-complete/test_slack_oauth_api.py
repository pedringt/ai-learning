"""HTTP tests for the Slack "Connect Slack" OAuth endpoints."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
import urllib.parse
from pathlib import Path

from fastapi.testclient import TestClient

import api as api_module
from api import Settings, create_app


def _oauth_settings(db_path: str, **overrides) -> Settings:
    base = dict(
        database_path=db_path,
        provider="anthropic",
        cors_origins=["http://localhost:8000"],
        slack_client_id="CID",
        slack_client_secret="CSECRET",
        public_base_url="https://state-api-staging.onrender.com",
        frontend_base_url="https://example-frontend.test/app",
    )
    base.update(overrides)
    return Settings(**base)


class SlackOAuthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _client(self, settings: Settings) -> TestClient:
        app = create_app(settings, provider=None)
        context = TestClient(app)
        client = context.__enter__()
        self.addCleanup(lambda: context.__exit__(None, None, None))
        return client

    def test_start_without_config_is_503(self) -> None:
        client = self._client(_oauth_settings(self.db_path, slack_client_id=None))
        response = client.get("/api/integrations/slack/oauth/start", follow_redirects=False)
        self.assertEqual(response.status_code, 503)

    def test_start_redirects_to_slack_with_expected_params(self) -> None:
        client = self._client(_oauth_settings(self.db_path))
        response = client.get("/api/integrations/slack/oauth/start", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        location = response.headers["location"]
        self.assertTrue(location.startswith("https://slack.com/oauth/v2/authorize?"))
        query = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
        self.assertEqual(query["client_id"], ["CID"])
        self.assertEqual(query["redirect_uri"], ["https://state-api-staging.onrender.com/api/integrations/slack/oauth/callback"])
        self.assertTrue(query["state"][0])

    def test_callback_with_invalid_state_redirects_with_error_and_does_not_call_slack(self) -> None:
        client = self._client(_oauth_settings(self.db_path))
        called = {"n": 0}
        original = api_module.exchange_code_for_token
        def spy(*args, **kwargs):
            called["n"] += 1
            return original(*args, **kwargs)
        api_module.exchange_code_for_token = spy
        try:
            response = client.get(
                "/api/integrations/slack/oauth/callback?code=abc&state=not-a-real-state", follow_redirects=False
            )
        finally:
            api_module.exchange_code_for_token = original
        self.assertEqual(response.status_code, 307)
        self.assertIn("slack_connect=error", response.headers["location"])
        self.assertEqual(called["n"], 0)

    def test_callback_with_error_param_redirects_with_error(self) -> None:
        client = self._client(_oauth_settings(self.db_path))
        response = client.get("/api/integrations/slack/oauth/callback?error=access_denied", follow_redirects=False)
        self.assertIn("slack_connect=error", response.headers["location"])

    def test_successful_callback_saves_connection_and_redirects_with_success(self) -> None:
        client = self._client(_oauth_settings(self.db_path))
        start_response = client.get("/api/integrations/slack/oauth/start", follow_redirects=False)
        state = urllib.parse.parse_qs(urllib.parse.urlparse(start_response.headers["location"]).query)["state"][0]

        def fake_exchange(*, client_id, client_secret, code, redirect_uri):
            self.assertEqual(client_id, "CID")
            self.assertEqual(client_secret, "CSECRET")
            self.assertEqual(code, "good-code")
            return {"ok": True, "access_token": "xoxb-real", "team": {"id": "T1", "name": "Acme"}}

        original = api_module.exchange_code_for_token
        api_module.exchange_code_for_token = fake_exchange
        try:
            response = client.get(
                f"/api/integrations/slack/oauth/callback?code=good-code&state={state}", follow_redirects=False
            )
        finally:
            api_module.exchange_code_for_token = original

        self.assertEqual(response.status_code, 307)
        self.assertIn("slack_connect=success", response.headers["location"])
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT workspace_name, status, bot_token FROM slack_connections WHERE team_id='T1'"
            ).fetchone()
        self.assertEqual(row, ("Acme", "connected", "xoxb-real"))

    def test_state_token_is_single_use(self) -> None:
        client = self._client(_oauth_settings(self.db_path))
        start_response = client.get("/api/integrations/slack/oauth/start", follow_redirects=False)
        state = urllib.parse.parse_qs(urllib.parse.urlparse(start_response.headers["location"]).query)["state"][0]

        def fake_exchange(**kwargs):
            return {"ok": True, "access_token": "xoxb-real", "team": {"id": "T1", "name": "Acme"}}

        original = api_module.exchange_code_for_token
        api_module.exchange_code_for_token = fake_exchange
        try:
            first = client.get(f"/api/integrations/slack/oauth/callback?code=c1&state={state}", follow_redirects=False)
            second = client.get(f"/api/integrations/slack/oauth/callback?code=c2&state={state}", follow_redirects=False)
        finally:
            api_module.exchange_code_for_token = original

        self.assertIn("slack_connect=success", first.headers["location"])
        self.assertIn("slack_connect=error", second.headers["location"])


if __name__ == "__main__":
    unittest.main()
