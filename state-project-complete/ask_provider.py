"""Provider-neutral model adapter for State Ask."""
from __future__ import annotations

import json
import re
from typing import Any, Mapping

from ask_contract import ANSWER_JSON_SCHEMA, ONE_CALL_ASK_JSON_SCHEMA, SELECTOR_JSON_SCHEMA


def _parse_json(text: str) -> Mapping[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


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

    def _call(self, prompt: str, schema: Mapping[str, Any], *, max_tokens: int) -> Mapping[str, Any]:
        if self.name == "anthropic":
            message = self.provider.client.messages.create(
                model=self.model_identifier,
                max_tokens=max_tokens,
                output_config={"format": {"type": "json_schema", "schema": schema}},
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
                messages=[{"role": "user", "content": prompt + "\nReturn JSON only."}],
            )
            text = response.choices[0].message.content
            if not text:
                raise RuntimeError("OpenAI returned no Ask content")
            return _parse_json(text)
        if hasattr(self.provider, "ask_select") and hasattr(self.provider, "ask_synthesize"):
            raise RuntimeError("Use the test provider directly rather than LiveAskProvider")
        raise RuntimeError(f"Configured provider {self.name!r} does not support Ask")
