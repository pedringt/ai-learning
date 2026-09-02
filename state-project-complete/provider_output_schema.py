"""Provider-facing structured-output schema.

This is intentionally simpler than the canonical StructuredInterpretation schema.
Claude supplies semantic content; software normalizes backend-owned mechanics
(expected versions, affected-target redundancy, conditional omissions) before
canonical validation.
"""

PROVIDER_OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "topics", "review_recommendations"],
    "properties": {
        "summary": {"type": "string"},
        "topics": {"type": "array", "items": {"type": "string"}},
        "no_review_explanation": {"type": "string"},
        "review_recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "review_type",
                    "decision_question",
                    "why_consequential",
                    "affected_state_item_ids",
                    "proposed_changes",
                ],
                "properties": {
                    "existing_review_id": {"type": "string"},
                    "review_type": {
                        "type": "string",
                        "enum": ["proposed_update", "state_at_risk", "missing_understanding"],
                    },
                    "decision_question": {"type": "string"},
                    "why_consequential": {"type": "string"},
                    "affected_state_item_ids": {"type": "array", "items": {"type": "string"}},
                    "resolves_question_ids": {"type": "array", "items": {"type": "string"}},
                    "grouping_reason": {"type": "string"},
                    "proposed_changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["operation", "rationale"],
                            "properties": {
                                "operation": {"type": "string", "enum": ["create", "update", "retire"]},
                                "state_item_id": {"type": "string"},
                                "proposed_statement": {"type": "string"},
                                "rationale": {"type": "string"},
                                "effective_date": {"type": "string", "format": "date"},
                            },
                        },
                    },
                },
            },
        },
    },
}
