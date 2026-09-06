"""Provider-neutral model adapter for State Ask."""
from __future__ import annotations

import json
import re
from typing import Any, Iterator, Mapping

from ask_contract import ANSWER_JSON_SCHEMA, ONE_CALL_ASK_JSON_SCHEMA, SELECTOR_JSON_SCHEMA


# Ask returns both a grounded selection and a user-facing answer in one structured
# response. Live staging QA showed 1650 and 1800 can truncate valid structured
# responses. 2400 is headroom, not a target: concise answers still stop naturally.
ASK_ONE_CALL_MAX_TOKENS = 2400
# Ask is interactive. The Anthropic SDK defaults to two retries, which can turn a
# transient 30-second timeout into a ~70-second user wait. Evidence interpretation
# keeps the provider's normal retry behavior; Ask uses a single bounded attempt.
ASK_TIMEOUT_SECONDS = 30.0
ASK_MAX_RETRIES = 0


_RELEVANCE_GUARD = """\
CRITICAL RELEVANCE CHECK — apply before answering:
- The newest user request is the primary task. Previous-answer text is context only when the new request explicitly depends on it.
- A record being related to a word in the request does not mean it answers the request.
- For specific lookups (person/contact, owner, date/deadline, budget, count/percentage, vendor, location, phone/email/address), answer only when a supplied record actually establishes the requested value.
- A record about billing scope does not establish a billing contact. A record about routing does not establish a contact person. A record about launch planning does not establish a launch date. A record about cost concerns does not establish a budget.
- If the supplied records do not directly support the requested value, say that State does not have enough confirmed information to answer. Do not substitute adjacent project context just because it is available.
- If only part of the request is supported, answer the supported part and state what remains unknown.
- Grounded is not the same as relevant: omit records that do not help answer the actual question.
"""

_STOP_WORDS = {
    "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "me", "my", "we", "our",
    "this", "that", "what", "which", "who", "when", "where", "why", "how", "is", "are", "be",
    "with", "about", "do", "does", "did", "have", "has", "had", "can", "could", "would", "should",
    "please", "tell", "give", "show", "other", "else", "current", "project", "state",
}

_BROAD_HINTS = (
    "catch me up", "what should i know", "meeting brief", "meeting prep", "prepare me", "what changed",
    "what needs my attention", "what is unresolved", "what's unresolved", "still unresolved", "open items",
    "project update", "status update", "summarize the project", "summary of the project",
)

_DEPENDENT_HINTS = (
    "source supports that", "sources support that", "what source supports that", "where did that come from",
    "where did you get that", "how do you know", "how do you know that", "why is that", "why does that",
    "tell me more about that", "expand on that", "more about that", "what do you mean by that",
    "what about that", "and that", "those items", "those points", "that source", "that review",
    "that question", "that item", "that decision", "that change",
)

_TRANSFORM_HINTS = (
    "shorten", "shorter", "concise", "condense", "3 bullets", "three bullets", "focus only on blockers",
    "turn it into an agenda", "agenda format", "leadership-ready", "leadership ready", "exec-ready",
    "executive summary", "make it more detailed", "more detail", "expand this", "go deeper",
)

_LOOKUP_ANCHORS = {
    "contact", "owner", "budget", "date", "deadline", "phone", "email", "address", "percent", "percentage",
    "count", "number", "vendor", "location", "office", "person", "name",
}


