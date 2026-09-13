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
                        "enum": ["proposed_update", "state_at_risk", "missing_understanding", "open_question"],
                        "description": (
                            "Use proposed_update for a change to existing Current State; state_at_risk when existing Current State may be unreliable without a replacement; "
                            "missing_understanding for a new consequential fact that should become Current State; open_question when Evidence raises a consequential unresolved unknown "
                            "that should be tracked but does not justify a Current State change. Do not use open_question when an equivalent open Question already exists or when the Evidence answers an existing Question."
                        ),
                    },
                    "decision_question": {
                        "type": "string",
                        "description": (
                            "The concise human decision to review. For open_question, this MUST be the exact Question text that should be created if the human accepts the Review, phrased as a question."
                        ),
                    },
                    "why_consequential": {"type": "string"},
                    "affected_state_item_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "For open_question, return an empty array because the suggested Question does not itself change Current State.",
                    },
                    "resolves_question_ids": {"type": "array", "items": {"type": "string"}},
                    "grouping_reason": {"type": "string"},
                    "proposed_changes": {
                        "type": "array",
                        "description": "For open_question, return an empty array. The human is authorizing a Question, not a State mutation.",
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
