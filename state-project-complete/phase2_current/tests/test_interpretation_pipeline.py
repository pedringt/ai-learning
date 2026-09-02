import copy
import sqlite3
import unittest

from state_spike.fake_provider import FakeProvider, GOLDEN_OUTPUTS
from state_spike.interpretation_pipeline import create_pipeline_schema, process_evidence


STATES = {
    "state_01": "The AI Support Pilot is limited to the billing-support team.",
    "state_02": "The AI Support Pilot will launch to the billing-support team on October 1.",
    "state_03": "The pilot uses AI-generated draft replies that agents must approve.",
    "state_04": "The pilot stores conversations for 90 days.",
    "state_05": "The pilot is limited to billing-support agents.",
    "state_06": "Zendesk is the authoritative source for customer account status.",
}
EVIDENCE = {
    "evidence_01": "Billing-support agents will attend pilot training on September 15.",
    "evidence_02": "We have moved the pilot launch to October 15 because security review will not finish in time.",
    "evidence_03": "Security approved the pilot only if conversation retention is reduced to 30 days and access is limited to five named billing agents. Human approval of every reply remains required.",
    "evidence_04": "Account status sometimes differs between Zendesk and the billing system. The team has not confirmed which system should win when they conflict.",
}


def db():
    connection = sqlite3.connect(":memory:", isolation_level=None)
    connection.row_factory = sqlite3.Row
    create_pipeline_schema(connection)
    for sid, statement in STATES.items():
        connection.execute("INSERT INTO current_state_items VALUES (?,?,1)", (sid, statement))
    for eid, content in EVIDENCE.items():
        connection.execute("INSERT INTO evidence(id,content) VALUES (?,?)", (eid, content))
    return connection


class PipelineTests(unittest.TestCase):
    def test_golden_no_review_persists_success_without_review(self):
        c = db(); self.addCleanup(c.close); result = process_evidence(c, evidence_id="evidence_01", provider=FakeProvider(GOLDEN_OUTPUTS))
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(c.execute("SELECT count(*) FROM review_issues").fetchone()[0], 0)
        self.assertEqual(c.execute("SELECT processing_status FROM evidence WHERE id='evidence_01'").fetchone()[0], "processed")

    def test_supported_launch_change_creates_review_and_proposal(self):
        c = db(); self.addCleanup(c.close); process_evidence(c, evidence_id="evidence_02", provider=FakeProvider(GOLDEN_OUTPUTS))
        review = c.execute("SELECT * FROM review_issues").fetchone(); proposal = c.execute("SELECT * FROM proposed_state_changes").fetchone()
        self.assertEqual(review["review_type"], "proposed_update")
        self.assertEqual(proposal["state_item_id"], "state_02")
        self.assertEqual(proposal["expected_state_version"], 1)
        self.assertIsNone(proposal["effective_date"])
        self.assertEqual(c.execute("SELECT statement FROM current_state_items WHERE id='state_02'").fetchone()[0], STATES["state_02"])

    def test_combined_security_review_links_three_states_and_two_proposals(self):
        c = db(); self.addCleanup(c.close); process_evidence(c, evidence_id="evidence_03", provider=FakeProvider(GOLDEN_OUTPUTS))
        self.assertEqual(c.execute("SELECT count(*) FROM review_issues").fetchone()[0], 1)
        self.assertEqual(c.execute("SELECT count(*) FROM review_state_items").fetchone()[0], 3)
        self.assertEqual(c.execute("SELECT count(*) FROM proposed_state_changes").fetchone()[0], 2)

    def test_state_at_risk_has_no_proposal(self):
        c = db(); self.addCleanup(c.close); process_evidence(c, evidence_id="evidence_04", provider=FakeProvider(GOLDEN_OUTPUTS))
        self.assertEqual(c.execute("SELECT review_type FROM review_issues").fetchone()[0], "state_at_risk")
        self.assertEqual(c.execute("SELECT count(*) FROM proposed_state_changes").fetchone()[0], 0)

    def test_schema_failure_preserves_evidence_and_creates_no_downstream_records(self):
        outputs = copy.deepcopy(GOLDEN_OUTPUTS); del outputs["evidence_02"]["summary"]
        c = db(); self.addCleanup(c.close); result = process_evidence(c, evidence_id="evidence_02", provider=FakeProvider(outputs))
        self.assertEqual(result.processing_status, "failed")
        row = c.execute("SELECT * FROM interpretation_records").fetchone()
        self.assertEqual(row["error_code"], "schema_violation")
        self.assertIsNotNone(row["structured_result"])
        self.assertEqual(c.execute("SELECT count(*) FROM review_issues").fetchone()[0], 0)
        self.assertEqual(c.execute("SELECT content FROM evidence WHERE id='evidence_02'").fetchone()[0], EVIDENCE["evidence_02"])

    def test_semantic_failure_is_atomic(self):
        outputs = copy.deepcopy(GOLDEN_OUTPUTS)
        good = outputs["evidence_02"]["review_recommendations"][0]
        bad = copy.deepcopy(good); bad["affected_state_item_ids"] = ["missing"]; bad["proposed_changes"][0]["state_item_id"] = "missing"
        outputs["evidence_02"]["review_recommendations"].append(bad)
        c = db(); self.addCleanup(c.close); result = process_evidence(c, evidence_id="evidence_02", provider=FakeProvider(outputs))
        self.assertEqual(result.processing_status, "failed")
        self.assertEqual(c.execute("SELECT error_code FROM interpretation_records").fetchone()[0], "invalid_state_reference")
        self.assertEqual(c.execute("SELECT count(*) FROM review_issues").fetchone()[0], 0)
        self.assertEqual(c.execute("SELECT count(*) FROM proposed_state_changes").fetchone()[0], 0)

    def test_retry_creates_new_interpretation_record(self):
        bad = copy.deepcopy(GOLDEN_OUTPUTS); del bad["evidence_02"]["summary"]
        c = db(); self.addCleanup(c.close); process_evidence(c, evidence_id="evidence_02", provider=FakeProvider(bad)); process_evidence(c, evidence_id="evidence_02", provider=FakeProvider(GOLDEN_OUTPUTS))
        rows = c.execute("SELECT processing_status,error_code FROM interpretation_records ORDER BY rowid").fetchall()
        self.assertEqual([(r[0], r[1]) for r in rows], [("failed", "schema_violation"), ("succeeded", None)])

    def test_provider_exception_is_safe_failure(self):
        class Broken:
            name="fake"; model_identifier="broken"
            def interpret(self, **kwargs): raise RuntimeError("secret provider detail")
        c = db(); self.addCleanup(c.close); process_evidence(c, evidence_id="evidence_01", provider=Broken())
        row = c.execute("SELECT error_code,structured_result FROM interpretation_records").fetchone()
        self.assertEqual(row[0], "provider_error"); self.assertIsNone(row[1])

    def test_successful_interpretation_never_mutates_current_state(self):
        c = db(); self.addCleanup(c.close); before = dict(c.execute("SELECT id,statement FROM current_state_items").fetchall())
        process_evidence(c, evidence_id="evidence_03", provider=FakeProvider(GOLDEN_OUTPUTS))
        after = dict(c.execute("SELECT id,statement FROM current_state_items").fetchall())
        self.assertEqual(before, after)


if __name__ == "__main__": unittest.main()
