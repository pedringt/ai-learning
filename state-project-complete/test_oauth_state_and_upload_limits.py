"""#619: paths that let one visitor grow memory without limit.

- Each GET /api/integrations/slack/oauth/start stored a state token that only a completed callback removed.
- Both upload routes read the whole request file into memory before checking the 15 MB limit.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app
from api_core import _OAUTH_STATE_LIMIT, _remember_oauth_state


class OAuthStateTests(unittest.TestCase):
    def test_expired_states_are_dropped_on_each_start(self):
        states = {"old-1": 100.0, "old-2": 599.0, "live": 2000.0}
        _remember_oauth_state(states, "new", now=1000.0)
        self.assertEqual(set(states), {"live", "new"})
        self.assertEqual(states["new"], 1600.0)

    def test_at_most_the_limit_is_kept_oldest_first(self):
        states = {f"s{i}": 5000.0 + i for i in range(_OAUTH_STATE_LIMIT)}
        _remember_oauth_state(states, "new", now=1000.0)
        self.assertEqual(len(states), _OAUTH_STATE_LIMIT)
        self.assertNotIn("s0", states)
        self.assertIn("new", states)

    def test_repeated_starts_do_not_grow_memory_past_the_limit(self):
        with tempfile.TemporaryDirectory() as tempdir:
            app = create_app(Settings(
                database_path=str(Path(tempdir) / "state.db"), provider="anthropic", cors_origins=[],
                slack_client_id="client", public_base_url="https://api.example.test",
            ))
            with TestClient(app) as client:
                for _ in range(_OAUTH_STATE_LIMIT + 25):
                    response = client.get("/api/integrations/slack/oauth/start", follow_redirects=False)
                    self.assertIn(response.status_code, (302, 307))
                self.assertEqual(len(app.state.slack_oauth_states), _OAUTH_STATE_LIMIT)


class UploadReadLimitTests(unittest.TestCase):
    def test_oversized_uploads_are_rejected_on_both_routes(self):
        big = b"x" * (15_000_000 + 10)
        with tempfile.TemporaryDirectory() as tempdir:
            app = create_app(Settings(database_path=str(Path(tempdir) / "state.db"), provider="anthropic",
                                      cors_origins=[], demo_bootstrap=True))
            with TestClient(app) as client:
                plain = client.post("/api/evidence/upload", files={"file": ("big.txt", big, "text/plain")})
                self.assertEqual(plain.status_code, 422)
                self.assertEqual(plain.json()["detail"]["code"], "file_too_large")
                baseline = client.post("/api/baseline/evidence/upload", headers={"X-State-Project-Id": "northstar"},
                                       files={"file": ("big.txt", big, "text/plain")})
                self.assertEqual(baseline.status_code, 422)
                self.assertEqual(baseline.json()["detail"]["code"], "file_too_large")


if __name__ == "__main__":
    unittest.main()
