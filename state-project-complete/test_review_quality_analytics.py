import sqlite3
import unittest
from datetime import datetime, timezone

from database_migration_backed import get_test_db
from review_quality_analytics import derive_review_quality


class ReviewQualityAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self._db = get_test_db()
        self.connection = self._db.__enter__()
        self.connection.row_factory = sqlite3.Row
        self.addCleanup(self._db.__exit__, None, None, None)

    def _review(self, review_id, resolution):
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at) "
            "VALUES (?,'proposed_update',?,'Private rationale','resolved',?,?)",
            (review_id, f"Private review text {review_id}", resolution, "2026-09-17 12:00:00"),
        )

    def _proposal(self, proposal_id, review_id, proposed, adjusted=None, status="accepted"):
        self.connection.execute(
            "INSERT INTO proposed_state_changes(id,review_id,proposed_statement,rationale,status,operation,adjusted_statement) "
            "VALUES (?,?,?,?,?,'create',?)",
            (proposal_id, review_id, proposed, "Private proposal rationale", status, adjusted),
        )

    def test_derives_accepted_edited_and_rejected_without_content(self):
        self._review("r-unchanged", "updated")
        self._proposal("p-unchanged", "r-unchanged", "AI wording")

        self._review("r-edited", "updated")
        self._proposal("p-edited", "r-edited", "AI private wording", "Human corrected wording")

        self._review("r-rejected", "not_applied")
        self._proposal("p-rejected", "r-rejected", "Rejected private wording", status="not_applied")
        self.connection.commit()

        data = derive_review_quality(
            self.connection,
            "northstar",
            datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(data["resolved_reviews"], 3)
        self.assertEqual(data["outcomes"]["accepted_as_proposed"], 1)
        self.assertEqual(data["outcomes"]["accepted_with_material_edits"], 1)
        self.assertEqual(data["outcomes"]["rejected_or_not_applied"], 1)
        self.assertAlmostEqual(data["accepted_as_proposed_rate"], 1 / 3)
        self.assertAlmostEqual(data["material_edit_rate"], 1 / 3)
        self.assertAlmostEqual(data["material_edit_rate_among_accepted_state_proposals"], 0.5)
        serialized = str(data)
        for private in (
            "Private review text", "Private rationale", "AI private wording",
            "Human corrected wording", "Rejected private wording", "Private proposal rationale",
        ):
            self.assertNotIn(private, serialized)
        self.assertFalse(data["content_included"])

    def test_non_material_whitespace_or_case_edit_is_not_counted_as_correction(self):
        self._review("r-same", "updated")
        self._proposal("p-same", "r-same", "Approved Pilot Scope", "  approved   pilot scope ")
        self.connection.commit()
        data = derive_review_quality(
            self.connection,
            "northstar",
            datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(data["outcomes"]["accepted_as_proposed"], 1)
        self.assertEqual(data["material_edit_rate_among_accepted_state_proposals"], 0.0)

    def test_project_scope_isolated(self):
        self.connection.execute("INSERT INTO projects(id,name) VALUES ('beta','Beta')")
        self._review("r-north", "confirmed_current")
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at,project_id) "
            "VALUES ('r-beta','proposed_update','Beta private','Private','resolved','not_applied','2026-09-17 12:00:00','beta')"
        )
        self.connection.commit()
        data = derive_review_quality(
            self.connection,
            "northstar",
            datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(data["resolved_reviews"], 1)
        self.assertEqual(data["outcomes"], {"confirmed_current": 1})


if __name__ == "__main__":
    unittest.main()
