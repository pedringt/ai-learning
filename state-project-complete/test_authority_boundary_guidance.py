import sqlite3

from anthropic_provider import AnthropicProvider, InterpretationContextSnapshot
from openai_provider import OpenAIProvider


def _prompt(provider):
    context = InterpretationContextSnapshot(
        state_items={
            "k-sensitive": {
                "id": "k-sensitive",
                "topic": "Sensitive actions",
                "statement": "Billing adjustments and other sensitive account actions remain outside the first implementation.",
                "version": 1,
            }
        },
        open_reviews={},
    )
    connection = sqlite3.connect(":memory:")
    connection.execute(
        "CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)"
    )
    try:
        return provider._build_prompt(
            context,
            {
                "id": "e1",
                "content": "VP says we can move forward on auto drafting billing quesitons",
            },
            connection,
        )
    finally:
        connection.close()


def test_both_provider_prompts_protect_authority_backed_scope_changes_near_boundaries():
    for provider in (
        AnthropicProvider(model_identifier="test", api_key="test"),
        OpenAIProvider(api_key="test"),
    ):
        prompt = _prompt(provider).lower()
        assert "decision-maker" in prompt
        assert '"move forward"' in prompt
        assert "sensitive-domain boundary" in prompt
        assert "state_at_risk" in prompt
        assert "open_question" in prompt
        assert "rather than returning no_review" in prompt
