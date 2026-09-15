"""Targeted resilience for long Baseline Setup interpretation calls.

Baseline Setup already keeps the original Evidence immutable and interprets large
sources in bounded chunks. This module adds one more guard: if Claude still
exhausts the structured-output token budget for an individual chunk, retry only
that chunk as smaller pieces and merge the validated payloads. Nothing here
changes Current State directly; the normal Review path remains authoritative.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Mapping

logger = logging.getLogger("state.baseline.resilience")

_INSTALLED = False
_MIN_RETRY_CHARS = 600
_MAX_RETRY_DEPTH = 3


def _is_token_exhaustion(error: BaseException) -> bool:
    text = str(error).casefold()
    return "max_tokens" in text or "max tokens" in text


def _split_retry_text(text: str, split_fn: Callable[..., list[str]]) -> list[str]:
    clean = (text or "").strip()
    if len(clean) <= _MIN_RETRY_CHARS:
        return [clean]

    target = max(_MIN_RETRY_CHARS, min(1200, len(clean) // 2))
    pieces = [part for part in split_fn(clean, max_chars=target) if part.strip()]
    if len(pieces) >= 2:
        return pieces

    # Mechanical last resort when a single dense paragraph has no useful
    # paragraph/sentence boundary for the normal splitter.
    midpoint = len(clean) // 2
    left_break = clean.rfind(" ", 0, midpoint)
    right_break = clean.find(" ", midpoint)
    cut = left_break if left_break >= _MIN_RETRY_CHARS // 2 else right_break
    if cut <= 0 or cut >= len(clean):
        cut = midpoint
    return [clean[:cut].strip(), clean[cut:].strip()]


def _retry_interpret(
    call: Callable[[Mapping[str, Any]], Mapping[str, Any]],
    evidence: Mapping[str, Any],
    *,
    split_fn: Callable[..., list[str]],
    merge_fn: Callable[[list[Mapping[str, Any]]], Mapping[str, Any]],
    depth: int = 0,
) -> Mapping[str, Any]:
    try:
        return call(evidence)
    except RuntimeError as error:
        text = str(evidence.get("content") or "")
        if not _is_token_exhaustion(error) or depth >= _MAX_RETRY_DEPTH or len(text.strip()) <= _MIN_RETRY_CHARS:
            raise

        pieces = _split_retry_text(text, split_fn)
        if len(pieces) < 2:
            raise

        logger.warning(
            "baseline_chunk_retry reason=max_tokens depth=%s chars=%s retry_pieces=%s",
            depth,
            len(text),
            len(pieces),
        )
        payloads: list[Mapping[str, Any]] = []
        for index, piece in enumerate(pieces, start=1):
            child = dict(evidence)
            child["content"] = piece
            child["_state_retry_piece"] = index
            child["_state_retry_piece_count"] = len(pieces)
            payloads.append(
                _retry_interpret(
                    call,
                    child,
                    split_fn=split_fn,
                    merge_fn=merge_fn,
                    depth=depth + 1,
                )
            )
        return merge_fn(payloads)


def install_baseline_resilience() -> None:
    """Patch the Anthropic base adapter before Baseline providers are created."""
    global _INSTALLED
    if _INSTALLED:
        return

    import anthropic_provider
    from baseline_setup import is_baseline_setup, merge_interpretation_payloads, split_evidence_text

    original_interpret = anthropic_provider.AnthropicProvider.interpret

    def resilient_interpret(self, *, context, evidence, connection=None):
        if connection is None or not is_baseline_setup(connection):
            return original_interpret(self, context=context, evidence=evidence, connection=connection)

        def call(piece: Mapping[str, Any]) -> Mapping[str, Any]:
            return original_interpret(self, context=context, evidence=piece, connection=connection)

        return _retry_interpret(
            call,
            evidence,
            split_fn=split_evidence_text,
            merge_fn=merge_interpretation_payloads,
        )

    anthropic_provider.AnthropicProvider.interpret = resilient_interpret
    _INSTALLED = True
