"""Structured contracts for State Ask selection and synthesis."""
from __future__ import annotations

from datetime import date
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
    # #476: the asker's local calendar day, so "today" is not the server's UTC day.
    # Used only when within a day of the server's date (see ask_service.ask_today).
    client_date: date | None = None

class AskSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job: AskJob
    state_ids: list[str] = Field(default_factory=list, max_length=12)
    review_ids: list[str] = Field(default_factory=list, max_length=8)
    blocking_question_ids: list[str] = Field(default_factory=list, max_length=8)
    question_ids: list[str] = Field(default_factory=list, max_length=10)
    history_ids: list[str] = Field(default_factory=list, max_length=12)
    evidence_ids: list[str] = Field(default_factory=list, max_length=12)
    # #640 (Nov 7): Questions already answered, so Ask can say what was answered without treating it as Current State.
    answered_question_ids: list[str] = Field(default_factory=list, max_length=6)

class AskAnswerItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=700)
    record_type: Literal["state", "review", "blocking_question", "question", "answered_question", "history", "evidence", "none"] = "none"
    record_id: str | None = None
    detail: str | None = Field(default=None, max_length=1_000)
    # #567: set by software, never by the model. "model" = the model's wording, checked; "record" = always the
    # record's own text (Reviews, Questions); "record_fallback" = the model's wording failed the anchor check, so the
    # record's own text is shown instead.
    wording: Literal["model", "record", "record_fallback"] = "model"


ClaimBasis = Literal["current_state", "pending_review", "evidence_says", "open_question", "answered_question", "history", "none"]


class AskClaim(BaseModel):
    """One fact the answer states (#567). The primary record alone sets the basis and the chip; supporting
    references are shown as sources and never raise the claim's authority. `label` is set by software."""
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=300)
    basis: ClaimBasis = "none"
    primary_record_id: str | None = None
    supporting_record_ids: list[str] = Field(default_factory=list, max_length=2)
    label: str | None = None

class AskHypothetical(BaseModel):
    """#567 (Paige, Nov 11): set by software, never by the model, on the one draft section of an explicitly requested
    hypothetical draft (ask_drafts.py). `line` is shown with the draft wherever the draft is shown."""
    model_config = ConfigDict(extra="forbid")
    artifact: str = Field(max_length=40)
    assumption: str | None = Field(default=None, max_length=160)
    line: str = Field(max_length=400)
    notes: list[str] = Field(default_factory=list, max_length=3)


class AskAnswerSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["needs_review", "questions", "established", "recent_context", "changes", "open_attention", "draft", "other"]
    title: str = Field(min_length=1, max_length=160)
    items: list[AskAnswerItem] = Field(default_factory=list, max_length=8)
    hypothetical: AskHypothetical | None = None

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
    # #567: the headline is fixed per job and written by software (ask_claims.FIXED_HEADLINES); the summary is a
    # plain-text copy of the displayed claims, chips included (ask_display), for consumers that read `summary`.
    headline: str = Field(default="What State has on record", max_length=180)
    summary: str = Field(default="", max_length=2_000)
    claims: list[AskClaim] = Field(default_factory=list, max_length=4)
    # Claims and record cards that failed a check and were not shown (#567); the UI then shows one fixed line.
    withheld_claims: int = Field(default=0, ge=0)
    withheld_items: int = Field(default=0, ge=0)
    sections: list[AskAnswerSection] = Field(default_factory=list, max_length=7)
    source_ids: list[str] = Field(default_factory=list, max_length=80)
    uncertainty_ids: list[str] = Field(default_factory=list, max_length=50)
    suggested_refinements: list[str] = Field(default_factory=list, max_length=5)
    # #543 (Oct 20): one specific Question the person could track when the answer finds a gap the record
    # does not cover. Ask never creates it; the UI offers to open the Question form prefilled.
    suggested_question: str | None = Field(default=None, max_length=240)

# Anthropic structured outputs support only a subset of JSON Schema and reject
# array maxItems. Application limits therefore remain authoritative in
# AskSelection / ask_service rather than being expressed in this provider schema.
SELECTOR_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["job", "state_ids", "review_ids", "blocking_question_ids", "question_ids", "history_ids", "evidence_ids", "answered_question_ids"],
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
        "answered_question_ids": {"type": "array", "items": {"type": "string"}},
    },
}

ANSWER_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["job", "claims", "sections", "source_ids", "uncertainty_ids", "suggested_refinements", "suggested_question"],
    "properties": {
        "job": SELECTOR_JSON_SCHEMA["properties"]["job"],
        # #567: no headline or summary from the model. Claims first, so they stream before the cards.
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "basis", "primary_record_id", "supporting_record_ids"],
                "properties": {
                    "text": {"type": "string"},
                    "basis": {"type": "string", "enum": ["current_state", "pending_review", "evidence_says", "open_question", "answered_question", "history", "none"]},
                    "primary_record_id": {"type": ["string", "null"]},
                    "supporting_record_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
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
                                "record_type": {"type": "string", "enum": ["state", "review", "blocking_question", "question", "answered_question", "history", "evidence", "none"]},
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
        "suggested_question": {"type": ["string", "null"]},
    },
}


# #567: selection first. A streamed claim is shown only after the application has checked it against the selected
# records, so the selection has to arrive before the claims. (Until Nov 10 the answer came first, so the browser
# could show the model's raw text while it finished the id lists.)
ONE_CALL_ASK_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["selection", "answer"],
    "properties": {
        "selection": SELECTOR_JSON_SCHEMA,
        "answer": ANSWER_JSON_SCHEMA,
    },
}
