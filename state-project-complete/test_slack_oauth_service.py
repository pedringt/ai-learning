"""Tests for the Slack OAuth token exchange and connection storage."""

from __future__ import annotations

import json
import unittest

from database_migration_backed import get_test_db
from slack_oauth_service import (
    SlackOAuthError,
    build_authorize_url,
    disconnect_most_recent,
    exchange_code_for_token,
    save_connection,
)


def test_build_authorize_url_includes_required_params():
    url = build_authorize_url(client_id="CID", redirect_uri="https://example.com/cb", state="abc123")
    assert url.startswith("https://slack.com/oauth/v2/authorize?")
    assert "client_id=CID" in url
    assert "state=abc123" in url
    assert "redirect_uri=https%3A%2F%2Fexample.com%2Fcb" in url
    assert "scope=channels%3Aread%2Cchannels%3Ahistory" in url


def test_exchange_code_for_token_returns_payload_on_success():
    def fake_post(url, body):
        assert url == "https://slack.com/api/oauth.v2.access"
        assert b"code=good-code" in body
        return json.dumps({"ok": True, "access_token": "xoxb-abc", "team": {"id": "T1", "name": "Acme"}}).encode()

    payload = exchange_code_for_token(
        client_id="CID", client_secret="SECRET", code="good-code",
        redirect_uri="https://example.com/cb", post=fake_post,
    )
    assert payload["access_token"] == "xoxb-abc"
    assert payload["team"]["id"] == "T1"


def test_exchange_code_for_token_raises_on_slack_error():
    def fake_post(url, body):
        return json.dumps({"ok": False, "error": "invalid_code"}).encode()

    try:
        exchange_code_for_token(
            client_id="CID", client_secret="SECRET", code="bad-code",
            redirect_uri="https://example.com/cb", post=fake_post,
        )
        assert False, "expected SlackOAuthError"
    except SlackOAuthError as exc:
        assert "invalid_code" in str(exc)


def test_exchange_code_for_token_raises_on_non_json_response():
    def fake_post(url, body):
        return b"<html>not json</html>"

    try:
        exchange_code_for_token(
            client_id="CID", client_secret="SECRET", code="x",
            redirect_uri="https://example.com/cb", post=fake_post,
        )
        assert False, "expected SlackOAuthError"
    except SlackOAuthError:
        pass


class SaveConnectionTest(unittest.TestCase):
    def setUp(self):
        self.db_context = get_test_db()
        self.conn = self.db_context.__enter__()
        self.conn.row_factory = None

    def tearDown(self):
        self.db_context.__exit__(None, None, None)

    def test_creates_new_connection_row(self):
        save_connection(self.conn, team_id="T1", workspace_name="Acme", bot_token="xoxb-1", environment="staging")
        row = self.conn.execute("SELECT team_id, workspace_name, status, bot_token FROM slack_connections WHERE team_id='T1'").fetchone()
        self.assertEqual(dict(row), {"team_id": "T1", "workspace_name": "Acme", "status": "connected", "bot_token": "xoxb-1"})

    def test_reconnecting_updates_existing_row_instead_of_duplicating(self):
        save_connection(self.conn, team_id="T1", workspace_name="Acme", bot_token="xoxb-1", environment="staging")
        save_connection(self.conn, team_id="T1", workspace_name="Acme Renamed", bot_token="xoxb-2", environment="staging")
        count = self.conn.execute("SELECT COUNT(*) FROM slack_connections WHERE team_id='T1'").fetchone()[0]
        self.assertEqual(count, 1)
        row = self.conn.execute("SELECT workspace_name, bot_token FROM slack_connections WHERE team_id='T1'").fetchone()
        self.assertEqual(dict(row), {"workspace_name": "Acme Renamed", "bot_token": "xoxb-2"})

    def test_missing_team_id_raises(self):
        with self.assertRaises(SlackOAuthError):
            save_connection(self.conn, team_id="", workspace_name="Acme", bot_token="xoxb-1", environment="staging")

    def test_disconnect_marks_connected_row_disconnected_and_clears_token(self):
        save_connection(self.conn, team_id="T1", workspace_name="Acme", bot_token="xoxb-1", environment="staging")
        self.assertTrue(disconnect_most_recent(self.conn))
        row = self.conn.execute("SELECT status, bot_token FROM slack_connections WHERE team_id='T1'").fetchone()
        self.assertEqual(dict(row), {"status": "disconnected", "bot_token": None})

    def test_disconnect_with_nothing_connected_returns_false(self):
        self.assertFalse(disconnect_most_recent(self.conn))

    def test_reconnecting_after_disconnect_marks_connected_again(self):
        save_connection(self.conn, team_id="T1", workspace_name="Acme", bot_token="xoxb-1", environment="staging")
        disconnect_most_recent(self.conn)
        save_connection(self.conn, team_id="T1", workspace_name="Acme", bot_token="xoxb-2", environment="staging")
        row = self.conn.execute("SELECT status, bot_token FROM slack_connections WHERE team_id='T1'").fetchone()
        self.assertEqual(dict(row), {"status": "connected", "bot_token": "xoxb-2"})


if __name__ == "__main__":
    unittest.main()
