from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

from phase2_current.state_spike.semantic_validation import InterpretationContextSnapshot


class FakeProvider:
    name = "fake"
    model_identifier = "state-golden-fixture-v1"

    def __init__(self, outputs: Mapping[str, Mapping[str, Any]]) -> None:
        self.outputs = dict(outputs)

    def interpret(self, *, context: InterpretationContextSnapshot, evidence: Mapping[str, Any]) -> Mapping[str, Any]:
        return deepcopy(self.outputs[evidence["id"]])


GOLDEN_OUTPUTS = {
    "evidence_01": {
        "summary": "Training on September 15 is relevant operational detail but does not require maintained State to change.",
        "topics": ["pilot", "training"], "outcome": "no_review",
        "no_review_explanation": "The training date does not materially change the maintained pilot scope.",
        "review_recommendations": [],
    },
    "evidence_02": {
        "summary": "The pilot launch date moved from October 1 to October 15.",
        "topics": ["pilot", "launch"], "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create", "review_type": "proposed_update",
            "decision_question": "Should the recorded pilot launch date change to October 15?",
            "why_consequential": "The maintained launch date is now stale.",
            "affected_state_item_ids": ["state_02"],
            "proposed_changes": [{"operation": "update", "state_item_id": "state_02", "expected_version": 1,
                "proposed_statement": "The AI Support Pilot will launch to the billing-support team on October 15.",
                "rationale": "The Evidence explicitly says the launch moved to October 15."}],
        }],
    },
    "evidence_03": {
        "summary": "Security approval changes retention and access while confirming human approval remains required.",
        "topics": ["security", "retention", "access"], "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create", "review_type": "proposed_update",
            "decision_question": "Should State adopt the security approval conditions?",
            "why_consequential": "Current retention and access constraints conflict with the security approval.",
            "affected_state_item_ids": ["state_03", "state_04", "state_05"],
            "grouping_reason": "Both changes are conditions of the same security approval; human approval is also confirmed.",
            "proposed_changes": [
                {"operation": "update", "state_item_id": "state_04", "expected_version": 1,
                 "proposed_statement": "The pilot stores conversations for 30 days.",
                 "rationale": "Security approval explicitly reduces retention to 30 days."},
                {"operation": "update", "state_item_id": "state_05", "expected_version": 1,
                 "proposed_statement": "The pilot is limited to five named billing agents.",
                 "rationale": "Security approval explicitly limits access to five named billing agents."},
            ],
        }],
    },
    "evidence_04": {
        "summary": "Zendesk authority is at risk because billing can conflict and precedence is unknown.",
        "topics": ["authority", "account status"], "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create", "review_type": "state_at_risk",
            "decision_question": "Which system wins when Zendesk and billing conflict?",
            "why_consequential": "Existing authority State may be unreliable when the systems disagree.",
            "affected_state_item_ids": ["state_06"], "proposed_changes": [],
        }],
    },
}
