"""Anthropic provider adapter for State interpretation.

This adapter wraps the Anthropic Claude API, sending structured context
and receiving structured interpretation recommendations.

The adapter is intentionally thin: it formats context, calls the API, and
returns structured JSON. Application-owned validation enforces the contract.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Mapping

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.semantic_validation import InterpretationContextSnapshot
from provider_output_schema import PROVIDER_OUTPUT_SCHEMA
from provider_json import extract_json_object

_RELEVANCE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["relevant", "summary"],
    "properties": {
        "relevant": {"type": "boolean"},
        "summary": {"type": "string"},
    },
}


logger = logging.getLogger("state.provider.anthropic")

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
        logger.info(
            "provider_start provider=anthropic model=%s prompt_chars=%s prompt_ms=%.0f max_tokens=%s timeout_s=%s",
            self.model_identifier, len(prompt), prompt_ms, self.max_tokens, self.timeout_seconds,
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
        logger.info(
            "provider_done provider=anthropic model=%s elapsed_ms=%.0f input_tokens=%s output_tokens=%s stop_reason=%s",
            self.model_identifier, elapsed_ms, input_tokens, output_tokens, stop_reason,
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

    def classify_slack_relevance(self, conversation_text: str) -> Mapping[str, Any]:
        """Bounded relevance check for a Slack conversation checkpoint.

        Deliberately separate from interpret(): this decides whether a
        conversation is worth turning into Evidence at all, before any
        Evidence exists to interpret against State/Reviews. See
        slack_relevance_service.py, the only caller.
        """
        prompt = (
            "You are helping a project-knowledge tool called State decide whether a Slack "
            "conversation contains information worth remembering as project Evidence.\n\n"
            "Flag it as relevant only if it contains one or more of: a decision or change, "
            "a requirement or constraint, a risk or blocker, an answer to an open question, "
            "an important correction, a change in ownership or authority, a rollout/readiness "
            "change, or an unresolved contradiction that matters to the project.\n\n"
            "Casual conversation, scheduling chatter, acknowledgements, and social discussion "
            "are NOT relevant. When genuinely unsure, prefer relevant=true -- missing "
            "consequential project information is worse than a small amount of extra Evidence.\n\n"
            f'Conversation:\n"""\n{conversation_text}\n"""\n\n'
            'Respond with a JSON object: {"relevant": true or false, "summary": '
            '"a one or two sentence standalone statement of what the conversation established, '
            'written so it makes sense without the original messages. Empty string if not relevant."}'
        )
        message = self.client.messages.create(
            model=self.model_identifier,
            max_tokens=300,
            output_config={"format": {"type": "json_schema", "schema": _RELEVANCE_SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
        text_blocks = [getattr(block, "text", None) for block in message.content]
        response_text = next((text for text in text_blocks if text), None)
        if not response_text:
            return {"relevant": False, "summary": ""}
        try:
            parsed = extract_json_object(response_text)
        except json.JSONDecodeError:
            logger.warning("Slack relevance classification returned non-JSON response; treating as not relevant.")
            return {"relevant": False, "summary": ""}
        return {"relevant": bool(parsed.get("relevant")), "summary": str(parsed.get("summary") or "")}

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

        questions = {}
        for row in connection.execute(
            "SELECT id, text, blocking, blocks FROM questions WHERE status='open' ORDER BY created_at, id"
        ).fetchall():
            questions[row[0]] = {
                "text": row[1],
                "blocking": bool(row[2]),
                "blocks": row[3],
            }

        rules = []
        try:
            rule_rows = connection.execute(
                "SELECT statement, COALESCE(rationale, 'Interpretation') FROM project_rules WHERE status='active' ORDER BY created_at, id"
            ).fetchall()
        except Exception:
            rule_rows = []
        for row in rule_rows:
            rules.append({"text": row[0], "category": row[1]})

        rules_prompt = '' if not rules else '<project_rules>\n' + chr(10).join(f"- [{r['category']}] {r['text']}" for r in rules) + '\n</project_rules>\n\n'

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

<open_questions>
{self._format_open_questions(questions)}
</open_questions>

{rules_prompt}{self._format_evidence_with_question_context(evidence)}

<instructions>
Compare the Evidence with Current State and open Reviews. Return the semantic interpretation in the supplied JSON schema.

- If Evidence does not materially change, threaten, or fill maintained understanding, return no recommendations and explain briefly.
- proposed_update: use when Evidence changes or retires existing State. update/retire must use an exact State ID shown above. A grouped proposed_update may also create new State.
- missing_understanding: use for information not represented in Current State. Its proposals must be create operations only. Create proposals have no state_item_id.
- state_at_risk: use when Evidence makes existing State uncertain without establishing a replacement; normally emit no proposal.
- Set existing_review_id only when an open Review above is clearly the same pending human decision; use its exact Review ID. Otherwise omit it so software creates a new Review.
- resolves_question_ids: include an exact open Question ID only when this Evidence concretely answers it and accepting the Review would establish that answer. Scoped Question responses should be interpreted against the shown Question, but source UI alone is never sufficient. Notes may answer Questions indirectly.
- Blocking is application-owned dependency metadata; never infer it from urgency or missing detail.
- For update/retire, output the exact existing state_item_id. Software supplies expected_version and ensures that target is affected.
- effective_date is optional. Include only a complete date explicitly established by Evidence, as YYYY-MM-DD. Omit relative, partial, immediate, approval-dependent, or unknown timing.
- grouping_reason is optional only when one Review genuinely groups multiple affected State items or multiple changes.
- Never invent State IDs, Review IDs, dates, facts, or certainty.
- Keep summary, questions, reasons, and rationales concise: one sentence each, usually under 25 words. Use at most 3 topics unless clearly necessary.
- Preserve epistemic status: approved != implemented/enabled/complete; planned != committed; capable != enabled.
- Do not create speculative residue. Missing implementation details alone are not a Review; Reviews are for consequential change/risk to maintained State.
- If Evidence establishes a narrow consequential fact, propose only that narrow fact. Do not widen scope beyond the Evidence.
- Example: “Password reset tickets were approved for automation.” If that approval is not already Current State, propose the narrow fact “Password reset tickets are approved for automation.” Do not infer implementation, deployment, universal ticket coverage, or removal of human review.
- If uncertain whether maintained understanding may need human judgment, recommend a Review rather than silently changing State; uncertainty about non-consequential details should remain unmodeled rather than becoming urgent work.
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

    def _format_open_questions(self, questions: dict[str, dict]) -> str:
        if not questions:
            return "(No open Questions)"
        lines = []
        for question_id, details in sorted(questions.items()):
            dependency = f"; blocks: {details['blocks']}" if details.get("blocking") and details.get("blocks") else ""
            lines.append(f"- {question_id}: {details['text']}{dependency}")
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

    def _format_evidence_with_question_context(self, evidence: Mapping[str, Any]) -> str:
        """Format evidence with optional Question-response context."""
        lines = []
        lines.append(f'<evidence id="{evidence.get("id")}">')
        lines.append(evidence.get("content", ""))
        lines.append("</evidence>")
        
        # If this evidence was explicitly submitted as a Question response, provide context
        question_context = evidence.get("response_to_question")
        if question_context:
            lines.append("")
            lines.append("<question_response_context>")
            lines.append(f"This Evidence was explicitly submitted as the user's answer to this Question:")
            lines.append(f"- Question ID: {question_context['question_id']}")
            lines.append(f"- Question: {question_context['question_text']}")
            if question_context.get("is_blocking"):
                lines.append(f"- Status: Blocking (depends: {question_context['blocks']})")
            lines.append("Interpret terse wording against this Question. Include its ID in resolves_question_ids only when the Evidence concretely answers it.")
            lines.append("</question_response_context>")
        
        return "\n".join(lines)
