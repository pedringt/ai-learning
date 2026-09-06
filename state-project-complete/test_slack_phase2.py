"""Slack Phase 2 tests: relevance evaluation and Evidence creation.

Covers evaluate_due_checkpoints() -- the first place Slack activity is
allowed to call a model or create Evidence. Phase 1's intake/checkpoint
plumbing is exercised separately in test_slack_phase1.py; these tests
insert conversation/checkpoint rows directly so they stay focused on the
Phase 2 behavior itself.
"""

from __future__ import annotations

import unittest

from database_migration_backed import get_test_db
from slack_relevance_service import FakeSlackRelevanceClassifier, evaluate_due_checkpoints

TEAM_ID = "T123"
CHANNEL_ID = "C_APPROVED"


class SimpleTestProvider:
    """Minimal provider for interpretation testing; always returns a fixed no_review response."""

    name = "test-fake"
    model_identifier = "fake-no-op-v1"

    def interpret(self, *, context, evidence):
        return {
            "summary": f"Summary of: {evidence['content']}",
            "topics": ["slack"],
            "outcome": "no_review",
            "no_review_explanation": "Test fixture always returns no_review.",
            "review_recommendations": [],
        }


class SlackPhase2Test(unittest.TestCase):
    def setUp(self) -> None:
        self.db_context = get_test_db()
        self.conn = self.db_context.__enter__()
        self.conn.row_factory = None
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.execute(
            "INSERT INTO slack_channels (id, team_id, channel_id, channel_name, enabled, "
            "include_threads, include_bots, ingestion_started_at) VALUES (?,?,?,?,?,?,?,?)",
            ("slkch_1", TEAM_ID, CHANNEL_ID, "northstar-project", 1, 1, 0, "2000-01-01T00:00:00+00:00"),
        )
        self.conn.commit()
        self.provider = SimpleTestProvider()

    def tearDown(self) -> None:
        self.db_context.__exit__(None, None, None)

    def _insert_conversation(self, thread_root_ts: str) -> str:
        conv_id = f"slkconv_{thread_root_ts}"
        self.conn.execute(
            "INSERT INTO slack_conversations (id, team_id, channel_id, thread_root_ts, last_activity_at, "
            "next_checkpoint_at) VALUES (?,?,?,?,?,?)",
            (conv_id, TEAM_ID, CHANNEL_ID, thread_root_ts, "2026-01-01T00:00:00+00:00", "9999-12-31T00:00:00+00:00"),
        )
        return conv_id

    def _insert_message(self, thread_root_ts: str, message_ts: str, text: str, user: str = "U1") -> None:
        self.conn.execute(
            "INSERT INTO slack_messages (id, team_id, channel_id, message_ts, thread_root_ts, user_id, text) "
            "VALUES (?,?,?,?,?,?,?)",
            (f"slkmsg_{message_ts}", TEAM_ID, CHANNEL_ID, message_ts, thread_root_ts, user, text),
        )

    def _insert_checkpoint(
        self, conv_id: str, checkpoint_id: str, *, version: int = 1, previous_checkpoint_id: str | None = None
    ) -> None:
        self.conn.execute(
            "INSERT INTO slack_checkpoints (id, conversation_id, version, previous_checkpoint_id, "
            "included_message_ids, status) VALUES (?,?,?,?,?,?)",
            (checkpoint_id, conv_id, version, previous_checkpoint_id, "[]", "ready_for_relevance"),
        )
        self.conn.commit()

    def test_relevant_checkpoint_creates_evidence(self) -> None:
        conv_id = self._insert_conversation("100.0")
        self._insert_message("100.0", "100.0", "We decided the vendor owns retention going forward.")
        self._insert_checkpoint(conv_id, "slkchk_1")

        evaluated = evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)

        self.assertEqual(evaluated, ["slkchk_1"])
        checkpoint = self.conn.execute(
            "SELECT evaluated_at, evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id='slkchk_1'"
        ).fetchone()
        self.assertIsNotNone(checkpoint[0])
        self.assertIsNotNone(checkpoint[1])

        evidence = self.conn.execute(
            "SELECT source_type, source_name, supersedes_evidence_id FROM evidence WHERE id=?",
            (checkpoint[1],),
        ).fetchone()
        self.assertEqual(evidence[0], "slack_thread")
        self.assertEqual(evidence[1], "#northstar-project")
        self.assertIsNone(evidence[2])

    def test_casual_checkpoint_creates_no_evidence(self) -> None:
        conv_id = self._insert_conversation("200.0")
        self._insert_message("200.0", "200.0", "Anyone want coffee later?")
        self._insert_checkpoint(conv_id, "slkchk_2")

        evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)

        checkpoint = self.conn.execute(
            "SELECT evaluated_at, evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id='slkchk_2'"
        ).fetchone()
        self.assertIsNotNone(checkpoint[0])
        self.assertIsNone(checkpoint[1])
        count = self.conn.execute("SELECT COUNT(*) FROM evidence").fetchone()[0]
        self.assertEqual(count, 0)

    def test_second_relevant_checkpoint_supersedes_first(self) -> None:
        conv_id = self._insert_conversation("300.0")
        self._insert_message("300.0", "300.0", "We decided Salesforce owns standard access.")
        self._insert_checkpoint(conv_id, "slkchk_3a")
        evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)
        first_evidence_id = self.conn.execute(
            "SELECT evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id='slkchk_3a'"
        ).fetchone()[0]
        self.assertIsNotNone(first_evidence_id)

        self._insert_message("300.0", "300.1", "Correction: AdminHub owns enterprise overrides.")
        self._insert_checkpoint(conv_id, "slkchk_3b", version=2, previous_checkpoint_id="slkchk_3a")
        evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)

        second_evidence_id = self.conn.execute(
            "SELECT evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id='slkchk_3b'"
        ).fetchone()[0]
        self.assertIsNotNone(second_evidence_id)
        supersedes = self.conn.execute(
            "SELECT supersedes_evidence_id FROM evidence WHERE id=?", (second_evidence_id,)
        ).fetchone()[0]
        self.assertEqual(supersedes, first_evidence_id)

    def test_evaluation_is_idempotent_per_checkpoint(self) -> None:
        conv_id = self._insert_conversation("400.0")
        self._insert_message("400.0", "400.0", "We decided the deadline moves to Friday.")
        self._insert_checkpoint(conv_id, "slkchk_4")

        first_pass = evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)
        second_pass = evaluate_due_checkpoints(self.conn, FakeSlackRelevanceClassifier(), self.provider)

        self.assertEqual(first_pass, ["slkchk_4"])
        self.assertEqual(second_pass, [])
        count = self.conn.execute("SELECT COUNT(*) FROM evidence").fetchone()[0]
        self.assertEqual(count, 1)

    def test_one_bad_checkpoint_does_not_block_others(self) -> None:
        good_conv = self._insert_conversation("500.0")
        self._insert_message("500.0", "500.0", "We decided the launch is blocked on legal review.")
        self._insert_checkpoint(good_conv, "slkchk_good")

        bad_conv = self._insert_conversation("501.0")
        self._insert_message("501.0", "501.0", "This message must trigger a classifier failure.")
        self._insert_checkpoint(bad_conv, "slkchk_bad")

        class FlakyClassifier:
            def classify(self, conversation_text: str):
                if "trigger a classifier failure" in conversation_text:
                    raise RuntimeError("simulated classifier outage")
                return FakeSlackRelevanceClassifier().classify(conversation_text)

        evaluated = evaluate_due_checkpoints(self.conn, FlakyClassifier(), self.provider)

        self.assertIn("slkchk_good", evaluated)
        self.assertNotIn("slkchk_bad", evaluated)
        # The failed checkpoint stays pending (evaluated_at still NULL) so a
        # later pass retries it instead of silently dropping it.
        pending = self.conn.execute(
            "SELECT evaluated_at FROM slack_checkpoint_evaluations WHERE checkpoint_id='slkchk_bad'"
        ).fetchone()
        self.assertIsNone(pending)


class FakeSlackRelevanceClassifierTest(unittest.TestCase):
    def test_flags_decision_language_as_relevant(self) -> None:
        result = FakeSlackRelevanceClassifier().classify("We decided the vendor owns this.")
        self.assertTrue(result["relevant"])
        self.assertTrue(result["summary"])

    def test_flags_casual_chatter_as_not_relevant(self) -> None:
        result = FakeSlackRelevanceClassifier().classify("Anyone want coffee later?")
        self.assertFalse(result["relevant"])

    def test_empty_conversation_is_not_relevant(self) -> None:
        result = FakeSlackRelevanceClassifier().classify("")
        self.assertFalse(result["relevant"])


if __name__ == "__main__":
    unittest.main()
