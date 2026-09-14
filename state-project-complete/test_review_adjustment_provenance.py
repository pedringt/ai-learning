"""Deterministic coverage for state.md #106: human-adjusted Review proposals
without losing AI provenance.

Covers, per the accepted implementation plan:
- the original AI interpretation (proposed_statement) is never overwritten;
- the human-adjusted wording is what actually becomes Current State;
- a no-op adjustment (final wording equals what's already Current State)
  does not manufacture a fake History transition or version bump;
- existing stale-version protection still fires the same way whether or not
  an adjustment is supplied;
- a materially adjusted Review does not silently resolve a linked Question,
  while an unadjusted (or adjustment-identical-to-AI-text) acceptance still
  does, exactly as before;
- adjustment is rejected for a retirement (no wording to adjust) and for a
  stale/unknown proposal id;
- History records which specific accepted transitions came from an
  adjustment (accepted_as_adjusted) versus the AI's own proposal.
"""
from __future__ import annotations

import sqlite3
import unittest

from database_migration_backed import get_test_db
from review_service import ReviewConflictError, resolve_review


class ReviewAdjustmentProvenanceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db_context = get_test_db()
        self.conn = self.db_context.__enter__()
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def tearDown(self) -> None:
        self.db_context.__exit__(None, None, None)

    def _seed_state(self, state_id, topic, statement, version=1):
        self.conn.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, version),
        )

    def _seed_review_with_update_proposal(
        self, review_id, proposal_id, state_id, proposed_statement, *, expected_version=1, operation="update",
    ):
        self.conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
            "VALUES (?, 'proposed_update', ?, 'Testing adjustment behavior', 'open')",
            (review_id, f"Should {state_id} change?"),
        )
        self.conn.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, "
            "proposed_statement, rationale, expected_state_version, status) "
            "VALUES (?, ?, ?, ?, ?, 'Evidence says so', ?, 'pending')",
            (proposal_id, review_id, operation, state_id, proposed_statement, expected_version),
        )
        self.conn.commit()

    def _seed_review_with_create_proposal(self, review_id, proposal_id, proposed_statement):
        self.conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
            "VALUES (?, 'missing_understanding', 'Should this be tracked?', 'New fact', 'open')",
            (review_id,),
        )
        self.conn.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, "
            "proposed_statement, rationale, expected_state_version, status) "
            "VALUES (?, ?, 'create', NULL, ?, 'Evidence says so', NULL, 'pending')",
            (proposal_id, review_id, proposed_statement),
        )
        self.conn.commit()

    def _link_question(self, review_id, question_id, question_text):
        self.conn.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', 0)",
            (question_id, question_text),
        )
        self.conn.execute(
            "INSERT INTO review_questions(review_id, question_id) VALUES (?, ?)",
            (review_id, question_id),
        )
        self.conn.commit()

    # --- Core behavior: adjusted wording wins, AI proposal preserved --------

    def test_adjusted_statement_becomes_current_state_ai_proposal_preserved(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal(
            "r-1", "p-1", "k-1", "Billing is now partly in scope for refunds.",
        )
        resolve_review(
            self.conn, "r-1", "accept",
            adjustments={"p-1": "Billing refunds only are now in scope; other billing actions remain excluded."},
        )
        state = self.conn.execute("SELECT statement, version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["statement"], "Billing refunds only are now in scope; other billing actions remain excluded.")
        self.assertEqual(state["version"], 2)

        proposal = self.conn.execute("SELECT proposed_statement, adjusted_statement, status FROM proposed_state_changes WHERE id='p-1'").fetchone()
        self.assertEqual(proposal["proposed_statement"], "Billing is now partly in scope for refunds.")
        self.assertEqual(proposal["adjusted_statement"], "Billing refunds only are now in scope; other billing actions remain excluded.")
        self.assertEqual(proposal["status"], "accepted")

    def test_history_distinguishes_accepted_as_adjusted_from_accepted_as_proposed(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_state("k-2", "automation", "Password reset automation is not approved.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope.")
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Billing refunds only are now in scope."})

        self._seed_review_with_update_proposal("r-2", "p-2", "k-2", "Password reset automation is now approved.")
        resolve_review(self.conn, "r-2", "accept")

        adjusted_row = self.conn.execute(
            "SELECT accepted_as_adjusted, new_statement FROM history_transitions WHERE proposed_change_id='p-1'"
        ).fetchone()
        as_proposed_row = self.conn.execute(
            "SELECT accepted_as_adjusted, new_statement FROM history_transitions WHERE proposed_change_id='p-2'"
        ).fetchone()
        self.assertEqual(adjusted_row["accepted_as_adjusted"], 1)
        self.assertEqual(adjusted_row["new_statement"], "Billing refunds only are now in scope.")
        self.assertEqual(as_proposed_row["accepted_as_adjusted"], 0)
        self.assertEqual(as_proposed_row["new_statement"], "Password reset automation is now approved.")

    def test_adjustment_identical_to_ai_proposal_is_not_flagged_as_adjusted(self):
        """A human re-typing exactly the AI's own wording (maybe with extra
        whitespace) is not a material adjustment -- it's accepted-as-proposed."""
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope for refunds.")
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Billing  is now in scope for refunds.  "})
        row = self.conn.execute(
            "SELECT accepted_as_adjusted FROM history_transitions WHERE proposed_change_id='p-1'"
        ).fetchone()
        self.assertEqual(row["accepted_as_adjusted"], 0)

    def test_adjustment_applies_to_a_create_proposal_too(self):
        self._seed_review_with_create_proposal("r-1", "p-1", "The pilot dashboard is read-only.")
        resolve_review(
            self.conn, "r-1", "accept",
            adjustments={"p-1": "The pilot dashboard is read-only and requires dual sign-off for new escalation routes."},
        )
        created = self.conn.execute(
            "SELECT statement FROM current_state_items WHERE status='active' AND topic='uncategorized'"
        ).fetchone()
        self.assertEqual(created["statement"], "The pilot dashboard is read-only and requires dual sign-off for new escalation routes.")
        proposal = self.conn.execute("SELECT proposed_statement FROM proposed_state_changes WHERE id='p-1'").fetchone()
        self.assertEqual(proposal["proposed_statement"], "The pilot dashboard is read-only.")

    # --- No-op adjustment protection -----------------------------------------

    def test_noop_adjustment_does_not_bump_version_or_create_history(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now partly in scope.")
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Billing is out of scope."})

        state = self.conn.execute("SELECT statement, version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["statement"], "Billing is out of scope.")
        self.assertEqual(state["version"], 1)

        history_count = self.conn.execute(
            "SELECT COUNT(*) FROM history_transitions WHERE state_item_id='k-1'"
        ).fetchone()[0]
        self.assertEqual(history_count, 0)

        # The proposal is still marked accepted -- the human did make a real
        # decision (confirm current wording is fine), it's just a no-op.
        proposal = self.conn.execute("SELECT status, adjusted_statement FROM proposed_state_changes WHERE id='p-1'").fetchone()
        self.assertEqual(proposal["status"], "accepted")
        self.assertEqual(proposal["adjusted_statement"], "Billing is out of scope.")

    def test_ai_originated_noop_style_update_is_unaffected_no_adjustment_supplied(self):
        """Only ADJUSTED no-ops are guarded; an AI proposal that happens (very
        unusually) to restate current text without any human adjustment keeps
        prior behavior -- unchanged from before #106, not a new invariant."""
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is out of scope.")
        resolve_review(self.conn, "r-1", "accept")
        state = self.conn.execute("SELECT version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["version"], 2)

    # --- Stale version protection still applies ------------------------------

    def test_stale_version_blocks_an_adjusted_acceptance(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.", version=1)
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope.", expected_version=1)
        # Simulate Current State changing after interpretation captured version 1.
        self.conn.execute("UPDATE current_state_items SET version=2, statement='Billing scope already changed.' WHERE id='k-1'")
        self.conn.commit()
        with self.assertRaises(ReviewConflictError):
            resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Billing refunds only are now in scope."})
        # Nothing committed: the review must remain open and state unchanged.
        review = self.conn.execute("SELECT status FROM review_issues WHERE id='r-1'").fetchone()
        self.assertEqual(review["status"], "open")
        state = self.conn.execute("SELECT statement, version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["statement"], "Billing scope already changed.")
        self.assertEqual(state["version"], 2)

    # --- Linked Question safety ----------------------------------------------

    def test_materially_adjusted_review_does_not_resolve_linked_question(self):
        self._seed_state("k-1", "retention", "Retention terms are unset.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Retention is 30 days.")
        self._link_question("r-1", "q-retention", "What retention terms apply?")
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Retention is 60 days, not 30."})
        question = self.conn.execute("SELECT status FROM questions WHERE id='q-retention'").fetchone()
        self.assertEqual(question["status"], "open")

    def test_unadjusted_acceptance_still_resolves_linked_question_as_before(self):
        self._seed_state("k-1", "retention", "Retention terms are unset.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Retention is 30 days.")
        self._link_question("r-1", "q-retention", "What retention terms apply?")
        resolve_review(self.conn, "r-1", "accept")
        question = self.conn.execute("SELECT status FROM questions WHERE id='q-retention'").fetchone()
        self.assertEqual(question["status"], "resolved")

    def test_adjustment_identical_to_ai_proposal_still_resolves_linked_question(self):
        """Not a material adjustment, so the original authority-model
        behavior (resolve the Question the AI's own interpretation earned)
        still applies."""
        self._seed_state("k-1", "retention", "Retention terms are unset.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Retention is 30 days.")
        self._link_question("r-1", "q-retention", "What retention terms apply?")
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Retention is 30 days."})
        question = self.conn.execute("SELECT status FROM questions WHERE id='q-retention'").fetchone()
        self.assertEqual(question["status"], "resolved")

    def test_material_adjustment_on_one_proposal_blocks_question_resolution_for_the_whole_review(self):
        """A grouped Review with two proposals: adjusting even one of them is
        treated as materially adjusting the Review's approved interpretation,
        so any linked Question stays open -- conservative by design."""
        self._seed_state("k-1", "retention", "Retention terms are unset.")
        self._seed_state("k-2", "access", "Access terms are unset.")
        self.conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
            "VALUES ('r-1', 'proposed_update', 'Should both change?', 'Grouped security approval', 'open')"
        )
        self.conn.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, proposed_statement, "
            "rationale, expected_state_version, status) VALUES "
            "('p-1', 'r-1', 'update', 'k-1', 'Retention is 30 days.', 'Evidence says so', 1, 'pending')"
        )
        self.conn.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, proposed_statement, "
            "rationale, expected_state_version, status) VALUES "
            "('p-2', 'r-1', 'update', 'k-2', 'Access is five named agents.', 'Evidence says so', 1, 'pending')"
        )
        self.conn.commit()
        self._link_question("r-1", "q-retention", "What retention terms apply?")
        # Only p-2 is adjusted; p-1 is accepted as proposed.
        resolve_review(self.conn, "r-1", "accept", adjustments={"p-2": "Access is five named agents, reviewed quarterly."})
        question = self.conn.execute("SELECT status FROM questions WHERE id='q-retention'").fetchone()
        self.assertEqual(question["status"], "open")

    # --- Rejected adjustment targets ------------------------------------------

    def test_adjustment_on_a_retirement_is_rejected(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        # Matches interpretation_pipeline_integrated.py's own convention: a
        # retire proposal's proposed_statement is the item's existing
        # statement (there is no new wording to propose for a retirement).
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is out of scope.", operation="retire")
        with self.assertRaises(ReviewConflictError):
            resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "Anything at all."})
        review = self.conn.execute("SELECT status FROM review_issues WHERE id='r-1'").fetchone()
        self.assertEqual(review["status"], "open")

    def test_adjustment_referencing_an_unknown_proposal_id_is_rejected(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope.")
        with self.assertRaises(ReviewConflictError):
            resolve_review(self.conn, "r-1", "accept", adjustments={"p-does-not-exist": "Something."})
        state = self.conn.execute("SELECT version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["version"], 1)

    def test_blank_adjustment_is_rejected(self):
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope.")
        with self.assertRaises(ReviewConflictError):
            resolve_review(self.conn, "r-1", "accept", adjustments={"p-1": "   "})

    def test_adjustment_on_an_open_question_review_is_rejected(self):
        self.conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
            "VALUES ('r-1', 'open_question', 'Is X still true?', 'Unresolved concern', 'open')"
        )
        self.conn.commit()
        with self.assertRaises(ReviewConflictError):
            resolve_review(self.conn, "r-1", "accept", adjustments={"p-anything": "Some text"})

    # --- Backward compatibility ----------------------------------------------

    def test_accept_without_adjustments_argument_at_all_is_unaffected(self):
        """Callers that never pass ``adjustments`` (the default) see identical
        behavior to before #106."""
        self._seed_state("k-1", "scope", "Billing is out of scope.")
        self._seed_review_with_update_proposal("r-1", "p-1", "k-1", "Billing is now in scope.")
        resolve_review(self.conn, "r-1", "accept")
        state = self.conn.execute("SELECT statement, version FROM current_state_items WHERE id='k-1'").fetchone()
        self.assertEqual(state["statement"], "Billing is now in scope.")
        self.assertEqual(state["version"], 2)
        row = self.conn.execute(
            "SELECT accepted_as_adjusted, adjusted_statement FROM history_transitions h "
            "JOIN proposed_state_changes p ON p.id=h.proposed_change_id WHERE p.id='p-1'"
        ).fetchone()
        self.assertEqual(row["accepted_as_adjusted"], 0)
        self.assertIsNone(row["adjusted_statement"])


if __name__ == "__main__":
    unittest.main()
