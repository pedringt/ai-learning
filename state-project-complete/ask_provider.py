"""Provider-neutral model adapter for State Ask."""
from __future__ import annotations

import json
import re
from typing import Any, Iterator, Mapping

from ask_contract import ANSWER_JSON_SCHEMA, ONE_CALL_ASK_JSON_SCHEMA, SELECTOR_JSON_SCHEMA


# Ask returns both a grounded selection and a user-facing answer in one structured
# response. 1500 tokens proved too tight in production. 1650 keeps additional JSON
# headroom while trimming generation work for concise manager-facing answers.
ASK_ONE_CALL_MAX_TOKENS = 1650
# Ask is interactive. The Anthropic SDK defaults to two retries, which can turn a
# transient 30-second timeout into a ~70-second user wait. Evidence interpretation
# keeps the provider's normal retry behavior; Ask uses a single bounded attempt.
ASK_TIMEOUT_SECONDS = 30.0
ASK_MAX_RETRIES = 0


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

    def _anthropic_client(self):
        """Use interactive Ask-specific retry/timeout settings without changing Evidence."""
        return self.provider.client.with_options(
            timeout=ASK_TIMEOUT_SECONDS,
            max_retries=ASK_MAX_RETRIES,
        )

    def run(self, prompt: str) -> Mapping[str, Any]:
        """Select relevant context and synthesize in one provider round-trip."""
        return self._call(prompt, ONE_CALL_ASK_JSON_SCHEMA, max_tokens=ASK_ONE_CALL_MAX_TOKENS)

    def stream(self, prompt: str) -> Iterator[str]:
        """Stream the one-call Ask JSON text as the model generates it."""
        if self.name == "anthropic":
            with self._anthropic_client().messages.stream(
                model=self.model_identifier,
                max_tokens=ASK_ONE_CALL_MAX_TOKENS,
                output_config={"format": {"type": "json_schema", "schema": ONE_CALL_ASK_JSON_SCHEMA}},
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    if text:
                        yield text
            return
        if self.name == "openai":
            response = self.provider.client.chat.completions.create(
                model=self.model_identifier,
                max_tokens=ASK_ONE_CALL_MAX_TOKENS,
                messages=[{"role": "user", "content": prompt + "\nReturn JSON only."}],
                stream=True,
            )
            for chunk in response:
                text = getattr(chunk.choices[0].delta, "content", None) if getattr(chunk, "choices", None) else None
                if text:
                    yield text
            return
        raise RuntimeError(f"Configured provider {self.name!r} does not support streaming Ask")

    def select(self, prompt: str) -> Mapping[str, Any]:
        return self._call(prompt, SELECTOR_JSON_SCHEMA, max_tokens=900)

    def synthesize(self, prompt: str) -> Mapping[str, Any]:
        return self._call(prompt, ANSWER_JSON_SCHEMA, max_tokens=1800)

    def _call(self, prompt: str, schema: Mapping[str, Any], *, max_tokens: int) -> Mapping[str, Any]:
        if self.name == "anthropic":
            message = self._anthropic_client().messages.create(
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
