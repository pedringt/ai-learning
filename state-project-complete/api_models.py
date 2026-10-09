"""Request bodies for the State API (moved verbatim from api_core.py in #452)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=100_000)
    source_type: str = Field(default="manual_note", min_length=1, max_length=80)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class ProposalAdjustmentInput(BaseModel):
    """state.md #106: a human-revised statement for one pending proposal.

    The original AI ``proposed_statement`` is never touched by this --
    review_service.py persists this text separately and applies it instead
    of the AI's own wording only for this one acceptance.
    """
    model_config = ConfigDict(extra="forbid")
    proposal_id: str = Field(min_length=1, max_length=100)
    adjusted_statement: str = Field(min_length=1, max_length=4_000)

    @field_validator("adjusted_statement")
    @classmethod
    def adjusted_statement_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("adjusted_statement must not be blank")
        return value


class ResolutionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accept", "keep", "reject"]
    note: str | None = Field(default=None, max_length=2_000)
    expected_question_proposal_id: str | None = Field(default=None, min_length=1, max_length=100)
    expected_existing_question_id: str | None = Field(default=None, min_length=1, max_length=100)
    adjustments: list[ProposalAdjustmentInput] | None = Field(default=None, max_length=20)


class ProjectSwitchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=100)


class ProjectCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Project name cannot be blank")
        return stripped


class ProjectRuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2_000)
    category: Literal["Authority", "Review", "Sources", "Interpretation"] = "Interpretation"

    @field_validator("text")
    @classmethod
    def rule_text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value


class DraftNoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="Untitled note", max_length=300)
    content: str = Field(min_length=1, max_length=100_000)

    @field_validator("content")
    @classmethod
    def draft_content_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class DraftNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="Untitled note", max_length=300)
    content: str = Field(min_length=1, max_length=100_000)

    @field_validator("content")
    @classmethod
    def draft_update_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class SlackChannelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    include_threads: bool | None = None
    include_bots: bool | None = None


class QuestionBlockingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blocking: bool
    blocks: str | None = Field(default=None, max_length=500)

    @field_validator("blocks")
    @classmethod
    def normalize_blocks(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2_000)
    origin: str = Field(default="Added from Workspace", min_length=1, max_length=200)
    blocking: bool = False
    blocks: str | None = Field(default=None, max_length=500)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value

    @field_validator("blocks")
    @classmethod
    def blocker_requires_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None
