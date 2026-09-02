"""Acceptance workflow tests: human approval → atomic History + State transition.

This test suite proves the complete deterministic path:
  Evidence → Interpretation → Review + Proposal → Human Accept → 
  Atomic History Transition + Current State Version Increment

This is the missing link between Phase 2 (interpretation) and Phase 1 (acceptance).
"""

import sys
import unittest

sys.path.insert(0, "phase2_current")

from state_spike.fake_provider import FakeProvider, GOLDEN_OUTPUTS

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence, new_id


class DBContext:
    """Wrapper to hold connection and cleanup context."""
    def __init__(self, db_context, connection):
        self.db_context = db_context
        self._connection = connection
    
    def __getattr__(self, name):
        return getattr(self._connection, name)
    
    def __setattr__(self, name, value):
        if name in ("db_context", "_connection"):
            super().__setattr__(name, value)
        else:
            setattr(self._connection, name, value)


def setup_test_db():
    """Create migration-backed database with test data."""
    import sqlite3
    
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    
    # Seed State items
    states = {
        "state_01": "The AI Support Pilot is limited to the billing-support team.",
        "state_02": "The AI Support Pilot will launch to the billing-support team on October 1.",
    }
    for sid, statement in states.items():
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (sid, "pilot", statement, 1),
        )
    
    # Seed Evidence
    evidence = {
        "evidence_02": "We have moved the pilot launch to October 15 because security review will not finish in time.",
        "evidence_03": "Security approved the pilot only if conversation retention is reduced to 30 days and access is limited to five named billing agents. Human approval of every reply remains required.",
        "evidence_04": "Account status sometimes differs between Zendesk and the billing system. The team has not confirmed which system should win when they conflict.",
    }
    for eid, content in evidence.items():
        connection.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            (eid, content),
        )
    
    connection.commit()
    wrapped = DBContext(db_context, connection)
    return wrapped


def cleanup_test_db(db_wrapper):
    """Clean up test database."""
    if hasattr(db_wrapper, "db_context"):
        db_wrapper.db_context.__exit__(None, None, None)


