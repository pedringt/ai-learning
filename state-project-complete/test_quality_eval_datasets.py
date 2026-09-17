import unittest

from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW_SCENARIOS


class QualityEvalDatasetTests(unittest.TestCase):
    def test_review_scenario_ids_are_unique(self):
        ids = [scenario.id for scenario in REVIEW_SCENARIOS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_review_suite_covers_core_outcomes(self):
        actions = {scenario.expected_action for scenario in REVIEW_SCENARIOS}
        self.assertTrue({
            "update_state",
            "answer_question",
            "answer_question_and_update_state",
            "open_question",
            "preserve_evidence_only",
        }.issubset(actions))
        self.assertTrue(any(not scenario.review_needed for scenario in REVIEW_SCENARIOS))
        self.assertTrue(any(scenario.must_preserve_uncertainty for scenario in REVIEW_SCENARIOS))
        self.assertTrue(any(scenario.severity == "high" for scenario in REVIEW_SCENARIOS))

    def test_review_expectations_are_internally_consistent(self):
        for scenario in REVIEW_SCENARIOS:
            if scenario.expected_action == "update_state":
                self.assertTrue(scenario.should_change_state, scenario.id)
            if scenario.expected_action == "answer_question":
                self.assertTrue(scenario.should_answer_question, scenario.id)
                self.assertFalse(scenario.should_change_state, scenario.id)
            if scenario.expected_action == "answer_question_and_update_state":
                self.assertTrue(scenario.should_answer_question, scenario.id)
                self.assertTrue(scenario.should_change_state, scenario.id)
            if scenario.expected_action == "open_question":
                self.assertTrue(scenario.should_open_question, scenario.id)

    def test_ask_scenario_ids_are_unique(self):
        ids = [scenario.id for scenario in ASK_SCENARIOS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_ask_suite_covers_authority_grounding_and_uncertainty(self):
        categories = {scenario.category for scenario in ASK_SCENARIOS}
        self.assertTrue({
            "currentness",
            "authority_awareness",
            "uncertainty",
            "history",
            "false_premise",
            "important_omission",
            "conflict",
        }.issubset(categories))
        self.assertTrue(any(scenario.should_distinguish_proposal_from_truth for scenario in ASK_SCENARIOS))
        self.assertTrue(any(scenario.should_express_uncertainty for scenario in ASK_SCENARIOS))
        self.assertTrue(any(scenario.should_reference_open_item for scenario in ASK_SCENARIOS))

    def test_ask_cases_define_a_checkable_expectation(self):
        for scenario in ASK_SCENARIOS:
            self.assertTrue(
                scenario.required_facts
                or scenario.forbidden_claims
                or scenario.should_express_uncertainty
                or scenario.should_reference_open_item
                or scenario.should_distinguish_proposal_from_truth,
                scenario.id,
            )


if __name__ == "__main__":
    unittest.main()
