"""Deterministic coverage for State's lightweight interpretation tracing (#141)."""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest

from database_migration_backed import get_test_db
from eval.harness import run_scenario
from eval.scenarios import NO_REVIEW, Scenario
from interpretation_trace import TracePolicy, run_traced_interpretation


class ReviewProvider:
    name = "trace-test"
    model_identifier = "deterministic-trace-v1"

    def _build_prompt(self, context, evidence, connection):
        return f"TRACE PROMPT\nEvidence: {evidence['content']}\nState IDs: {','.join(sorted(context.state_items))}"

    def interpret(self, *, context, evidence, connection=None):
        return {
            "summary": "The launch approval changes maintained understanding.",
            "topics": ["launch"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Should launch status reflect the approval?",
                "why_consequential": "The Evidence changes the maintained launch status.",
                "affected_state_item_ids": ["state-launch"],
                "proposed_changes": [{
                    "operation": "update",
                    "state_item_id": "state-launch",
                    "proposed_statement": "The October launch is approved.",
                    "rationale": "The Evidence explicitly records launch approval.",
                }],
            }],
        }


class NoReviewProvider:
    name = "trace-test"
    model_identifier = "deterministic-trace-v1"

    def _build_prompt(self, context, evidence, connection):
        return f"NO REVIEW PROMPT: {evidence['content']}"

    def interpret(self, *, context, evidence, connection=None):
        return {
            "summary": "No maintained understanding changes.",
            "topics": [],
            "outcome": "no_review",
            "no_review_explanation": "The Evidence is only an acknowledgement.",
            "review_recommendations": [],
        }


class InterpretationTraceTests(unittest.TestCase):
    def test_full_eval_trace_separates_model_validation_and_final_action(self):
        with get_test_db() as connection, tempfile.TemporaryDirectory() as trace_dir:
            connection.execute(
                "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
                ("state-launch", "Launch status", "The October launch is planned.", 1),
            )
            connection.execute(
                "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
                ("ev-trace", "The October launch was approved.", "manual_note"),
            )
            connection.commit()

            traced = run_traced_interpretation(
                connection,
                "ev-trace",
                ReviewProvider(),
                policy=TracePolicy.eval_debug(),
                trace_dir=trace_dir,
            )

            self.assertEqual(traced.process_result.processing_status, "succeeded")
            self.assertTrue(traced.trace_id.startswith("trace_"))
            self.assertEqual(len(traced.process_result.review_ids), 1)
            self.assertEqual(traced.trace["provider"]["model_identifier"], "deterministic-trace-v1")
            self.assertIn("The October launch was approved.", traced.trace["input"]["evidence"]["content"])
            self.assertIn("TRACE PROMPT", traced.trace["prompt"]["snapshot"]["content"])
            self.assertEqual(traced.trace["validation"]["schema_validation"], "passed")
            self.assertEqual(traced.trace["validation"]["semantic_validation"], "passed")
            self.assertEqual(traced.trace["classification"]["outcome"], "review_recommended")
            self.assertEqual(len(traced.trace["final_product_action"]["reviews"]), 1)
            self.assertFalse(traced.trace["final_product_action"]["current_state_changed_by_interpretation"])
            self.assertIn("payload", traced.trace["model_interpretation"]["raw"])
            self.assertIn("payload", traced.trace["model_interpretation"]["normalized"])

            trace_path = Path(traced.trace_path)
            self.assertTrue(trace_path.exists())
            written = json.loads(trace_path.read_text(encoding="utf-8"))
            self.assertEqual(written["trace_id"], traced.trace_id)
            self.assertEqual(written["interpretation_record_id"], traced.process_result.interpretation_record_id)

    def test_default_policy_redacts_text_but_keeps_diagnostic_hashes(self):
        with get_test_db() as connection:
            connection.execute(
                "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
                ("ev-redacted", "Thanks, acknowledged.", "manual_note"),
            )
            connection.commit()

            traced = run_traced_interpretation(connection, "ev-redacted", NoReviewProvider())
            evidence = traced.trace["input"]["evidence"]
            prompt = traced.trace["prompt"]["snapshot"]
            raw = traced.trace["model_interpretation"]["raw"]

            self.assertNotIn("content", evidence)
            self.assertIn("sha256", evidence)
            self.assertNotIn("content", prompt)
            self.assertIn("sha256", prompt)
            self.assertNotIn("payload", raw)
            self.assertEqual(raw["outcome"], "no_review")
            self.assertFalse(traced.trace["redaction"]["evidence_content_included"])
            self.assertFalse(traced.trace["redaction"]["prompt_included"])
            self.assertFalse(traced.trace["redaction"]["model_output_included"])

    def test_eval_result_references_persisted_trace(self):
        scenario = Scenario(
            id="trace-eval",
            category="trace",
            content="Thanks, acknowledged.",
            state_items={},
            expected=NO_REVIEW,
        )
        with tempfile.TemporaryDirectory() as trace_dir:
            old = os.environ.get("STATE_EVAL_TRACE_DIR")
            os.environ["STATE_EVAL_TRACE_DIR"] = trace_dir
            try:
                result = run_scenario(scenario, provider=NoReviewProvider())
            finally:
                if old is None:
                    os.environ.pop("STATE_EVAL_TRACE_DIR", None)
                else:
                    os.environ["STATE_EVAL_TRACE_DIR"] = old

            self.assertEqual(result.processing_status, "succeeded")
            self.assertTrue(result.trace_id.startswith("trace_"))
            self.assertTrue(result.trace_path)
            self.assertTrue(Path(result.trace_path).exists())
            trace = json.loads(Path(result.trace_path).read_text(encoding="utf-8"))
            self.assertEqual(trace["trace_id"], result.trace_id)


if __name__ == "__main__":
    unittest.main()
