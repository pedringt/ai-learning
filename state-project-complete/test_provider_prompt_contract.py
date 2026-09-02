import sqlite3
from anthropic_provider import AnthropicProvider, InterpretationContextSnapshot
from openai_provider import OpenAIProvider


def _prompt(provider):
    ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
    conn = sqlite3.connect(':memory:')
    try:
        return provider._build_prompt(ctx, {'id':'e1','content':'x'}, conn)
    finally:
        conn.close()


def _assert_date_contract(prompt: str):
    assert 'Include it ONLY when the Evidence establishes a specific complete calendar date' in prompt
    assert 'OMIT effective_date' in prompt
    assert '"upon_decision"' in prompt
    assert 'partial dates such as "2026-10"' in prompt


def test_anthropic_prompt_explains_effective_date_contract():
    _assert_date_contract(_prompt(AnthropicProvider(model_identifier='test', api_key='test')))


def test_openai_prompt_explains_effective_date_contract():
    _assert_date_contract(_prompt(OpenAIProvider(api_key='test')))