def _parse_json(text: str) -> Mapping[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def _normalize_token(token: str) -> str:
    token = token.lower().strip()
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _query_terms(query: str) -> set[str]:
    return {
        _normalize_token(token)
        for token in re.findall(r"[a-z0-9]+", query.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    }


def _extract_user_request(prompt: str) -> str:
    match = re.search(r"^User request:\s*(.+)$", prompt, re.MULTILINE)
    return match.group(1).strip() if match else ""


def _is_broad_request(query: str) -> bool:
    q = " ".join(query.lower().split())
    return any(hint in q for hint in _BROAD_HINTS)


def _is_dependent_followup(query: str) -> bool:
    q = " ".join(query.lower().split())
    if q in {"why", "how", "who else", "what else", "which ones", "which one"}:
        return True
    if any(hint in q for hint in _DEPENDENT_HINTS):
        return True
    # Short pronoun-heavy prompts usually refer to the immediately preceding
    # answer. Longer prompts such as "what other contacts do I have?" are not
    # treated as dependent merely because they contain generic words.
    words = q.split()
    return len(words) <= 5 and bool(re.search(r"\b(it|that|those|them|this|these)\b", q))


def _is_transform_request(query: str) -> bool:
    q = " ".join(query.lower().split())
    return any(hint in q for hint in _TRANSFORM_HINTS)


def _record_text(record: Mapping[str, Any]) -> str:
    parts: list[str] = []
    for key, value in record.items():
        if key in {"authority", "id", "state_item_id", "evidence_ids", "affected_state_ids", "question_ids"}:
            continue
        if isinstance(value, (str, int, float)):
            parts.append(str(value))
    return " ".join(parts).lower()


def _filter_candidate_payload(query: str, payload: Mapping[str, Any]) -> dict[str, Any]:
    """Drop obvious bystanders only for explicit attribute lookups.

    This is a final safety gate, not the primary retriever. Broad prompts,
    dependent follow-ups, transformations, and semantically phrased lookups such
    as "who leads the pilot?" keep the bounded retriever output so the model can
    match synonyms. Explicit attribute lookups such as "billing contact" or
    "pilot budget" get the stricter lexical guard that prevents nearby-but-not-
    answering records from masquerading as the answer. Rules are always kept.
    """
    data = {key: list(value) if isinstance(value, list) else value for key, value in payload.items()}
    if _is_broad_request(query) or _is_dependent_followup(query) or _is_transform_request(query):
        return data

    terms = _query_terms(query)
    if not terms:
        return data

    normalized_query = {_normalize_token(term) for term in terms}
    anchor_terms = normalized_query & _LOOKUP_ANCHORS
    if not anchor_terms:
        return data

    for bucket in ("state", "reviews", "questions", "history", "evidence"):
        records = data.get(bucket)
        if not isinstance(records, list):
            continue
        kept = []
        for record in records:
            if not isinstance(record, Mapping):
                continue
            body_tokens = {_normalize_token(token) for token in re.findall(r"[a-z0-9]+", _record_text(record))}
            overlap = normalized_query & body_tokens
            if not overlap:
                continue
            # Explicit attribute lookups must mention the requested attribute,
            # not merely a neighboring topic word.
            if not (anchor_terms & body_tokens):
                continue
            kept.append(dict(record))
        data[bucket] = kept
    return data


def _replace_json_after_label(prompt: str, label: str, transform) -> str:
    marker = f"{label}:\n"
    marker_index = prompt.find(marker)
    if marker_index < 0:
        return prompt
    json_start = marker_index + len(marker)
    tail = prompt[json_start:]
    leading = len(tail) - len(tail.lstrip())
    json_start += leading
    try:
        payload, consumed = json.JSONDecoder().raw_decode(prompt[json_start:])
    except (json.JSONDecodeError, TypeError):
        return prompt
    replacement = json.dumps(transform(payload), ensure_ascii=False)
    return prompt[:json_start] + replacement + prompt[json_start + consumed:]


def _remove_previous_answer_for_topic_shift(prompt: str, query: str) -> str:
    if _is_dependent_followup(query) or _is_transform_request(query):
        return prompt
    # Both one-call and synthesis prompts use this exact field label. A fresh
    # question should not inherit the prior answer's framing by default.
    pattern = r"(Previous answer(?: \(for refinement only\))?:\s*)(.*?)(\n\n(?:Authority-tagged candidate records|Candidate records|Selected validated context):)"
    return re.sub(pattern, r"\1null\3", prompt, count=1, flags=re.DOTALL)


def _harden_prompt_for_relevance(prompt: str) -> str:
    query = _extract_user_request(prompt)
    if not query:
        return _RELEVANCE_GUARD + "\n" + prompt

    hardened = _remove_previous_answer_for_topic_shift(prompt, query)
    hardened = _replace_json_after_label(
        hardened,
        "Authority-tagged candidate records",
        lambda payload: _filter_candidate_payload(query, payload) if isinstance(payload, Mapping) else payload,
    )
    hardened = _replace_json_after_label(
        hardened,
        "Candidate records",
        lambda payload: _filter_candidate_payload(query, payload) if isinstance(payload, Mapping) else payload,
    )
    return _RELEVANCE_GUARD + "\n" + hardened


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
        return self._call(_harden_prompt_for_relevance(prompt), ONE_CALL_ASK_JSON_SCHEMA, max_tokens=ASK_ONE_CALL_MAX_TOKENS)

    def stream(self, prompt: str) -> Iterator[str]:
        """Stream the one-call Ask JSON text as the model generates it."""
        prompt = _harden_prompt_for_relevance(prompt)
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
        return self._call(_harden_prompt_for_relevance(prompt), SELECTOR_JSON_SCHEMA, max_tokens=900)

    def synthesize(self, prompt: str) -> Mapping[str, Any]:
        return self._call(_harden_prompt_for_relevance(prompt), ANSWER_JSON_SCHEMA, max_tokens=1800)

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
