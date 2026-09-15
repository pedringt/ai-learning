"""Prompt-contract tests for the two new consequentiality levers (product
direction, 2026-09-15):

1. Bootstrap mode: when a project has zero active Current State items, the
   normal comparison-based consequentiality bar has nothing to compare
   against, so BOOTSTRAP_GUIDANCE is injected to bias toward coverage.
2. Explicit human promotion: when a user asks State to reconsider Evidence
   that previously got no_review, USER_PROMOTION_GUIDANCE is injected so the
   model doesn't silently decline solely on the consequentiality bar.

Same pattern as test_provider_prompt_contract.py's `_prompt()` helper:
these check the literal built prompt, not live model output (that's
test_evidence_intake_consequentiality.py's job, gated on a real API key).
"""
import sqlite3

from anthropic_provider import AnthropicProvider, InterpretationContextSnapshot
from openai_provider import OpenAIProvider
from consequentiality_guidance import BOOTSTRAP_GUIDANCE, USER_PROMOTION_GUIDANCE


def _connection_with_one_state_item():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE current_state_items (id TEXT, topic TEXT, statement TEXT, effective_date TEXT)"
    )
    conn.execute(
        "INSERT INTO current_state_items VALUES ('state_1', 'launch', 'Launch is October 1.', NULL)"
    )
    return conn


def _empty_connection():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE current_state_items (id TEXT, topic TEXT, statement TEXT, effective_date TEXT)"
    )
    return conn


def _providers():
    return [
        AnthropicProvider(model_identifier="test", api_key="test"),
        OpenAIProvider(api_key="test"),
    ]


def test_bootstrap_guidance_present_when_current_state_is_empty():
    for provider in _providers():
        conn = _empty_connection()
        try:
            ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
            prompt = provider._build_prompt(ctx, {"id": "e1", "content": "x"}, conn)
            assert BOOTSTRAP_GUIDANCE.strip() in prompt, f"{provider.name} prompt missing bootstrap guidance"
        finally:
            conn.close()


def test_bootstrap_guidance_absent_when_current_state_exists():
    for provider in _providers():
        conn = _connection_with_one_state_item()
        try:
            ctx = InterpretationContextSnapshot(state_items={"state_1": 1}, open_reviews={})
            prompt = provider._build_prompt(ctx, {"id": "e1", "content": "x"}, conn)
            assert BOOTSTRAP_GUIDANCE.strip() not in prompt, (
                f"{provider.name} prompt should not include bootstrap guidance once "
                "Current State is established"
            )
        finally:
            conn.close()


def test_user_promotion_block_present_only_when_requested():
    for provider in _providers():
        conn = _empty_connection()
        try:
            ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
            without = provider._build_prompt(ctx, {"id": "e1", "content": "x"}, conn)
            assert USER_PROMOTION_GUIDANCE.strip() not in without, (
                f"{provider.name} prompt should not include the promotion override by default"
            )
            withit = provider._build_prompt(
                ctx, {"id": "e1", "content": "x", "user_requested_maintenance": True}, conn
            )
            assert USER_PROMOTION_GUIDANCE.strip() in withit, (
                f"{provider.name} prompt should include the promotion override when requested"
            )
        finally:
            conn.close()
