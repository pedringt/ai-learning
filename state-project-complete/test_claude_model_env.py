"""An empty CLAUDE_MODEL must fall back to the default model, not be sent as "".

Oct 10: the CLAUDE_MODEL repository variable disappeared, GitHub Actions passed it as an
empty string, and every eval call failed with "model: String should have at least 1
character" (400). No model calls here."""
from anthropic_provider import AnthropicProvider


def test_empty_claude_model_uses_the_default(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    assert AnthropicProvider().model_identifier == "claude-haiku-5-5"


def test_a_set_claude_model_is_used(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "claude-test-model")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    assert AnthropicProvider().model_identifier == "claude-test-model"
