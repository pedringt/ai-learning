"""Provider-neutral model adapter for State Ask."""
from __future__ import annotations

import json
import re
from typing import Any, Mapping
from copy import deepcopy

from ask_contract import ANSWER_JSON_SCHEMA, ONE_CALL_ASK_JSON_SCHEMA, SELECTOR_JSON_SCHEMA


def _parse_json(text: str) -> Mapping[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def _anthropic_schema(schema: Mapping[str, Any]) -> Mapping[str, Any]:
    """Return a provider-compatible copy without weakening software validation.

    Anthropic structured outputs currently reject JSON Schema array maxItems.
    State still enforces those bounds when normalizing/validating provider output.
    """
    cleaned = deepcopy(schema)
    def walk(value):
        if isinstance(value, dict):
            value.pop("maxItems", None)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(cleaned)
    return cleaned


class LiveAskProvider:
    """Reuse the configured interpretation provider/client for Ask synthesis."""

    def __init__(self, provider: Any):
        self.provider = provider
        self.name = getattr(provider, "name", "unknown")
        self.model_identifier = getattr(provider, "model_identifier", "unknown")

    def run(self, prompt: str) -> Mapping[str, Any]:
        """Select relevant context and synthesize in one provider round-trip."""
        return self._call(prompt, ONE_CALL_ASK_JSON_SCHEMA, max_tokens=1500)

    def select(self, prompt: str) -> Mapping[str, Any]:
        return self._call(prompt, SELECTOR_JSON_SCHEMA, max_tokens=1200)

    def synthesize(self, prompt: str) -> Mapping[str, Any]:
        return self._call(prompt, ANSWER_JSON_SCHEMA, max_tokens=2200)

    def synthesize_selected(self, prompt: str) -> Mapping[str, Any]:
        """Fast path when software has already selected authoritative context."""
        return self._call(prompt, ANSWER_JSON_SCHEMA, max_tokens=1300)

    def stream_synthesize_selected(self, prompt: str):
        """Yield structured-output text deltas for the grounded meeting-prep fast path.

        The caller must accumulate the complete JSON text and validate it before
        treating the streamed draft as a finished State answer.
        """
        if self.name != "anthropic":
            raise RuntimeError("Streaming Ask currently requires the Anthropic provider")
        with self.provider.client.messages.stream(
            model=self.model_identifier,
            max_tokens=1300,
            output_config={"format": {"type": "json_schema", "schema": _anthropic_schema(ANSWER_JSON_SCHEMA)}},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text

    def _call(self, prompt: str, schema: Mapping[str, Any], *, max_tokens: int) -> Mapping[str, Any]:
        if self.name == "anthropic":
            message = self.provider.client.messages.create(
                model=self.model_identifier,
                max_tokens=max_tokens,
                output_config={"format": {"type": "json_schema", "schema": _anthropic_schema(schema)}},
                messages=[{"role": "user", "content": prompt}],
            )
            text = next((getattr(block, "text", None) for block in message.content if getattr(block, "text", None)), None)
            if not text:
                raise RuntimeError("Anthropic returned no Ask content")
            return _parse_json(text)
        if self.name == "openai":
            response = self.provider.client.chat.completions.create(
                model=self.model_identifier,
                max_tokens=max_tokens,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "state_ask_response",
                        "strict": True,
                        "schema": schema,
                    },
                },
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.choices[0].message.content
            if not text:
                raise RuntimeError("OpenAI returned no Ask content")
            return _parse_json(text)
        if hasattr(self.provider, "ask_select") and hasattr(self.provider, "ask_synthesize"):
            raise RuntimeError("Use the test provider directly rather than LiveAskProvider")
        raise RuntimeError(f"Configured provider {self.name!r} does not support Ask")
