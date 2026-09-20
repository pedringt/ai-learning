"""Structured contracts for State Ask selection and synthesis."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

AskJob = Literal[
    "current_fact", "meeting_prep", "catch_up", "project_update",
    "why_or_provenance", "attention_check", "historical", "drafting",
    "general_project_synthesis", "refinement",
]

class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=8_000)
    previous_answer: dict | None = None

class AskSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job: AskJob
    state_ids: list[str] = Field(default_factory=list, max_length=12)
    review_ids: list[str] = Field(default_factory=list, max_length=8)
    blocking_question_ids: list[str] = Field(default_factory=list, max_length=8)
    question_ids: list[str] = Field(default_factory=list, max_length=10)
    history_ids: list[str] = Field(default_factory=list, max_length=12)
    evidence_ids: list[str] = Field(default_factory=list, max_length=12)

class AskAnswerItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=700)
    record_type: Literal["state", "review", "blocking_question", "question", "history", "evidence", "none"] = "none"
    record_id: str | None = None
    detail: str | None = Field(default=None, max_length=1_000)

class AskAnswerSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["needs_review", "questions", "established", "recent_context", "changes", "open_attention", "draft", "other"]
    title: str = Field(min_length=1, max_length=160)
    items: list[AskAnswerItem] = Field(default_factory=list, max_length=8)

# The final shape of a meeting-prep answer (#246). `_normalize_meeting_prep` in ask_service.py enforces these
# after the model answers, and the prompt states them (the text is generated from these same values), so the
# model writes the final shape and a live-streamed answer does not shrink or reshuffle when it finishes.
# Change them here and both follow; a test keeps the two in step.
MEETING_PREP_SECTION_ORDER = (
    "needs_review", "questions", "established", "recent_context", "changes", "open_attention", "draft", "other",
)
MEETING_PREP_ITEM_CAPS = {
    "needs_review": 2, "questions": 4, "established": 3, "recent_context": 2,
    "changes": 2, "open_attention": 3, "draft": 4, "other": 2,
}
MEETING_PREP_MAX_SECTIONS = 4
MEETING_PREP_MAX_REFINEMENTS = 3
# Kinds the normalizer retitles. `draft` and `other` keep the model's own short title.
MEETING_PREP_SECTION_TITLES = {
    "needs_review": "Decisions needed",
    "questions": "Get these answered",
    "established": "Useful context",
    "recent_context": "Recent context",
    "changes": "What changed",
    "open_attention": "Useful context",
}


class AskSynthesis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job: AskJob
    headline: str = Field(min_length=1, max_length=180)
    summary: str = Field(min_length=1, max_length=1_200)
    sections: list[AskAnswerSection] = Field(default_factory=list, max_length=7)
    source_ids: list[str] = Field(default_factory=list, max_length=80)
    uncertainty_ids: list[str] = Field(default_factory=list, max_length=50)
    suggested_refinements: list[str] = Field(default_factory=list, max_length=5)

# Anthropic structured outputs support only a subset of JSON Schema and reject
# array maxItems. Application limits therefore remain authoritative in
# AskSelection / ask_service rather than being expressed in this provider schema.
SELECTOR_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["job", "state_ids", "review_ids", "blocking_question_ids", "question_ids", "history_ids", "evidence_ids"],
    "properties": {
        "job": {"type": "string", "enum": [
            "current_fact", "meeting_prep", "catch_up", "project_update",
            "why_or_provenance", "attention_check", "historical", "drafting",
            "general_project_synthesis", "refinement"
        ]},
        "state_ids": {"type": "array", "items": {"type": "string"}},
        "review_ids": {"type": "array", "items": {"type": "string"}},
        "blocking_question_ids": {"type": "array", "items": {"type": "string"}},
        "question_ids": {"type": "array", "items": {"type": "string"}},
        "history_ids": {"type": "array", "items": {"type": "string"}},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
    },
}

ANSWER_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["job", "headline", "summary", "sections", "source_ids", "uncertainty_ids", "suggested_refinements"],
    "properties": {
        "job": SELECTOR_JSON_SCHEMA["properties"]["job"],
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kind", "title", "items"],
                "properties": {
                    "kind": {"type": "string", "enum": ["needs_review", "questions", "established", "recent_context", "changes", "open_attention", "draft", "other"]},
                    "title": {"type": "string"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["text", "record_type", "record_id", "detail"],
                            "properties": {
                                "text": {"type": "string"},
                                "record_type": {"type": "string", "enum": ["state", "review", "blocking_question", "question", "history", "evidence", "none"]},
                                "record_id": {"type": ["string", "null"]},
                                "detail": {"type": ["string", "null"]},
                            },
                        },
                    },
                },
            },
        },
        "source_ids": {"type": "array", "items": {"type": "string"}},
        "uncertainty_ids": {"type": "array", "items": {"type": "string"}},
        "suggested_refinements": {"type": "array", "items": {"type": "string"}},
    },
}


# Keep the visible answer first in the structured stream. The final payload still
# validates answer record IDs against `selection`, but emitting answer first lets
# the browser render useful text while the model finishes the hidden ID lists.
ONE_CALL_ASK_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer", "selection"],
    "properties": {
        "answer": ANSWER_JSON_SCHEMA,
        "selection": SELECTOR_JSON_SCHEMA,
    },
}
