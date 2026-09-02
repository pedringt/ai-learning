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


def _assert_target_affected_contract(prompt: str):
    assert 'For EVERY update or retire proposal' in prompt
    assert 'MUST also appear in affected_state_item_ids' in prompt
    assert 'same review recommendation' in prompt.lower()


def test_anthropic_prompt_requires_target_in_affected_state_items():
    _assert_target_affected_contract(_prompt(AnthropicProvider(model_identifier='test', api_key='test')))


def test_openai_prompt_requires_target_in_affected_state_items():
    _assert_target_affected_contract(_prompt(OpenAIProvider(api_key='test')))


def test_anthropic_low_latency_defaults(monkeypatch):
    monkeypatch.delenv('CLAUDE_MODEL', raising=False)
    monkeypatch.delenv('CLAUDE_MAX_TOKENS', raising=False)
    provider = AnthropicProvider(api_key='test')
    assert provider.model_identifier == 'claude-haiku-4-5-20251001'
    assert provider.max_tokens == 1600


def test_anthropic_prompt_maps_missing_understanding_to_create_only():
    from anthropic_provider import AnthropicProvider
    import inspect
    source = inspect.getsource(AnthropicProvider._build_prompt)
    assert 'every proposed_change in a missing_understanding review MUST use operation "create"' in source
    assert 'use review_type "proposed_update", not "missing_understanding"' in source


def test_openai_prompt_maps_missing_understanding_to_create_only():
    from openai_provider import OpenAIProvider
    import inspect
    source = inspect.getsource(OpenAIProvider._build_prompt)
    assert 'every proposed_change in a missing_understanding review MUST use operation "create"' in source
    assert 'use review_type "proposed_update", not "missing_understanding"' in source
