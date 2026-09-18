import sqlite3
import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from database_migration_backed import get_test_db
from product_analytics import ProductEventInput, _aggregate, _insert_event


class ProductAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self._db = get_test_db()
        self.connection = self._db.__enter__()
        self.connection.row_factory = sqlite3.Row
        self.addCleanup(self._db.__exit__, None, None, None)
        self.connection.execute("INSERT OR IGNORE INTO projects(id,name) VALUES ('beta','Beta')")
        self.connection.commit()

    def test_event_schema_fails_closed_on_content_fields(self):
        with self.assertRaises(ValidationError):
            ProductEventInput(name="state_demo_opened", query="secret project question")
        with self.assertRaises(ValidationError):
            ProductEventInput(name="view_opened", evidence_content="secret evidence")

    def test_safe_event_persists_metadata_only(self):
        payload = ProductEventInput(
            name="view_opened",
            session_id="session-1",
            project_id="northstar",
            environment="staging",
            build="abc123",
            view="history",
        )
        _insert_event(self.connection, payload, datetime(2026, 9, 17, tzinfo=timezone.utc))
        row = self.connection.execute("SELECT * FROM product_analytics_events").fetchone()
        self.assertEqual(row["event_name"], "view_opened")
        self.assertEqual(row["project_id"], "northstar")
        self.assertEqual(row["view_name"], "history")
        columns = {info[1] for info in self.connection.execute("PRAGMA table_info(product_analytics_events)")}
        for forbidden in ("query", "content", "statement", "answer", "prompt"):
            self.assertNotIn(forbidden, columns)

    def test_project_drilldown_is_isolated_and_content_free(self):
        self.connection.execute(
            "INSERT INTO evidence(id,content,source_type,processing_status,project_id) VALUES (?,?,?,?,?)",
            ("e-north", "Northstar secret text", "manual_note", "processed", "northstar"),
        )
        self.connection.execute(
            "INSERT INTO evidence(id,content,source_type,processing_status,project_id) VALUES (?,?,?,?,?)",
            ("e-beta", "Beta secret text", "slack", "processed", "beta"),
        )
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,project_id) VALUES (?,?,?,?,?)",
            ("r-north", "missing_understanding", "Northstar private question?", "Private rationale", "northstar"),
        )
        self.connection.execute(
            "INSERT INTO questions(id,text,status,blocking,project_id) VALUES (?,?,?,?,?)",
            ("q-beta", "Beta private question?", "open", 1, "beta"),
        )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", datetime.now(timezone.utc))
        serialized = str(data)
        self.assertEqual(data["scope"]["project_id"], "northstar")
        self.assertEqual(data["outcomes_and_friction"]["pending_reviews"], 1)
        self.assertEqual(data["outcomes_and_friction"]["blocking_questions"], 0)
        self.assertNotIn("Northstar secret text", serialized)
        self.assertNotIn("Northstar private question", serialized)
        self.assertNotIn("Beta secret text", serialized)
        self.assertNotIn("Beta private question", serialized)

    def test_resolved_reviews_without_state_change_uses_history_linkage(self):
        now = datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc)
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at,project_id) "
            "VALUES ('r-change','proposed_update','Private?','Private','resolved','updated','2026-09-17 12:00:00','northstar')"
        )
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at,project_id) "
            "VALUES ('r-no-change','missing_understanding','Private?','Private','resolved','confirmed_current','2026-09-17 12:00:00','northstar')"
        )
        self.connection.execute(
            "INSERT INTO proposed_state_changes(id,review_id,proposed_statement,rationale,status,operation) "
            "VALUES ('p-change','r-change','Private statement','Private','accepted','create')"
        )
        self.connection.execute(
            "INSERT INTO current_state_items(id,topic,statement,project_id) "
            "VALUES ('s-change','private','Private statement','northstar')"
        )
        self.connection.execute(
            "INSERT INTO history_transitions(id,state_item_id,proposed_change_id,transition_type,new_statement,to_version,changed_at) "
            "VALUES ('h-change','s-change','p-change','created','Private statement',1,'2026-09-17 12:00:00')"
        )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", now)
        self.assertEqual(data["outcomes_and_friction"]["resolved_reviews_without_state_change_30d"], 1)

    def test_no_composite_health_score(self):
        data = _aggregate(self.connection, None, datetime.now(timezone.utc))
        self.assertNotIn("health_score", str(data).lower())
        self.assertFalse(data["privacy"]["content_included"])


if __name__ == "__main__":
    unittest.main()
