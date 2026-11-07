"""Nov 5 audit: production had no STATE_ENVIRONMENT in render.yaml, and the default labelled its Slack connections
and analytics rows "staging". Render's own branch variable now decides the default."""
from __future__ import annotations

import os
import unittest
from unittest import mock

from api import Settings


class SettingsEnvironmentTests(unittest.TestCase):
    def environment_for(self, **env):
        base = {"DATABASE_URL": "sqlite:///tmp/unused.db"}
        with mock.patch.dict(os.environ, {**base, **env}, clear=True):
            return Settings.from_env().environment

    def test_main_branch_on_render_defaults_to_production(self):
        self.assertEqual(self.environment_for(RENDER_GIT_BRANCH="main"), "production")

    def test_other_branches_and_local_runs_default_to_staging(self):
        self.assertEqual(self.environment_for(RENDER_GIT_BRANCH="staging"), "staging")
        self.assertEqual(self.environment_for(), "staging")

    def test_explicit_setting_wins(self):
        self.assertEqual(self.environment_for(RENDER_GIT_BRANCH="main", STATE_ENVIRONMENT="Staging"), "staging")


if __name__ == "__main__":
    unittest.main()
