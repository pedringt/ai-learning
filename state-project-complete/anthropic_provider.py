"""Anthropic provider adapter for State interpretation.

This adapter wraps the Anthropic Claude API, sending structured context
and receiving structured interpretation recommendations.

The adapter is intentionally thin: it formats context, calls the API, and
returns structured JSON. Application-owned validation enforces the contract.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Mapping

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.semantic_validation import InterpretationContextSnapshot
from provider_output_schema import PROVIDER_OUTPUT_SCHEMA


class AnthropicProvider:
    """Provider adapter for Anthropic's Claude API."""

    def __init__(self, model_identifier: str | None = None, api_key: str | None = None):
        """Initialize provider.

        Args:
            model_identifier: Claude model to use. If None, uses CLAUDE_MODEL env var
                            or defaults to 'claude-haiku-4-5-20251001' for low-latency interpretation
            api_key: Anthropic API key (if None, uses ANTHROPIC_API_KEY env var)
        """
        self.name = "anthropic"
        self.model_identifier = model_identifier or os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
        self.max_tokens = int(os.getenv("CLAUDE_MAX_TOKENS", "1200"))
        self.timeout_seconds = float(os.getenv("CLAUDE_TIMEOUT_SECONDS", "30"))
        self.api_key = api_key
        
        # Lazy import to avoid requiring anthropic library unless actually used
        self._client = None

    @property
    def client(self):
        """Lazy-load Anthropic client."""
        if self._client is None:
            try:
                import anthropic
            except ImportError:
                raise ImportError(
                    "anthropic package required for live adapters. "
                    "Install: pip install anthropic"
                )
            self._client = anthropic.Anthropic(
                api_key=self.api_key,
                timeout=self.timeout_seconds,
            )
        return self._client

    def interpret(
        self,
        *,
        context: InterpretationContextSnapshot,
        evidence: Mapping[str, Any],
        connection: Any = None,  # SQLite connection for fetching full context
    ) -> Mapping[str, Any]:
        """Interpret evidence using Anthropic Claude.

        Args:
            context: Authority snapshot (IDs/versions at interpretation time)
            evidence: Evidence dict with "id" and "content"
            connection: SQLite connection to fetch full State/Review statements
                       (required to build complete prompt)

        Returns:
            StructuredInterpretation (JSON-serializable dict, validated by caller)
        """
        if connection is None:
            raise ValueError(
                "Anthropic adapter requires database connection to fetch full context"
            )

        # Build complete prompt context from database and time it separately from
        # the provider round-trip so production traces identify the slow layer.
        prompt_started = time.perf_counter()
        prompt = self._build_prompt(context, evidence, connection)
        prompt_ms = (time.perf_counter() - prompt_started) * 1000

        # Call Claude API. Keep this adapter observable because provider latency
        # dominates the end-to-end request in production. flush=True matters on
        # hosted logs so the start line appears before the network request returns.
        started = time.perf_counter()
        print(
            f"[PROVIDER] anthropic start model={self.model_identifier} "
            f"prompt_chars={len(prompt)} prompt_ms={prompt_ms:.0f} "
            f"max_tokens={self.max_tokens} timeout_s={self.timeout_seconds:g}",
            flush=True,
        )
        message = self.client.messages.create(
            model=self.model_identifier,
            max_tokens=self.max_tokens,
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": PROVIDER_OUTPUT_SCHEMA,
                }
            },
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )
        elapsed_ms = (time.perf_counter() - started) * 1000
        usage = getattr(message, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)
        stop_reason = getattr(message, "stop_reason", None)
        print(
            f"[PROVIDER] anthropic done model={self.model_identifier} "
            f"elapsed_ms={elapsed_ms:.0f} input_tokens={input_tokens} "
            f"output_tokens={output_tokens} stop_reason={stop_reason}",
            flush=True,
        )

        # Structured outputs can still be non-schema text on refusal or be
        # truncated at max_tokens. Fail explicitly instead of surfacing a
        # confusing downstream JSON/schema error.
        if stop_reason == "max_tokens":
            raise RuntimeError(
                f"Anthropic structured output hit max_tokens={self.max_tokens}; "
                "increase CLAUDE_MAX_TOKENS or reduce requested output."
            )
        if stop_reason == "refusal":
            raise RuntimeError("Anthropic refused the structured interpretation request.")

        # Parse response
        text_blocks = [getattr(block, "text", None) for block in message.content]
        response_text = next((text for text in text_blocks if text), None)
        if not response_text:
            raise RuntimeError("Anthropic returned no text content for structured interpretation.")
        
        # Extract JSON from response (Claude often wraps in markdown)
        try:
            # Try direct JSON parse first
            structured = json.loads(response_text)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code blocks
            import re
            match = re.search(r"```(?:json)?\s*(.*?)\s*```", response_text, re.DOTALL)
            if match:
                structured = json.loads(match.group(1))
            else:
                # Last resort: assume entire response is JSON
                structured = json.loads(response_text)

        return structured

    def _build_prompt(
        self,
        context: InterpretationContextSnapshot,
        evidence: Mapping[str, Any],
        connection: Any,
    ) -> str:
        """Build the prompt for Claude, including full context.

        Args:
            context: Authority snapshot (reference only)
            evidence: Evidence dict
            connection: SQLite connection to fetch full statements

        Returns:
            Prompt string for Claude
        """
        # Fetch full State statements
        connection.row_factory = None
        states = {}
        for state_id in context.state_items.keys():
            row = connection.execute(
                "SELECT statement, effective_date FROM current_state_items WHERE id=?",
                (state_id,),
            ).fetchone()
            if row:
                states[state_id] = {"statement": row[0], "effective_date": row[1]}

        # Fetch full Review details
        reviews = {}
        for review_id in context.open_reviews.keys():
            row = connection.execute(
                "SELECT review_type, decision_question, why_consequential "
                "FROM review_issues WHERE id=?",
                (review_id,),
            ).fetchone()
            if row:
                reviews[review_id] = {
                    "review_type": row[0],
                    "decision_question": row[1],
                    "why_consequential": row[2],
                }

        # The API constrains structural JSON. Keep this prompt focused on semantic
        # interpretation and cross-field meaning rather than repeating the full schema.
        prompt = f"""You maintain a project's reviewed Current State from immutable Evidence.
Evidence never changes State directly; a human decides Reviews.

<current_state>
{self._format_state_items(states)}
</current_state>

<open_reviews>
{self._format_open_reviews(reviews)}
</open_reviews>

<evidence id="{evidence.get('id')}">
{evidence.get('content')}
</evidence>

<instructions>
Compare the Evidence with Current State and open Reviews. Return the semantic interpretation in the supplied JSON schema.

- If Evidence does not materially change, threaten, or fill maintained understanding, return no recommendations and explain briefly.
- proposed_update: use when Evidence changes or retires existing State. update/retire must use an exact State ID shown above. A grouped proposed_update may also create new State.
- missing_understanding: use for information not represented in Current State. Its proposals must be create operations only. Create proposals have no state_item_id.
- state_at_risk: use when Evidence makes existing State uncertain without establishing a replacement; normally emit no proposal.
- Set existing_review_id only when an open Review above is clearly the same pending human decision; use its exact Review ID. Otherwise omit it so software creates a new Review.
- For update/retire, output the exact existing state_item_id. Software supplies expected_version and ensures that target is affected.
- effective_date is optional. Include only a complete date explicitly established by Evidence, as YYYY-MM-DD. Omit relative, partial, immediate, approval-dependent, or unknown timing.
- grouping_reason is optional only when one Review genuinely groups multiple affected State items or multiple changes.
- Never invent State IDs, Review IDs, dates, facts, or certainty.
- Keep summary, questions, reasons, and rationales concise: one sentence each, usually under 25 words. Use at most 3 topics unless clearly necessary.
- If uncertain whether maintained understanding may need human judgment, recommend a Review rather than silently changing State.
</instructions>
"""
        return prompt

    def _format_state_items(self, states: dict[str, dict[str, Any]]) -> str:
        """Format semantic State context compactly; versions stay backend-owned."""
        if not states:
            return "(No active State items)"
        lines = []
        for state_id, details in sorted(states.items()):
            suffix = f" [effective {details['effective_date']}]" if details.get("effective_date") else ""
            lines.append(f"- {state_id}: {details['statement']}{suffix}")
        return "\n".join(lines)

    def _format_open_reviews(self, reviews: dict[str, dict]) -> str:
        """Format open Reviews for prompt."""
        if not reviews:
            return "(No open Reviews)"
        lines = []
        for review_id, details in sorted(reviews.items()):
            lines.append(f"- **{review_id}** ({details['review_type']})")
            lines.append(f"  - Decision: {details['decision_question']}")
            lines.append(f"  - Why: {details['why_consequential']}")
        return "\n".join(lines)
