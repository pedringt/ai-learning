"""Prompt-level regressions for Baseline Setup quality rules from dogfooding."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app
import baseline_setup
from db import connect_sqlite


class BaselinePromptHardeningTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True))
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "Prompt Quality Test"})
        self.assertEqual(created.status_code, 200)
        self.project = created.json()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _prompt(self, project_id):
        connection = connect_sqlite(self.db_path)
        try:
            connection.project_id = project_id
            return baseline_setup.baseline_prompt_guidance(
                connection,
                {"id": "evidence_prompt", "content": "Starting material"},
            )
        finally:
            connection.close()

    def test_baseline_prompt_reserves_reviews_for_real_judgment(self):
        prompt = self._prompt(self.project["id"])
        self.assertIn("<baseline_setup_quality_checks>", prompt)
        self.assertIn("Do not manufacture a separate Review", prompt)
        self.assertIn("If sources disagree", prompt)
        self.assertIn("DO NOT choose one", prompt)
        self.assertIn("open_question or state_at_risk", prompt)

    def test_baseline_prompt_locks_in_dogfood_quality_findings(self):
        prompt = self._prompt(self.project["id"])
        self.assertIn("Project stage and Project outcome are special header facts", prompt)
        self.assertIn("Never say a plan has N exercises/components/items while naming only some", prompt)
        self.assertIn("setup feedback, not durable project truth", prompt)
        self.assertIn('"Governance" plus "Governance & Controls"', prompt)
        self.assertIn("A learning exercise belongs under the learning plan/learning area", prompt)
        self.assertIn("provenance/process metadata, not project truth", prompt)

    def test_established_project_does_not_receive_baseline_only_quality_guidance(self):
        prompt = self._prompt("northstar")
        self.assertNotIn("<baseline_setup_quality_checks>", prompt)


if __name__ == "__main__":
    unittest.main()
