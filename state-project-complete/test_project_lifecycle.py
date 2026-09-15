"""Blank-project bug report (2026-09-15), item 3: seeded demo projects
(Northstar, Juniper) get Reset (restore the curated baseline); user-created
projects get Delete (permanently remove); neither lifecycle action is
available on the other kind of project, and neither can ever touch a
different project's data.

Also locks in a real bug found while implementing this: reset_demo_data()
used to accept ANY project_id and, for anything other than 'northstar',
unconditionally call bootstrap_juniper_demo_data() -- which hardcodes
project_id="juniper" internally. So "resetting" a user-created project wiped
its data and inserted nothing back under its own id (the Juniper-shaped
rows either landed on the real Juniper project or were silently ignored by
INSERT OR IGNORE, since their ids already existed there), leaving the user's
project empty while claiming to have restored a baseline.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect_sqlite
from seed_demo import SEEDED_PROJECT_IDS, bootstrap_demo_data, delete_project_data, reset_demo_data


class ProjectLifecycleApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True))
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _create_project(self, name="AI Notes"):
        response = self.client.post("/api/projects", json={"name": name})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_projects_report_whether_they_are_seeded(self):
        projects = self.client.get("/api/projects").json()["items"]
        by_id = {p["id"]: p["seeded"] for p in projects}
        self.assertEqual(by_id, {"northstar": True, "juniper": True})

        created = self._create_project()
        self.assertFalse(created["seeded"])
        refreshed = self.client.get("/api/projects").json()["items"]
        self.assertFalse(next(p for p in refreshed if p["id"] == created["id"])["seeded"])

    def test_seeded_project_can_be_reset(self):
        # Northstar is already active by default.
        self.client.post("/api/evidence", json={"content": "Something that will be wiped by reset."})
        response = self.client.post("/api/demo/reset")
        self.assertEqual(response.status_code, 200)
        state = self.client.get("/api/state").json()["items"]
        self.assertEqual(len(state), 25)  # back to the curated Northstar baseline

    def test_seeded_project_cannot_be_deleted(self):
        response = self.client.delete("/api/projects/northstar")
        self.assertEqual(response.status_code, 403)
        response = self.client.delete("/api/projects/juniper")
        self.assertEqual(response.status_code, 403)
        # Still there and unaffected.
        projects = {p["id"] for p in self.client.get("/api/projects").json()["items"]}
        self.assertEqual(projects, {"northstar", "juniper"})

    def test_user_created_project_cannot_be_reset(self):
        created = self._create_project()
        self.client.post("/api/projects/switch", json={"project_id": created["id"]})
        response = self.client.post("/api/demo/reset")
        self.assertEqual(response.status_code, 403)

    def test_user_created_project_can_be_deleted(self):
        created = self._create_project()
        self.client.post("/api/projects/switch", json={"project_id": created["id"]})
        self.client.post("/api/evidence", json={"content": "Something in the new project."})

        response = self.client.delete(f"/api/projects/{created['id']}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "deleted")
        # Deleting the ACTIVE project must fail over to a project that still exists.
        self.assertEqual(body["active"]["id"], "northstar")

        projects = {p["id"] for p in self.client.get("/api/projects").json()["items"]}
        self.assertNotIn(created["id"], projects)

    def test_deleting_a_project_does_not_touch_another_projects_data(self):
        northstar_state_before = self.client.get("/api/state").json()["items"]

        created = self._create_project()
        self.client.post("/api/projects/switch", json={"project_id": created["id"]})
        self.client.post("/api/evidence", json={"content": "Only relevant to the new project."})
        self.client.delete(f"/api/projects/{created['id']}")

        self.client.post("/api/projects/switch", json={"project_id": "northstar"})
        northstar_state_after = self.client.get("/api/state").json()["items"]
        self.assertEqual(northstar_state_before, northstar_state_after)

        juniper_evidence = self.client.get("/api/evidence", headers={"X-State-Project-Id": "juniper"}).json()
        self.assertTrue(len(juniper_evidence["items"]) > 0)

    def test_deleting_a_nonexistent_project_is_a_404(self):
        response = self.client.delete("/api/projects/does-not-exist")
        self.assertEqual(response.status_code, 404)


class ProjectLifecycleFunctionTests(unittest.TestCase):
    """Direct coverage of the guard functions themselves (not just the API
    layer that wraps them), so a future direct caller can't reintroduce the
    exact "reset wiped a custom project and put nothing back" bug."""

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        self.connection = connect_sqlite(self.db_path)
        initialize_db(self.connection)
        bootstrap_demo_data(self.connection)
        self.connection.execute("INSERT OR IGNORE INTO projects(id, name) VALUES ('proj_custom', 'Custom')")
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        self.tempdir.cleanup()

    def test_reset_demo_data_refuses_a_non_seeded_project(self):
        with self.assertRaises(ValueError):
            reset_demo_data(self.connection, "proj_custom")

    def test_delete_project_data_refuses_a_seeded_project(self):
        for project_id in SEEDED_PROJECT_IDS:
            with self.assertRaises(ValueError):
                delete_project_data(self.connection, project_id)


if __name__ == "__main__":
    unittest.main()
