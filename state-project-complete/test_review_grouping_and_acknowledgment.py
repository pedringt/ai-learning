"""Deterministic, software-owned coverage for state.md #104/#105: decision-sized
Review grouping/splitting and the no-acknowledgment-only-Review invariant.

These tests exercise process_evidence() with a FakeProvider-style stub that
returns a fixed payload -- they verify what software does with a given model
output (grouping/splitting persistence, and the pipeline filter that drops
acknowledgment-only recommendations), not whether the real model chooses the
right shape. Model judgment quality for consequentiality/grouping lives in
eval/scenarios.py and test_evidence_intake_consequentiality.py, which require
a live ANTHROPIC_API_KEY on purpose.
"""
from __future__ import annotations

import unittest

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence


class _FixedProvider:
    name = "test-fixed"
    model_identifier = "fixed-v1"

    def __init__(self, response):
        self.response = response

    def interpret(self, *, context, evidence):
        return self.response


class ReviewGroupingAndAcknowledgmentTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db_context = get_test_db()
        self.conn = self.db_context.__enter__()
        self.conn.row_factory = None
        self.conn.execute("PRAGMA foreign_keys = ON")

    def tearDown(self) -> None:
        self.db_context.__exit__(None, None, None)

    def _insert_state(self, state_id, topic, statement):
        self.conn.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, 1),
        )
        self.conn.commit()

    def _insert_evidence(self, content):
        evidence_id = "e-" + content[:8].replace(" ", "-").lower()
        self.conn.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (evidence_id, content))
        self.conn.commit()
        return evidence_id

    # --- Grouping: one coherent decision stays one Review -------------------

    def test_one_recommendation_with_multiple_proposed_changes_stays_one_review(self):
        """A #104 grouped decision (e.g. one security approval with two
        clauses) must persist as one Review with both proposals, not be
        split by software into two."""
        self._insert_state("k-retention", "security", "The pilot stores conversations for 90 days.")
        self._insert_state("k-access", "security", "The pilot is limited to twelve named agents.")
        evidence_id = self._insert_evidence("Security approved a combined retention and access change")

        provider = _FixedProvider({
            "summary": "Security approval changes retention and access together.",
            "topics": ["security"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Should State adopt the combined security approval?",
                "why_consequential": "Both changes are conditions of the same approval.",
                "affected_state_item_ids": ["k-retention", "k-access"],
                "grouping_reason": "Both changes are conditions of one security approval.",
                "proposed_changes": [
                    {"operation": "update", "state_item_id": "k-retention", "expected_version": 1,
                     "proposed_statement": "The pilot stores conversations for 30 days.",
                     "rationale": "Approval reduces retention to 30 days."},
                    {"operation": "update", "state_item_id": "k-access", "expected_version": 1,
                     "proposed_statement": "The pilot is limited to five named agents.",
                     "rationale": "Approval limits access to five named agents."},
                ],
            }],
        })

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 1)

        proposal_count = self.conn.execute(
            "SELECT COUNT(*) FROM proposed_state_changes WHERE review_id=?", (result.review_ids[0],)
        ).fetchone()[0]
        self.assertEqual(proposal_count, 2)

    # --- Splitting: independently decidable concepts become separate Reviews

    def test_three_independent_concepts_from_one_evidence_item_become_three_reviews(self):
        """A launch date, a security approval, and an account-changing-scope
        decision are independently decidable (#104's own example) -- one
        Evidence submission recommending all three as separate
        recommendations must persist as three separate Reviews, not get
        merged by software into one."""
        self._insert_state("k-launch", "product", "The pilot launches October 1.")
        evidence_id = self._insert_evidence("Pilot launch date, security approval, and account scope all changed")

        provider = _FixedProvider({
            "summary": "Three independent decisions in one update.",
            "topics": ["launch", "security", "scope"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create", "review_type": "proposed_update",
                    "decision_question": "Should the launch date move to October 15?",
                    "why_consequential": "Launch date changed.",
                    "affected_state_item_ids": ["k-launch"],
                    "proposed_changes": [{"operation": "update", "state_item_id": "k-launch", "expected_version": 1,
                        "proposed_statement": "The pilot launches October 15.", "rationale": "Evidence states the new date."}],
                },
                {
                    "review_action": "create", "review_type": "missing_understanding",
                    "decision_question": "Should the security approval be tracked?",
                    "why_consequential": "Security approved the pilot.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{"operation": "create",
                        "proposed_statement": "Security has approved the pilot.", "rationale": "Evidence states this directly."}],
                },
                {
                    "review_action": "create", "review_type": "missing_understanding",
                    "decision_question": "Should account-changing actions be allowed?",
                    "why_consequential": "Scope may now include account-changing actions.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{"operation": "create",
                        "proposed_statement": "Account-changing actions are allowed.", "rationale": "Evidence states this directly."}],
                },
            ],
        })

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 3)

        review_types = {
            row[0] for row in self.conn.execute(
                "SELECT review_type FROM review_issues WHERE id IN (%s)" % ",".join("?" * len(result.review_ids)),
                result.review_ids,
            ).fetchall()
        }
        self.assertEqual(review_types, {"proposed_update", "missing_understanding"})

    # --- No acknowledgment-only Reviews -------------------------------------

    def test_missing_understanding_with_no_concrete_fact_creates_no_review(self):
        """#104: if missing_understanding can't state a concrete new fact, it
        must not create a standing acknowledgment-only Review."""
        evidence_id = self._insert_evidence("Something happened but nothing concrete was stated")

        provider = _FixedProvider({
            "summary": "Evidence seems consequential but no concrete fact was articulated.",
            "topics": ["misc"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create", "review_type": "missing_understanding",
                "decision_question": "Should this be tracked?",
                "why_consequential": "Seems important.",
                "affected_state_item_ids": [],
                "proposed_changes": [],
            }],
        })

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 0)
        review_count = self.conn.execute("SELECT COUNT(*) FROM review_issues").fetchone()[0]
        self.assertEqual(review_count, 0)

    def test_state_at_risk_naming_an_affected_item_still_creates_a_real_review(self):
        """Contrast case: state_at_risk WITH a named affected item is a real
        decision ("keep tracking this risk or not") and must still create a
        Review, unlike the anchor-less case above."""
        self._insert_state("k-vendor", "security", "The vendor confirms no training on customer content.")
        evidence_id = self._insert_evidence("Legal flagged the vendor claim may not hold, still reviewing")

        provider = _FixedProvider({
            "summary": "Vendor claim reliability is now uncertain.",
            "topics": ["security", "vendor"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create", "review_type": "state_at_risk",
                "decision_question": "Is the vendor no-training-data claim still reliable?",
                "why_consequential": "Legal flagged a possible conflict with contract language.",
                "affected_state_item_ids": ["k-vendor"],
                "proposed_changes": [],
            }],
        })

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 1)
        review_type = self.conn.execute(
            "SELECT review_type FROM review_issues WHERE id=?", (result.review_ids[0],)
        ).fetchone()[0]
        self.assertEqual(review_type, "state_at_risk")


if __name__ == "__main__":
    unittest.main()
