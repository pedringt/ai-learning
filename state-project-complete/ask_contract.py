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

class AskSynthesis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job: AskJob
    headline: str = Field(min_length=1, max_length=180)
    summary: str = Field(min_length=1, max_length=1_200)
    sections: list[AskAnswerSection] = Field(default_factory=list, max_length=7)
    source_ids: list[str] = Field(default_factory=list, max_length=80)
    uncertainty_ids: list[str] = Field(default_factory=list, max_length=50)
    suggested_refinements: list[str] = Field(default_factory=list, max_length=5)

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


ONE_CALL_ASK_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["selection", "answer"],
    "properties": {
        "selection": SELECTOR_JSON_SCHEMA,
        "answer": ANSWER_JSON_SCHEMA,
    },
}
