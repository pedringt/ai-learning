"""Claim-level authority for Ask (#567, design approved by Paige Nov 10).

Ask answers in claims. Each claim has one basis and, unless its basis is `none`, one primary record that sets its
authority. This module holds the application-side checks a claim (and a model-worded record card) must pass before
anyone sees it:

- Reference check (structural). The primary record must be among the records Ask selected for this request, of the
  type its basis names. The selected records come from project-scoped queries filtered by status (active Current
  State, open Reviews, open or resolved Questions), so a passing id is in this project, selected, the right type, and
  in the right status. Supporting references must also be selected records; they never change the label.
- Anchor check (a limited safeguard). Every number and month a claim names must appear in its records. It catches an
  invented figure or date. It does NOT check meaning: a figure attached to the wrong subject, swapped figures, a
  reversed negation, a wrong attribution or an added qualifier all pass. Counts written as words ("two Reviews") are
  not checked.

Neither check can tell whether one sentence mixes authority levels (an accepted fact and a proposal, say). That stays
with the prompt, the evals and human review.

A claim that fails is withheld; its text is never shown, with or without a chip. A model-worded record card (Current
State, History, Evidence) whose reference passes but whose anchors fail shows that record's own text instead. A card
whose reference fails is withheld, never replaced from that record.
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping

from ask_display import RECORD_LABELS

CLAIM_TEXT_LIMIT = 300
MAX_CLAIMS = 4
MAX_SUPPORTING = 2

# The record types a claim's primary record may have, per basis. `none` has no primary record.
BASIS_RECORD_TYPES: dict[str, tuple[str, ...]] = {
    "current_state": ("state",),
    "pending_review": ("review",),
    "evidence_says": ("evidence",),
    "open_question": ("question", "blocking_question"),
    "answered_question": ("answered_question",),
    "history": ("history",),
}

# Headlines are written by software, from the job (Paige, Nov 10): they never state a status, so they cannot
# contradict the claims under them. A wrong job gives a mismatched headline, never a status claim.
DEFAULT_HEADLINE = "What State has on record"
FIXED_HEADLINES: dict[str, str] = {
    "current_fact": DEFAULT_HEADLINE,
    "general_project_synthesis": DEFAULT_HEADLINE,
    "meeting_prep": "Meeting brief",
    "catch_up": "Catch-up",
    "project_update": "Project update",
    "why_or_provenance": "Sources and history",
    "attention_check": "What needs your attention",
    "historical": "Recorded changes",
    "drafting": "Draft from State's records",
}


def fixed_headline(job: str, previous_answer: Mapping[str, Any] | None = None) -> str:
    """The headline for a job. A refinement keeps the previous answer's headline, but only when it is one of these
    fixed headlines: the previous answer comes from the browser and is not trusted."""
    if job == "refinement":
        previous = (previous_answer or {}).get("headline")
        return previous if previous in FIXED_HEADLINES.values() else DEFAULT_HEADLINE
    return FIXED_HEADLINES.get(job, DEFAULT_HEADLINE)


def prepare_answer_raw(answer_raw: Any) -> tuple[Any, int]:
    """Bound a model (or browser-supplied previous) answer before strict validation; return it and how many claims
    were withheld on the way. Software owns the headline and the compatibility summary, so the raw ones are dropped.
    An older answer with a summary and no claims has that prose withheld: it was never checked claim by claim.
    Claims past the fourth, empty ones and ones over the length limit are withheld rather than failing the answer.
    Supporting references past the second are dropped (they never set the label)."""
    if not isinstance(answer_raw, Mapping):
        return answer_raw, 0
    data = {key: value for key, value in answer_raw.items() if key not in {"headline", "summary", "withheld_claims", "withheld_items"}}
    withheld = 0
    raw_claims = answer_raw.get("claims")
    if raw_claims is None:
        withheld += 1 if str(answer_raw.get("summary") or "").strip() else 0
        raw_claims = []
    claims: list[dict] = []
    for raw in raw_claims if isinstance(raw_claims, list) else []:
        if not isinstance(raw, Mapping):
            withheld += 1
            continue
        text = str(raw.get("text") or "").strip()
        if not text or len(text) > CLAIM_TEXT_LIMIT or len(claims) >= MAX_CLAIMS:
            withheld += 1
            continue
        supporting = raw.get("supporting_record_ids")
        claims.append({
            "text": text,
            "basis": raw.get("basis") or "none",
            "primary_record_id": raw.get("primary_record_id") or None,
            "supporting_record_ids": [x for x in (supporting if isinstance(supporting, list) else []) if isinstance(x, str)][:MAX_SUPPORTING],
        })
    data["claims"] = claims
    data["headline"] = DEFAULT_HEADLINE
    data["summary"] = ""
    return data, withheld


# --- anchors ------------------------------------------------------------------------------------------------

_MONTHS = {name: index for index, names in enumerate((
    ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"), ("may",), ("june", "jun"),
    ("july", "jul"), ("august", "aug"), ("september", "sep", "sept"), ("october", "oct"), ("november", "nov"),
    ("december", "dec"),
), start=1) for name in names}
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})")
# A number not inside a word or an id ("Q3", "k-12", "ask-state-0" are not numbers here): $40,000 / 40k / 25% / 3rd.
_NUMBER = re.compile(r"(?<![\w-])\$?(\d[\d,]*(?:\.\d+)?)(?:\s?([km])\b)?", re.I)
_WORD = re.compile(r"[a-z]+")


def _number_key(digits: str, suffix: str | None) -> str | None:
    try:
        value = Decimal(digits.replace(",", "").rstrip("."))
    except InvalidOperation:
        return None
    if suffix:
        value *= 1_000 if suffix.lower() == "k" else 1_000_000
    return format(value.normalize(), "f")


def anchors(text: str) -> tuple[set[str], set[int]]:
    """The numbers and months a text names. ISO dates count as their year, month and day."""
    text = text or ""
    numbers: set[str] = set()
    months: set[int] = set()
    for year, month, day in _ISO_DATE.findall(text):
        numbers.update({str(int(year)), str(int(month)), str(int(day))})
        months.add(int(month))
    for match in _NUMBER.finditer(_ISO_DATE.sub(" ", text)):
        key = _number_key(match.group(1), match.group(2))
        if key is not None:
            numbers.add(key)
    months.update(_MONTHS[word] for word in _WORD.findall(text.lower()) if word in _MONTHS)
    # "may" is also a verb; only count it next to a number ("May 3", "3 May").
    if 5 in months and not re.search(r"\bmay\s+\d|\d(?:st|nd|rd|th)?\s+may\b", text, re.I):
        months.discard(5)
    return numbers, months


def anchors_supported(text: str, sources: Iterable[str]) -> bool:
    """True when every number and month in `text` appears in `sources`. A limited safeguard, not proof of meaning."""
    numbers, months = anchors(text)
    if not numbers and not months:
        return True
    known_numbers: set[str] = set()
    known_months: set[int] = set()
    for source in sources:
        source_numbers, source_months = anchors(source)
        known_numbers |= source_numbers
        known_months |= source_months
    return numbers <= known_numbers and months <= known_months


_NON_TEXT_FIELDS = {"id", "authority", "state_item_id", "affected_state_ids", "evidence_ids", "question_ids",
                    "answered_by_review_id", "answer_evidence_id", "blocking", "accepted_as_adjusted"}


def record_text(record: Mapping[str, Any]) -> str:
    """Every value a record shows, for the anchor check."""
    parts: list[str] = []
    for key, value in record.items():
        if key in _NON_TEXT_FIELDS or value is None:
            continue
        if isinstance(value, Mapping):
            parts.append(record_text(value))
        elif isinstance(value, (str, int, float)):
            parts.append(str(value))
    return " ".join(parts)


def today_text(today: date | None) -> str:
    today = today or date.today()
    return f"{today.isoformat()} {today.strftime('%B')}"


# --- the checks ---------------------------------------------------------------------------------------------

def selected_records(context: Mapping[str, Any]) -> dict[str, dict[str, Mapping[str, Any]]]:
    """The selected records by the record type a card or claim names."""
    questions = context.get("questions", [])
    return {
        "state": {x["id"]: x for x in context.get("state", [])},
        "review": {x["id"]: x for x in context.get("reviews", [])},
        "history": {x["id"]: x for x in context.get("history", [])},
        "evidence": {x["id"]: x for x in context.get("evidence", [])},
        "blocking_question": {x["id"]: x for x in questions if x.get("blocking")},
        "question": {x["id"]: x for x in questions if not x.get("blocking")},
        "answered_question": {x["id"]: x for x in context.get("answered_questions", [])},
    }


class ClaimChecker:
    """Checks claims against the records Ask selected for this request. The same checker runs while a streamed
    answer arrives and on the final answer, so a claim is shown during streaming only if the final answer keeps it."""

    def __init__(self, context: Mapping[str, Any], *, query: str = "", today: date | None = None):
        self.records = selected_records(context)
        self.by_id: dict[str, Mapping[str, Any]] = {rid: rec for bucket in self.records.values() for rid, rec in bucket.items()}
        # A claim with no primary record may name numbers from any selected record, the request itself (to correct
        # a premise) or today's date.
        self.open_sources = [record_text(r) for r in self.by_id.values()] + [query, today_text(today)]

    def primary(self, basis: str, record_id: str | None) -> tuple[str, Mapping[str, Any]] | None:
        for record_type in BASIS_RECORD_TYPES.get(basis, ()):
            record = self.records[record_type].get(record_id or "")
            if record is not None:
                return record_type, record
        return None

    def check_claim(self, claim: Mapping[str, Any]) -> str | None:
        """The claim's chip label ("" for an unlabelled `none` claim) when it may be shown, or None to withhold it."""
        basis = claim.get("basis") or "none"
        supporting = [self.by_id.get(rid) for rid in claim.get("supporting_record_ids") or []]
        if any(record is None for record in supporting):
            return None
        text = str(claim.get("text") or "")
        if basis == "none":
            if claim.get("primary_record_id"):
                return None
            sources = [record_text(r) for r in supporting] if supporting else self.open_sources
            return "" if anchors_supported(text, sources) else None
        found = self.primary(basis, claim.get("primary_record_id"))
        if found is None:
            return None
        record_type, record = found
        if not anchors_supported(text, [record_text(record), *(record_text(r) for r in supporting)]):
            return None
        return RECORD_LABELS[record_type]

    def card_record(self, record_type: str, record_id: str | None) -> Mapping[str, Any] | None:
        return self.records.get(record_type, {}).get(record_id or "")


def _short(text: str, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def canonical_card(record_type: str, record: Mapping[str, Any], source_labels: Mapping[str, str] | None = None) -> tuple[str, str | None]:
    """The record's own text for a Current State, History or Evidence card (text, detail)."""
    if record_type == "state":
        return _short(record.get("statement"), 690), None
    if record_type == "history":
        new = _short(record.get("new_statement"), 320)
        old = record.get("old_statement")
        when = str(record.get("changed_at") or "")[:10]
        text = f"Changed from “{_short(old, 320)}” to “{new}”" if old else f"Recorded: “{new}”"
        return (text + (f" on {when}" if when else ""))[:700], None
    if record_type == "evidence":
        source = str(record.get("source_type") or "")
        label = (source_labels or {}).get(source) or source.replace("_", " ")
        when = str(record.get("submitted_at") or "")[:10]
        detail = " · ".join(part for part in (label.capitalize() if label else "", when) if part) or None
        return f"“{_short(record.get('content'), 300)}”", detail
    raise ValueError(f"no canonical card for {record_type}")
