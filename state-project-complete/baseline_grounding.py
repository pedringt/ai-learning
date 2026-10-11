"""Keep Baseline facts from adding specifics their source never states (#240).

A routine Baseline fact can become Current State in one batch confirmation, so a
person never compares it with its source one by one. The real model has twice
written a year into a fact whose source gives the date without one ("March 6"
became "March 6, 2025"). The invented year reads naturally and is invisible in a
batch.

This is a deterministic check, not a correction. Software does not rewrite the
model's wording (deleting a year can break the sentence, and deciding what the
fact "really" says is interpretation). It only decides where the fact goes: a
proposal whose year or currency amount does not appear in its source Evidence is
not routine, so its Review leaves the batch draft and waits for an individual
human decision, where the person sees the statement next to its Evidence and can
correct, accept or reject it. AI interprets -> software enforces -> people
authorize (DEC-001).

Checked: years (1900-2099) and currency amounts ($, EUR, GBP signs, with k/m/bn
or thousand/million/billion suffixes) in the AI-written statement and topic of
each pending create proposal. A year counts as stated if the source has it, or a
two-digit form of it ("'26", "FY26"). An amount counts as stated if the source
has the same number in any form ("$180k", "180,000", "180000 dollars").

Not checked: relative or derived dates ("next quarter"), weekdays, other numbers.
A false flag costs one individual Review; a missed one is today's behavior.
"""
from __future__ import annotations

import re
from typing import Any, Iterable, Mapping

_YEAR = re.compile(r"(?<![\d$€£.,])((?:19|20)\d{2})(?![\d])(?!,\d{3})")
_SUFFIX = r"(?:\s?(k|m|bn|b|thousand|million|billion)\b)?"
_MONEY = re.compile(r"[$€£]\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?" + _SUFFIX, re.IGNORECASE)
_NUMBER = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?" + _SUFFIX, re.IGNORECASE)
_MULTIPLIER = {
    "k": 1_000, "thousand": 1_000,
    "m": 1_000_000, "million": 1_000_000,
    "b": 1_000_000_000, "bn": 1_000_000_000, "billion": 1_000_000_000,
}


def _value(whole: str, fraction: str | None, suffix: str | None) -> float:
    number = float(f"{whole.replace(',', '')}.{fraction or '0'}")
    return round(number * _MULTIPLIER.get((suffix or "").lower(), 1), 2)


def _year_is_stated(year: str, source: str) -> bool:
    if re.search(rf"(?<!\d){year}(?!\d)", source):
        return True
    short = year[2:]
    return bool(re.search(rf"(?:['’]|\b(?:FY|CY)\s?-?){short}(?!\d)", source, re.IGNORECASE))


def unsupported_specifics(text: str, source: str) -> list[str]:
    """Years and currency amounts in `text` that `source` does not state, in order of appearance."""
    text = text or ""
    source = source or ""
    found: list[str] = []
    source_values = {_value(m.group(1), m.group(2), m.group(3)) for m in _NUMBER.finditer(source)}
    for match in _MONEY.finditer(text):
        if _value(match.group(1), match.group(2), match.group(3)) not in source_values:
            found.append(match.group(0).strip())
    for match in _YEAR.finditer(text):
        if not _year_is_stated(match.group(1), source):
            found.append(match.group(1))
    return list(dict.fromkeys(found))


def _ai_written_texts(proposal: Mapping[str, Any]) -> Iterable[str]:
    # A person's adjusted wording is their own authority, so only the model's text is checked.
    if not (proposal.get("adjusted_statement") or "").strip():
        yield str(proposal.get("proposed_statement") or "")
    yield str(proposal.get("proposed_topic") or "")


def review_unsupported_specifics(review: Mapping[str, Any]) -> list[str]:
    """Unstated years/amounts across a Review's pending create proposals (list_reviews read model)."""
    sources = [str(e.get("content") or "") for e in (review.get("evidence_items") or [])]
    if not sources and review.get("evidence_content"):
        sources = [str(review["evidence_content"])]
    source = "\n\n".join(sources)
    found: list[str] = []
    for proposal in review.get("proposals") or []:
        if proposal.get("status") != "pending" or proposal.get("operation") != "create":
            continue
        for text in _ai_written_texts(proposal):
            found.extend(unsupported_specifics(text, source))
    return list(dict.fromkeys(found))


def unsupported_specifics_reason(specifics: list[str]) -> str:
    listed = ", ".join(specifics)
    noun = "detail" if len(specifics) == 1 else "details"
    return (
        f"Includes {listed}, which the source does not state. "
        f"Check the {noun} against the Evidence before this becomes Current State."
    )
