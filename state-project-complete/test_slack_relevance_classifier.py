"""Tests for the real (model-backed) Slack relevance classifiers.

evaluate_due_checkpoints() itself is tested against FakeSlackRelevanceClassifier
in test_slack_phase2.py. These tests cover the provider-specific pieces added
for Phase 2: each provider's classify_slack_relevance() and the
ProviderRelevanceClassifier adapter that lets the relevance worker reuse
whichever provider is already configured for Evidence interpretation.
"""

from __future__ import annotations

from types import SimpleNamespace

from anthropic_provider import AnthropicProvider
from openai_provider import OpenAIProvider
from slack_relevance_service import ProviderRelevanceClassifier


def test_anthropic_classify_relevant_uses_structured_output_schema():
    provider = AnthropicProvider(model_identifier="claude-haiku-4-5", api_key="test")
    captured = {}

    class Messages:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                content=[SimpleNamespace(text='{"relevant": true, "summary": "The vendor now owns retention."}')],
            )

    provider._client = SimpleNamespace(messages=Messages())

    result = provider.classify_slack_relevance("We decided the vendor owns retention going forward.")

    assert result == {"relevant": True, "summary": "The vendor now owns retention."}
    assert captured["output_config"]["format"]["type"] == "json_schema"
    assert set(captured["output_config"]["format"]["schema"]["required"]) == {"relevant", "summary"}


def test_anthropic_classify_not_relevant():
    provider = AnthropicProvider(model_identifier="claude-haiku-4-5", api_key="test")

    class Messages:
        def create(self, **kwargs):
            return SimpleNamespace(content=[SimpleNamespace(text='{"relevant": false, "summary": ""}')])

    provider._client = SimpleNamespace(messages=Messages())

    assert provider.classify_slack_relevance("Anyone want coffee?") == {"relevant": False, "summary": ""}


def test_anthropic_classify_falls_back_to_not_relevant_on_non_json_response():
    provider = AnthropicProvider(model_identifier="claude-haiku-4-5", api_key="test")

    class Messages:
        def create(self, **kwargs):
            return SimpleNamespace(content=[SimpleNamespace(text="I cannot help with that.")])

    provider._client = SimpleNamespace(messages=Messages())

    assert provider.classify_slack_relevance("anything") == {"relevant": False, "summary": ""}


def test_openai_classify_relevant():
    provider = OpenAIProvider(model_identifier="gpt-4o", api_key="test")

    class Completions:
        def create(self, **kwargs):
            message = SimpleNamespace(content='{"relevant": true, "summary": "Launch moved to Friday."}')
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    provider._client = SimpleNamespace(chat=SimpleNamespace(completions=Completions()))

    result = provider.classify_slack_relevance("We decided the launch moves to Friday.")

    assert result == {"relevant": True, "summary": "Launch moved to Friday."}


def test_openai_classify_parses_markdown_fenced_json():
    provider = OpenAIProvider(model_identifier="gpt-4o", api_key="test")

    class Completions:
        def create(self, **kwargs):
            message = SimpleNamespace(content='```json\n{"relevant": false, "summary": ""}\n```')
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    provider._client = SimpleNamespace(chat=SimpleNamespace(completions=Completions()))

    assert provider.classify_slack_relevance("anything") == {"relevant": False, "summary": ""}


def test_provider_relevance_classifier_delegates_to_provider():
    class StubProvider:
        def classify_slack_relevance(self, conversation_text: str):
            return {"relevant": True, "summary": conversation_text.upper()}

    classifier = ProviderRelevanceClassifier(StubProvider())

    assert classifier.classify("hello") == {"relevant": True, "summary": "HELLO"}