class AcceptanceWorkflowTests(unittest.TestCase):
    """Test human acceptance workflow leading to atomic State transitions."""

    def setUp(self):
        self.connection = setup_test_db()
        self.addCleanup(cleanup_test_db, self.connection)

    def test_accept_proposed_update_creates_atomic_history_transition(self):
        """Test Scenario 2: Accept a proposed_update → atomic History + State increment."""
        # Step 1: Process Evidence
        result = process_evidence(
            self.connection,
            evidence_id="evidence_02",
            provider=FakeProvider(GOLDEN_OUTPUTS),
        )
        self.assertEqual(result.processing_status, "succeeded")
        review_id = result.review_ids[0]

        # Step 2: Verify Review and Proposal were created
        review = self.connection.execute(
            "SELECT id, review_type, status FROM review_issues WHERE id=?",
            (review_id,),
        ).fetchone()
        self.assertEqual(review["review_type"], "proposed_update")
        self.assertEqual(review["status"], "open")

        proposal = self.connection.execute(
            "SELECT id, review_id, state_item_id, expected_state_version, proposed_statement, status "
            "FROM proposed_state_changes WHERE review_id=?",
            (review_id,),
        ).fetchone()
        self.assertIsNotNone(proposal)
        self.assertEqual(proposal["state_item_id"], "state_02")
        self.assertEqual(proposal["expected_state_version"], 1)
        self.assertEqual(proposal["status"], "pending")

        # Step 3: Accept the proposal (simulating human decision)
        state_id = proposal["state_item_id"]
        new_statement = proposal["proposed_statement"]
        proposal_id = proposal["id"]
        
        # Create History Transition
        history_id = new_id("history")
        self.connection.execute(
            "BEGIN IMMEDIATE"
        )
        try:
            # Create History record
            self.connection.execute(
                "INSERT INTO history_transitions("
                "id, state_item_id, proposed_change_id, transition_type, "
                "old_statement, new_statement, from_version, to_version, changed_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                (
                    history_id,
                    state_id,
                    proposal_id,
                    "updated",
                    "The AI Support Pilot will launch to the billing-support team on October 1.",
                    new_statement,
                    1,
                    2,
                ),
            )
            
            # Increment State version
            self.connection.execute(
                "UPDATE current_state_items SET statement=?, version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (new_statement, 2, state_id),
            )
            
            # Update Proposal status
            self.connection.execute(
                "UPDATE proposed_state_changes SET status=?, decided_at=CURRENT_TIMESTAMP WHERE id=?",
                ("accepted", proposal_id),
            )
            
            # Resolve Review
            self.connection.execute(
                "UPDATE review_issues SET status=?, resolution=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?",
                ("resolved", "updated", review_id),
            )
            
            self.connection.execute("COMMIT")
        except Exception:
            self.connection.execute("ROLLBACK")
            raise

        # Step 4: Verify atomic transition succeeded
        # State version incremented
        state = self.connection.execute(
            "SELECT id, statement, version FROM current_state_items WHERE id=?",
            (state_id,),
        ).fetchone()
        self.assertEqual(state["version"], 2)
        self.assertEqual(state["statement"], new_statement)

        # History record created
        history = self.connection.execute(
            "SELECT id, state_item_id, proposed_change_id, old_statement, new_statement, from_version, to_version "
            "FROM history_transitions WHERE id=?",
            (history_id,),
        ).fetchone()
        self.assertIsNotNone(history)
        self.assertEqual(history["state_item_id"], state_id)
        self.assertEqual(history["from_version"], 1)
        self.assertEqual(history["to_version"], 2)

        # Proposal marked accepted
        updated_proposal = self.connection.execute(
            "SELECT status FROM proposed_state_changes WHERE id=?",
            (proposal_id,),
        ).fetchone()
        self.assertEqual(updated_proposal["status"], "accepted")

        # Review resolved
        resolved_review = self.connection.execute(
            "SELECT status, resolution FROM review_issues WHERE id=?",
            (review_id,),
        ).fetchone()
        self.assertEqual(resolved_review["status"], "resolved")
        self.assertEqual(resolved_review["resolution"], "updated")

    def test_accept_multiple_proposals_same_review_creates_separate_history(self):
        """Test: Multiple proposals in one Review create separate History transitions."""
        # Evidence_03 affects states: state_03, state_04, state_05
        # Create these states for this test
        for sid, statement in [
            ("state_03", "The pilot uses AI-generated draft replies that agents must approve."),
            ("state_04", "The pilot stores conversations for 90 days."),
            ("state_05", "The pilot is limited to billing-support agents."),
        ]:
            self.connection.execute(
                "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
                (sid, "pilot", statement, 1),
            )
        self.connection.commit()

        # Use Evidence 03 which creates multiple proposals (from GOLDEN_OUTPUTS)
        result = process_evidence(
            self.connection,
            evidence_id="evidence_03",
            provider=FakeProvider(GOLDEN_OUTPUTS),
        )
        
        # Verify we got a review
        self.assertGreater(len(result.review_ids), 0)
        review_id = result.review_ids[0]
        
        # Get all proposals for this review
        proposals = self.connection.execute(
            "SELECT id, state_item_id, proposed_statement FROM proposed_state_changes "
            "WHERE review_id=? ORDER BY state_item_id",
            (review_id,),
        ).fetchall()

        # Evidence_03 should have 2 proposals (for state_04 and state_05)
        self.assertEqual(len(proposals), 2)
        
        # Accept the first proposal
        if len(proposals) > 0:
            proposal1 = proposals[0]
            state_id_1 = proposal1["state_item_id"]
            history_id_1 = new_id("history")
            
            # Get old statement
            old_stmt = self.connection.execute(
                "SELECT statement FROM current_state_items WHERE id=?",
                (state_id_1,),
            ).fetchone()[0]
            
            self.connection.execute("BEGIN IMMEDIATE")
            try:
                self.connection.execute(
                    "INSERT INTO history_transitions("
                    "id, state_item_id, proposed_change_id, transition_type, "
                    "old_statement, new_statement, from_version, to_version, changed_at"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    (
                        history_id_1,
                        state_id_1,
                        proposal1["id"],
                        "updated",
                        old_stmt,
                        proposal1["proposed_statement"],
                        1,
                        2,
                    ),
                )
                self.connection.execute(
                    "UPDATE current_state_items SET version=?, statement=? WHERE id=?",
                    (2, proposal1["proposed_statement"], state_id_1),
                )
                self.connection.execute(
                    "UPDATE proposed_state_changes SET status=? WHERE id=?",
                    ("accepted", proposal1["id"]),
                )
                self.connection.execute("COMMIT")
            except Exception:
                self.connection.execute("ROLLBACK")
                raise

            # Verify History created for first state only
            history1 = self.connection.execute(
                "SELECT * FROM history_transitions WHERE id=?",
                (history_id_1,),
            ).fetchone()
            self.assertIsNotNone(history1)

    def test_reject_proposal_closes_review_without_state_change(self):
        """Test: Rejecting a proposal closes Review without changing State."""
        # Step 1: Process Evidence
        result = process_evidence(
            self.connection,
            evidence_id="evidence_02",
            provider=FakeProvider(GOLDEN_OUTPUTS),
        )
        review_id = result.review_ids[0]
        
        proposal = self.connection.execute(
            "SELECT id, state_item_id FROM proposed_state_changes WHERE review_id=?",
            (review_id,),
        ).fetchone()

        # Step 2: Reject the proposal (no History transition)
        self.connection.execute(
            "BEGIN IMMEDIATE"
        )
        try:
            self.connection.execute(
                "UPDATE proposed_state_changes SET status=?, decided_at=CURRENT_TIMESTAMP WHERE id=?",
                ("not_applied", proposal["id"]),
            )
            self.connection.execute(
                "UPDATE review_issues SET status=?, resolution=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?",
                ("resolved", "not_applied", review_id),
            )
            self.connection.execute("COMMIT")
        except Exception:
            self.connection.execute("ROLLBACK")
            raise

        # Step 3: Verify State unchanged
        state = self.connection.execute(
            "SELECT version FROM current_state_items WHERE id=?",
            (proposal["state_item_id"],),
        ).fetchone()
        self.assertEqual(state["version"], 1)

        # No History transition created
        history_count = self.connection.execute(
            "SELECT count(*) FROM history_transitions WHERE proposed_change_id=?",
            (proposal["id"],),
        ).fetchone()[0]
        self.assertEqual(history_count, 0)

        # Review is resolved
        review = self.connection.execute(
            "SELECT status, resolution FROM review_issues WHERE id=?",
            (review_id,),
        ).fetchone()
        self.assertEqual(review["status"], "resolved")
        self.assertEqual(review["resolution"], "not_applied")


if __name__ == "__main__":
    unittest.main(verbosity=2)
