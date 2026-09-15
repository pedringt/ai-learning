"""Targeted omission-detection safeguard for State.

This module deliberately runs as a separate pass over successful ``no_review``
interpretations. It does not lower the primary consequentiality threshold and it
does not mutate Current State directly. When the detector finds a concrete
omission, the result is routed back through State's ordinary interpretation
persistence so the user receives a normal Review and remains the authority.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
import random
import re
from typing import Any, Callable, Iterable, Mapping


_SIGNAL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("decision", re.compile(r"\b(approved|decided|decision|agreed|committed|cancelled|canceled)\b", re.I)),
    ("ownership", re.compile(r"\b(owner|ownership|responsible|assigned|handoff)\b", re.I)),
    ("scope", re.compile(r"\b(scope|requirement|required|must|will not|won't|out of scope)\b", re.I)),
    ("risk", re.compile(r"\b(risk|blocked|blocker|delay|delayed|slip|incident)\b", re.I)),
    ("launch", re.compile(r"\b(launch|release|rollout|ship|shipped|enabled|disabled|deadline)\b", re.I)),
    ("date", re.compile(r"\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b", re.I)),
    ("quantity", re.compile(r"(?:\$\s?\d[\d,]*(?:\.\d+)?)|(?:\b\d+(?:\.\d+)?\s?%\b)", re.I)),
)

_QUESTION_RESPONSE_PREFIX = "question_response:"


@dataclass(frozen=True)
class OmissionCandidate:
    evidence_id: str
    interpretation_record_id: str
    source_type: str
    content: str
    no_review_explanation: str
    consequence_score: int
    consequence_signals: tuple[str, ...]


@dataclass(frozen=True)
class OmissionCheckResult:
    evidence_id: str
    ran: bool
    detected: bool
    review_ids: tuple[str, ...] = ()
    reason: str = ""


def consequence_signals(content: str, source_type: str = "") -> tuple[str, ...]:
    """Return deterministic signals used only to prioritize a second pass.

    Signals are *not* treated as truth and never create a Review by themselves.
    They only decide which no-Review cases are worth spending another model call
    on. Question responses always qualify because the user explicitly supplied
    them to resolve an open unknown.
    """
    found = [name for name, pattern in _SIGNAL_PATTERNS if pattern.search(content or "")]
    if (source_type or "").startswith(_QUESTION_RESPONSE_PREFIX):
        found.append("question_response")
    return tuple(dict.fromkeys(found))


def consequence_score(content: str, source_type: str = "") -> int:
    signals = consequence_signals(content, source_type)
    score = len(signals)
    if "question_response" in signals:
        score += 2
    if len((content or "").strip()) >= 500:
        score += 1
    return score


def should_check(content: str, source_type: str = "", *, minimum_score: int = 1) -> bool:
    return consequence_score(content, source_type) >= minimum_score


def _safe_json(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, Mapping) else {}


def list_candidates(connection: Any, *, minimum_score: int = 1, limit: int = 100) -> list[OmissionCandidate]:
    """Find project-scoped, primary no-Review interpretations worth checking.

    The newest successful primary interpretation wins per Evidence item. Any
    record created by this safeguard (provider name contains ``omission-check``)
    is ignored so the safeguard cannot recursively audit itself.
    """
    from db import project_id_of

    rows = connection.execute(
        "SELECT ir.id AS interpretation_record_id, ir.structured_result, ir.provider, ir.created_at, "
        "e.id AS evidence_id, e.content, e.source_type "
        "FROM interpretation_records ir JOIN evidence e ON e.id=ir.evidence_id "
        "WHERE ir.processing_status='succeeded' AND e.project_id=? "
        "ORDER BY ir.created_at DESC, ir.id DESC",
        (project_id_of(connection),),
    ).fetchall()

    checked = {
        row["evidence_id"]
        for row in rows
        if "omission-check" in str(row.get("provider") or "")
    }
    seen: set[str] = set()
    candidates: list[OmissionCandidate] = []
    for row in rows:
        evidence_id = row["evidence_id"]
        if evidence_id in checked or evidence_id in seen:
            continue
        if "omission-check" in str(row.get("provider") or ""):
            continue
        seen.add(evidence_id)
        payload = _safe_json(row["structured_result"])
        if payload.get("outcome") != "no_review":
            continue
        content = str(row["content"] or "")
        source_type = str(row["source_type"] or "")
        score = consequence_score(content, source_type)
        if score < minimum_score:
            continue
        candidates.append(
            OmissionCandidate(
                evidence_id=evidence_id,
                interpretation_record_id=row["interpretation_record_id"],
                source_type=source_type,
                content=content,
                no_review_explanation=str(payload.get("no_review_explanation") or payload.get("summary") or ""),
                consequence_score=score,
                consequence_signals=consequence_signals(content, source_type),
            )
        )

    candidates.sort(key=lambda item: (-item.consequence_score, item.evidence_id))
    return candidates[: max(0, limit)]


def select_batch(
    candidates: Iterable[OmissionCandidate],
    *,
    max_checks: int = 5,
    seed: int | None = None,
) -> list[OmissionCandidate]:
    """Bound cost while keeping selection reproducible for eval/debug runs."""
    pool = list(candidates)
    if len(pool) <= max_checks:
        return pool
    by_score: dict[int, list[OmissionCandidate]] = {}
    for candidate in pool:
        by_score.setdefault(candidate.consequence_score, []).append(candidate)
    rng = random.Random(seed)
    selected: list[OmissionCandidate] = []
    for score in sorted(by_score, reverse=True):
        group = by_score[score]
        rng.shuffle(group)
        selected.extend(group[: max(0, max_checks - len(selected))])
        if len(selected) >= max_checks:
            break
    return selected


def build_prompt(connection: Any, candidate: OmissionCandidate) -> str:
    """Build a focused second-pass prompt from the current project context."""
    from db import project_id_of

    pid = project_id_of(connection)
    state_rows = connection.execute(
        "SELECT id, topic, statement FROM current_state_items WHERE status='active' AND project_id=? ORDER BY topic, id",
        (pid,),
    ).fetchall()
    question_rows = connection.execute(
        "SELECT id, text FROM questions WHERE status='open' AND project_id=? ORDER BY created_at, id",
        (pid,),
    ).fetchall()
    review_rows = connection.execute(
        "SELECT id, review_type, decision_question FROM review_issues WHERE status='open' AND project_id=? ORDER BY created_at, id",
        (pid,),
    ).fetchall()
    rule_rows = connection.execute(
        "SELECT statement FROM project_rules WHERE status='active' AND project_id=? ORDER BY created_at, id",
        (pid,),
    ).fetchall()

    def lines(rows: Iterable[Any], formatter: Callable[[Any], str]) -> str:
        values = [formatter(row) for row in rows]
        return "\n".join(values) if values else "(none)"

    return f"""You are performing a SECOND, targeted completeness check for State.

