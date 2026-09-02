"""OpenAI provider adapter for State interpretation.

This adapter wraps the OpenAI API, sending structured context and receiving
structured interpretation recommendations.

Follows same pattern as Anthropic adapter: thin wrapper around API, 
application-owned validation enforces the contract.
"""

from __future__ import annotations

import json
from typing import Any, Mapping

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.semantic_validation import InterpretationContextSnapshot


class OpenAIProvider:
    """Provider adapter for OpenAI API."""

    def __init__(self, model_identifier: str = "gpt-4o", api_key: str | None = None):
        """Initialize provider.

        Args:
            model_identifier: OpenAI model to use (e.g., 'gpt-4o', 'gpt-4-turbo')
            api_key: OpenAI API key (if None, uses OPENAI_API_KEY env var)
        """
        self.name = "openai"
        self.model_identifier = model_identifier
        self.api_key = api_key
        
        # Lazy import to avoid requiring openai library unless actually used
        self._client = None

    @property
    def client(self):
        """Lazy-load OpenAI client."""
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError:
                raise ImportError(
                    "openai package required for live adapters. "
                    "Install: pip install openai"
                )
            self._client = OpenAI(api_key=self.api_key)
        return self._client

    def interpret(
        self,
        *,
        context: InterpretationContextSnapshot,
        evidence: Mapping[str, Any],
        connection: Any = None,  # SQLite connection for fetching full context
    ) -> Mapping[str, Any]:
        """Interpret evidence using OpenAI.

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
                "OpenAI adapter requires database connection to fetch full context"
            )

        # Build complete prompt context from database
        prompt = self._build_prompt(context, evidence, connection)

        # Call OpenAI API
        response = self.client.chat.completions.create(
            model=self.model_identifier,
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        # Parse response
        response_text = response.choices[0].message.content
        
        # Extract JSON from response
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
        """Build the prompt for OpenAI, including full context.

        Args:
            context: Authority snapshot (reference only)
            evidence: Evidence dict
            connection: SQLite connection to fetch full statements

        Returns:
            Prompt string for OpenAI
        """
        # Fetch full State statements
        connection.row_factory = None
        states = {}
        for state_id in context.state_items.keys():
            row = connection.execute(
                "SELECT statement FROM current_state_items WHERE id=?",
                (state_id,),
            ).fetchone()
            if row:
                states[state_id] = row[0]

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

        # Format prompt (identical to Anthropic, both providers use same schema)
        prompt = f"""You are an AI assistant helping maintain project context and decision-making.

## Your Role

You interpret Evidence (new information) and decide whether it requires updating the Current State.

The system maintains:
- **Evidence**: Immutable source material (always preserved)
- **Current State**: Small, maintained understanding we rely on as truth
- **Reviews**: Human decision surfaces when State might be wrong/stale/incomplete

You must recommend whether a Review is needed and what changes (if any) to propose.

## Current State (maintained understanding)

{self._format_state_items(states)}

## Open Reviews (pending human decisions)

{self._format_open_reviews(reviews)}

## New Evidence

ID: {evidence.get('id')}
Content: {evidence.get('content')}

## Your Task

Analyze the Evidence against Current State and open Reviews.

Include grouping_reason ONLY when a recommendation groups multiple affected State items or multiple proposed changes. Omit grouping_reason for a single-item/single-change recommendation.

Respond ONLY with JSON in this structure:
{{
  "summary": "Brief assessment of whether/how Evidence affects State",
  "topics": ["topic1", "topic2"],
  "outcome": "no_review" | "review_recommended",
  "no_review_explanation": "Why no review needed (if outcome='no_review')",
  "review_recommendations": [
    {{
      "review_action": "create" | "update_existing",
      "existing_review_id": "review_...",  // only if update_existing
      "review_type": "proposed_update" | "state_at_risk" | "missing_understanding",
      "decision_question": "What decision must a human make?",
      "why_consequential": "Why does this matter?",
      "affected_state_item_ids": ["state_01", "state_02"],
      "grouping_reason": "Why these items/changes belong in one decision",  // include only when grouping 2+ affected items or 2+ proposed changes
      "proposed_changes": [
        {{
          "operation": "create" | "update" | "retire",
          "state_item_id": "state_01",  // required for update/retire; omit for create
          "expected_version": 1,  // required for update/retire; omit for create
          "proposed_statement": "New or updated statement",  // required for create/update; omit for retire
          "rationale": "Why this change makes sense given Evidence",
          "effective_date": "YYYY-MM-DD"  // optional
        }}
      ]
    }}
  ]
}}

Remember:
- Evidence alone does not change State (only humans can authorize)
- You can recommend Reviews without proposals (state_at_risk)
- Proposals must reference State items in affected_state_item_ids

- effective_date is optional. Include it ONLY when the Evidence establishes a specific complete calendar date. It must be ISO YYYY-MM-DD. If timing is immediate, upon approval/decision, vague, relative, partial, or unknown, OMIT effective_date. Never emit sentinel or placeholder values such as "upon_decision", "immediately", "now", "TBD", or partial dates such as "2026-10".
- Include grouping_reason only for recommendations that group 2+ affected State items or 2+ proposed changes; otherwise omit it
- Be conservative: if unsure, recommend a Review
"""
        return prompt

    def _format_state_items(self, states: dict[str, str]) -> str:
        """Format State items for prompt."""
        if not states:
            return "(No active State items)"
        lines = []
        for state_id, statement in sorted(states.items()):
            lines.append(f"- **{state_id}**: {statement}")
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
