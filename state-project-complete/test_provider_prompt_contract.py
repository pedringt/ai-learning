import sqlite3
from anthropic_provider import AnthropicProvider, InterpretationContextSnapshot
from openai_provider import OpenAIProvider


def _prompt(provider):
    ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
    conn = sqlite3.connect(':memory:')
    conn.execute('CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)')
    try:
        return provider._build_prompt(ctx, {'id':'e1','content':'x'}, conn)
    finally:
        conn.close()


def _assert_date_contract(prompt: str):
    lower = prompt.lower()
    assert 'effective_date' in prompt
    assert 'yyyy-mm-dd' in lower
    assert 'omit' in lower
    assert ('partial' in lower or '2026-10' in prompt)
    assert ('approval' in lower or 'upon_decision' in lower)


def test_anthropic_prompt_explains_effective_date_contract():
    _assert_date_contract(_prompt(AnthropicProvider(model_identifier='test', api_key='test')))


def test_openai_prompt_explains_effective_date_contract():
    _assert_date_contract(_prompt(OpenAIProvider(api_key='test')))


def _assert_target_contract(prompt: str):
    assert 'output the exact existing state_item_id' in prompt
    assert 'Software supplies expected_version' in prompt
    assert ('ensures the target is included in affected_state_item_ids' in prompt
            or 'ensures that target is affected' in prompt)


def test_anthropic_prompt_explains_backend_owned_target_metadata():
    _assert_target_contract(_prompt(AnthropicProvider(model_identifier='test', api_key='test')))


def test_openai_prompt_explains_backend_owned_target_metadata():
    _assert_target_contract(_prompt(OpenAIProvider(api_key='test')))

def test_anthropic_low_latency_defaults(monkeypatch):
    monkeypatch.delenv('CLAUDE_MODEL', raising=False)
    monkeypatch.delenv('CLAUDE_MAX_TOKENS', raising=False)
    provider = AnthropicProvider(api_key='test')
    assert provider.model_identifier == 'claude-haiku-4-5-20251001'
    assert provider.max_tokens == 1200


def test_anthropic_prompt_maps_missing_understanding_to_create_only():
    prompt = _prompt(AnthropicProvider(model_identifier='test', api_key='test'))
    assert 'missing_understanding' in prompt
    assert 'create operations only' in prompt
    assert 'proposed_update' in prompt


def test_openai_prompt_maps_missing_understanding_to_create_only():
    from openai_provider import OpenAIProvider
    import inspect
    source = inspect.getsource(OpenAIProvider._build_prompt)
    assert 'every proposed_change in a missing_understanding review MUST use operation "create"' in source
    assert 'use review_type "proposed_update", not "missing_understanding"' in source


def test_prompts_do_not_delegate_expected_version_to_model():
    for provider_cls in (AnthropicProvider, OpenAIProvider):
        prompt = _prompt(provider_cls())
        assert "Software supplies expected_version" in prompt
        assert '"expected_version": 1' not in prompt



def test_anthropic_uses_structured_output_schema(monkeypatch):
    from types import SimpleNamespace
    provider = AnthropicProvider(model_identifier='claude-haiku-4-5', api_key='test')
    captured = {}

    class Messages:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                content=[SimpleNamespace(text='{"summary":"No change","topics":[],"no_review_explanation":"No material change","review_recommendations":[]}')],
                usage=SimpleNamespace(input_tokens=10, output_tokens=20),
                stop_reason='end_turn',
            )
    provider._client = SimpleNamespace(messages=Messages())
    ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
    conn = sqlite3.connect(':memory:')
    conn.execute('CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)')
    try:
        provider.interpret(context=ctx, evidence={'id':'e1','content':'FYI only'}, connection=conn)
    finally:
        conn.close()
    assert captured['output_config']['format']['type'] == 'json_schema'
    schema = captured['output_config']['format']['schema']
    assert schema['properties']['review_recommendations']['type'] == 'array'
    assert 'expected_version' not in str(schema)
    assert 'outcome' not in schema['properties']
    recommendation_schema = schema['properties']['review_recommendations']['items']
    assert 'review_action' not in recommendation_schema['properties']


def test_anthropic_prompt_is_compact_and_does_not_repeat_json_skeleton():
    prompt = _prompt(AnthropicProvider(model_identifier='test', api_key='test'))
    assert '<instructions>' in prompt
    assert '"review_recommendations": [' not in prompt
    assert len(prompt) < 3500


def test_provider_output_schema_stays_below_anthropic_complexity_budget():
    from provider_output_schema import PROVIDER_OUTPUT_SCHEMA

    optional = 0
    def walk(schema):
        nonlocal optional
        if not isinstance(schema, dict):
            return
        props = schema.get('properties', {})
        required = set(schema.get('required', []))
        optional += len(set(props) - required)
        for child in props.values():
            walk(child)
        if isinstance(schema.get('items'), dict):
            walk(schema['items'])
    walk(PROVIDER_OUTPUT_SCHEMA)
    # Anthropic currently documents a 24-optional-parameter ceiling for
    # structured outputs. Keep our provider schema intentionally well below it.
    assert optional <= 12


def test_prompts_preserve_approval_vs_implementation_status():
    for provider_cls in (AnthropicProvider, OpenAIProvider):
        prompt = _prompt(provider_cls())
        lower = prompt.lower()
        assert "approved" in lower
        assert "implemented" in lower
        assert ("approved != implemented" in lower or "approved” does not mean implemented" in lower)
        assert "widen" in lower or "narrow" in lower


def test_anthropic_prompt_rejects_speculative_followup_work():
    prompt = _prompt(AnthropicProvider(model_identifier='test', api_key='test')).lower()
    assert "speculative residue" in prompt
    assert "missing implementation details" in prompt


def test_provider_prompt_exposes_open_questions_without_promoting_them_to_blockers():
    for provider_cls in (AnthropicProvider, OpenAIProvider):
        ctx = InterpretationContextSnapshot(state_items={}, open_reviews={})
        conn = sqlite3.connect(':memory:')
        conn.execute('CREATE TABLE questions (id TEXT, text TEXT, status TEXT, blocking INTEGER, blocks TEXT, created_at TEXT)')
        conn.execute("INSERT INTO questions VALUES ('q1','Are password reset tickets approved for automation?','open',0,NULL,'2026-09-01')")
        try:
            prompt = provider_cls()._build_prompt(ctx, {'id':'e1','content':'Password reset tickets were approved for automation.'}, conn)
        finally:
            conn.close()
        assert 'q1' in prompt
        assert 'resolves_question_ids' in prompt
        assert 'blocking' in prompt.lower()
        assert ('do not infer' in prompt.lower() or 'must not infer' in prompt.lower())