The primary interpretation already concluded that the Evidence needed no Review.
Do not simply become more conservative and do not create work because details are missing.
Your only job is to catch a CONCRETE consequential fact, change, risk, decision, ownership change,
requirement, or answer that is plainly present in the Evidence but absent from the maintained context.

If the first pass was reasonable, return outcome=no_review with no recommendations.
If you find a real omission, return the normal State structured interpretation for only that omitted item.
A detected omission is only a proposal for normal human Review. It is not authorized Current State.
Never invent facts, dates, certainty, State IDs, Review IDs, or Questions.

CURRENT STATE
{lines(state_rows, lambda r: f'- {r["id"]} ({r["topic"]}): {r["statement"]}')}

OPEN QUESTIONS
{lines(question_rows, lambda r: f'- {r["id"]}: {r["text"]}')}

OPEN REVIEWS
{lines(review_rows, lambda r: f'- {r["id"]} ({r["review_type"]}): {r["decision_question"]}')}

PROJECT RULES
{lines(rule_rows, lambda r: f'- {r["statement"]}')}

PRIMARY NO-REVIEW EXPLANATION
{candidate.no_review_explanation or '(none)'}

EVIDENCE
{candidate.content}

Return the same structured interpretation JSON schema used by State's normal interpretation provider.
"""


def _parse_provider_response(text: str) -> Mapping[str, Any]:
    from provider_json import extract_json_object
    parsed = extract_json_object(text)
    if not isinstance(parsed, Mapping):
        raise ValueError("Omission detector returned a non-object JSON value")
    return parsed


def call_detector(connection: Any, candidate: OmissionCandidate, provider: Any) -> Mapping[str, Any]:
    """Run the dedicated second-pass model call without changing primary prompts."""
    if hasattr(provider, "detect_omissions"):
        return provider.detect_omissions(connection=connection, candidate=candidate)

    prompt = build_prompt(connection, candidate)
    if getattr(provider, "name", "") == "anthropic":
        from provider_output_schema import PROVIDER_OUTPUT_SCHEMA
        message = provider.client.messages.create(
            model=provider.model_identifier,
            max_tokens=getattr(provider, "max_tokens", 2000),
            output_config={"format": {"type": "json_schema", "schema": PROVIDER_OUTPUT_SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((getattr(block, "text", None) for block in message.content if getattr(block, "text", None)), None)
        if not text:
            raise RuntimeError("Anthropic omission check returned no text")
        return _parse_provider_response(text)

    if getattr(provider, "name", "") == "openai":
        response = provider.client.chat.completions.create(
            model=provider.model_identifier,
            max_tokens=2000,
            temperature=getattr(provider, "temperature", 0),
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content
        if not text:
            raise RuntimeError("OpenAI omission check returned no text")
        return _parse_provider_response(text)

    raise TypeError("Provider must implement detect_omissions() or be State's anthropic/openai provider")


class _DetectedPayloadProvider:
    """Feed a detector payload through the ordinary validated Review pipeline."""
    def __init__(self, base_provider: Any, payload: Mapping[str, Any]):
        self.name = f"{getattr(base_provider, 'name', 'provider')}-omission-check"
        self.model_identifier = getattr(base_provider, "model_identifier", "unknown")
        self._payload = payload

    def interpret(self, *, context: Any, evidence: Mapping[str, Any], connection: Any = None) -> Mapping[str, Any]:
        return self._payload


def run_check(connection: Any, candidate: OmissionCandidate, provider: Any) -> OmissionCheckResult:
    """Detect one possible omission and surface it only through normal Review."""
    payload = call_detector(connection, candidate, provider)

    # Route both positive and negative detector results through the ordinary
    # pipeline. This gives the safeguard its own durable interpretation record
    # (provider name includes omission-check), prevents repeated re-checks of
    # the same primary no-Review result, and keeps all normal validation in force.
    from interpretation_pipeline_integrated import process_evidence
    result = process_evidence(
        connection,
        evidence_id=candidate.evidence_id,
        provider=_DetectedPayloadProvider(provider, payload),
    )
    if result.processing_status != "succeeded":
        return OmissionCheckResult(candidate.evidence_id, True, False, reason="detector payload failed normal validation")
    return OmissionCheckResult(
        candidate.evidence_id,
        True,
        bool(result.review_ids),
        tuple(result.review_ids),
        reason=(
            "possible omission surfaced for normal human Review"
            if result.review_ids
            else "second pass found no concrete omission"
        ),
    )


def run_batch(connection: Any, provider: Any, *, max_checks: int = 5, minimum_score: int = 1, seed: int | None = None) -> list[OmissionCheckResult]:
    candidates = select_batch(list_candidates(connection, minimum_score=minimum_score), max_checks=max_checks, seed=seed)
    return [run_check(connection, candidate, provider) for candidate in candidates]


def main() -> int:
    """Operator-run safeguard. Kept separate from latency-sensitive intake."""
    from db import connect
    from anthropic_provider import AnthropicProvider
    from openai_provider import OpenAIProvider

    database_url = os.getenv("DATABASE_URL") or os.getenv("STATE_DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    provider_name = os.getenv("STATE_PROVIDER", "anthropic").strip().lower()
    provider = OpenAIProvider() if provider_name == "openai" else AnthropicProvider()
    maximum = int(os.getenv("OMISSION_CHECK_MAX", "5"))
    minimum = int(os.getenv("OMISSION_CHECK_MIN_SCORE", "1"))
    with connect(database_url) as connection:
        results = run_batch(connection, provider, max_checks=maximum, minimum_score=minimum)
    for result in results:
        print(json.dumps(result.__dict__, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
