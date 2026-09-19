import unittest

from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS, AskQualityScenario
from eval.quality_harness import score_ask_answer
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

    def test_scenario_collection_fields_are_tuples_not_bare_strings(self):
        # A parenthesised string without a trailing comma is a str, and the seeder
        # then iterates it character by character (issue #222).
        for scenario in (*REVIEW_SCENARIOS, *ASK_SCENARIOS):
            for name in (
                "current_state", "open_questions", "pending_reviews", "history",
                "required_facts", "forbidden_claims",
            ):
                if hasattr(scenario, name):
                    self.assertIsInstance(getattr(scenario, name), tuple, f"{scenario.id}.{name}")

    def test_required_fact_accepts_any_listed_phrasing(self):
        scenario = AskQualityScenario(
            id="t", category="uncertainty", question="q", current_state=(),
            required_facts=(("not established", "not yet established"),),
        )
        for wording in ("It is not established.", "The figure is not yet established."):
            self.assertTrue(score_ask_answer(scenario, {"answer": wording}).required_facts_ok, wording)
        self.assertFalse(score_ask_answer(scenario, {"answer": "It is 40%."}).required_facts_ok)

    def test_plain_string_required_fact_still_matches(self):
        scenario = AskQualityScenario(
            id="t", category="x", question="q", current_state=(), required_facts=("security",),
        )
        self.assertTrue(score_ask_answer(scenario, {"answer": "Security has not signed off."}).required_facts_ok)
        self.assertFalse(score_ask_answer(scenario, {"answer": "Nothing blocks launch."}).required_facts_ok)

    def test_uncertainty_language_recognises_common_hedges(self):
        scenario = AskQualityScenario(
            id="t", category="x", question="q", current_state=(), should_express_uncertainty=True,
        )
        for wording in ("Readiness cannot be confirmed.", "The question remains open.", "It is unanswered."):
            self.assertTrue(score_ask_answer(scenario, {"answer": wording}).uncertainty_ok, wording)
        self.assertFalse(score_ask_answer(scenario, {"answer": "Launch is on October 1."}).uncertainty_ok)

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


class ErrorAccountingTests(unittest.TestCase):
    """Errored scenarios: excluded from rates, counted as high-severity, reported separately (#222)."""

    def _result(self, scenario, *, error="", ok=True):
        from eval.quality_harness import AskQualityResult

        return AskQualityResult(
            scenario=scenario, answer=None if error else {"answer": "x"},
            required_facts_ok=ok, forbidden_claims_ok=ok, uncertainty_ok=ok,
            open_item_ok=ok, authority_ok=ok, error=error,
        )

    def test_ask_error_is_separate_from_rates_but_counts_as_high_severity(self):
        from eval.quality_harness import ask_quality_metrics

        high = next(s for s in ASK_SCENARIOS if s.severity == "high")
        metrics = ask_quality_metrics([self._result(high), self._result(high, error="boom", ok=False)])
        self.assertEqual(metrics["total"], 2)
        self.assertEqual(metrics["errors"], 1)
        self.assertEqual(metrics["overall_pass_rate"], 1.0)  # only the completed case is scored
        self.assertEqual(metrics["high_severity_failures"], 1)  # the errored high-severity case fails closed
