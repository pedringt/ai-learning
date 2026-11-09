"""#626: POST /api/admin/eval-runs records controlled-eval results into Project Health. Its key is now compared in
constant time (hmac.compare_digest), like the decisions API; these pin who gets in."""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from api import Settings, create_app

RUN = {"suite": "consequentiality", "total": 3, "precision": 1.0, "recall": 1.0}


class EvalIngestKeyTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        app = create_app(Settings(database_path=str(Path(self.tempdir.name) / "state.db"), provider="anthropic", cors_origins=[]))
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def post(self, key=None):
        headers = {"X-State-Eval-Key": key} if key is not None else {}
        return self.client.post("/api/admin/eval-runs", json=RUN, headers=headers)

    def test_unconfigured_ingestion_is_unavailable(self):
        with mock.patch.dict(os.environ, {"STATE_EVAL_INGEST_KEY": ""}):
            self.assertEqual(self.post("anything").status_code, 503)

    def test_wrong_or_missing_key_is_rejected(self):
        with mock.patch.dict(os.environ, {"STATE_EVAL_INGEST_KEY": "secret-key"}):
            self.assertEqual(self.post("secret-kez").status_code, 403)
            self.assertEqual(self.post("secret").status_code, 403)
            self.assertEqual(self.post().status_code, 403)

    def test_correct_key_records_the_run(self):
        with mock.patch.dict(os.environ, {"STATE_EVAL_INGEST_KEY": "secret-key"}):
            response = self.post("secret-key")
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["status"], "recorded")


if __name__ == "__main__":
    unittest.main()
