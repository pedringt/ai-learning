"""Per-model request options for State's short, strict-JSON Anthropic calls.

State keeps thinking off for these calls: on Claude 5.x models adaptive thinking can spend the whole
max_tokens budget before any text. Production runs Claude Haiku 5.5, which accepts
thinking={"type": "disabled"}. Two other models are used only by the eval matrix (Oct 16) and reject that:

- claude-sonnet-5-5: "disabled" is a 400; {"type": "between_tools"} is its thinking-off equivalent
  (accepted at effort high or below, which is the default, and takes no other field).
- claude-opus-5-5: thinking can't be turned off at any effort; omit `thinking`, set effort "low", and
  give the response extra room so thinking can't consume the JSON's budget.

Every other model gets exactly the request State has always sent.
"""
from __future__ import annotations

from typing import Any, Mapping

OPUS_THINKING_HEADROOM = 8000


def _family(model: str | None) -> str:
    name = str(model or "")
    if name == "claude-sonnet-5-5" or name.startswith("claude-sonnet-5-5-"):
        return "sonnet-5-5"
    if name == "claude-opus-5-5" or name.startswith("claude-opus-5-5-"):
        return "opus-5-5"
    return "default"


def request_options(model: str | None, max_tokens: int, output_config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Keyword arguments for messages.create/stream: max_tokens, thinking (when sent) and output_config."""
    config = dict(output_config or {})
    family = _family(model)
    if family == "sonnet-5-5":
        return {"max_tokens": max_tokens, "thinking": {"type": "between_tools"}, **({"output_config": config} if config else {})}
    if family == "opus-5-5":
        return {"max_tokens": max_tokens + OPUS_THINKING_HEADROOM, "output_config": {**config, "effort": "low"}}
    return {"max_tokens": max_tokens, "thinking": {"type": "disabled"}, **({"output_config": config} if config else {})}
