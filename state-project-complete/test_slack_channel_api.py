"""HTTP tests for the Slack Phase 2 channel-config and health endpoints.

These are read/write surfaces for Settings' Slack section: listing known
channels, toggling a channel's ingestion config, and a compact health
readout. No OAuth/connect flow exists yet, so channels only appear once
Slack has sent an event from them (or a channel was seeded directly, as
these tests do).
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app

TEAM_ID = "T123"
CHANNEL_ID = "C_APPROVED"


class SlackChannelApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"]),
            provider=None,
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO slack_channels "
                "(id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, ingestion_started_at) "
                "VALUES (?,?,?,?,1,1,0,'2000-01-01T00:00:00+00:00')",
                ("slkch_1", TEAM_ID, CHANNEL_ID, "northstar-project"),
            )
            connection.commit()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_list_channels_returns_known_channel(self) -> None:
        response = self.client.get("/api/integrations/slack/channels")
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["channel_name"], "northstar-project")
        self.assertTrue(items[0]["enabled"])
        self.assertIsNone(items[0]["last_event_at"])

    def test_patch_channel_toggles_enabled(self) -> None:
        response = self.client.patch("/api/integrations/slack/channels/slkch_1", json={"enabled": False})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])

        items = self.client.get("/api/integrations/slack/channels").json()["items"]
        self.assertFalse(items[0]["enabled"])

    def test_patch_unknown_channel_is_404(self) -> None:
        response = self.client.patch("/api/integrations/slack/channels/nope", json={"enabled": False})
        self.assertEqual(response.status_code, 404)

    def test_patch_with_no_fields_is_400(self) -> None:
        response = self.client.patch("/api/integrations/slack/channels/slkch_1", json={})
        self.assertEqual(response.status_code, 400)

    def test_health_reports_not_connected_when_no_connection_row(self) -> None:
        response = self.client.get("/api/integrations/slack/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["connected"])
        self.assertEqual(body["pending_checkpoints"], 0)

    def test_health_reports_pending_checkpoints(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO slack_conversations (id, team_id, channel_id, thread_root_ts, last_activity_at, "
                "next_checkpoint_at) VALUES ('conv1', ?, ?, '100.0', '2026-01-01T00:00:00+00:00', "
                "'9999-12-31T00:00:00+00:00')",
                (TEAM_ID, CHANNEL_ID),
            )
            connection.execute(
                "INSERT INTO slack_checkpoints (id, conversation_id, version, included_message_ids, status) "
                "VALUES ('chk1', 'conv1', 1, '[]', 'ready_for_relevance')"
            )
            connection.commit()

        body = self.client.get("/api/integrations/slack/health").json()
        self.assertEqual(body["pending_checkpoints"], 1)


if __name__ == "__main__":
    unittest.main()
