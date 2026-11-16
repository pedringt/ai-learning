"""Two things an Ask answer may not say, because the model can't know them (#703, #704; Paige, Nov 16).

1. A freshness verdict about Current State (#703). Whether a Current State item is stale, outdated or up to date is
   DEC-026 confirmation data (last_confirmed_at / needs_recheck), which the model never receives. Freshness questions
   are answered in software (ask_software_answers); this is the backstop for a wording that still reaches the model, so
   no question can get a confident freshness answer without that data: "…so the exception is not stale in Current
   State" under a "needs re-check" chip.

2. A false absence of a record (#704). "No Current State record covers the VIP carve-out" while k-vip exists. An
   existence claim (no record of a kind covers, mentions or is about X) is checked against every record in the project,
   not just the ones retrieval sent, so neither a record the model ignored nor one retrieval cut becomes evidence that
   nothing exists. Only existence claims: a record-first denial ("no record establishes X", "State has no confirmed
   X", "I couldn't find a record of X") describes the record it is about and is never checked here (#701 scope, Nov 16).

Both withhold the unit: software never rewords a claim (#567). The withheld line is the existing one (Paige, Nov 16).
"""
from __future__ import annotations

import re
from typing import Any, Iterable, Mapping

# --- 1. freshness verdicts -----------------------------------------------------------------------------------------

_FRESH = r"(?:stale|outdated|out[\s-]+of[\s-]+date|up[\s-]+to[\s-]+date|(?:no\s+longer|still)\s+(?:current|fresh)|fresh)"
_FRESHNESS = re.compile(
    r"\b" + _FRESH + r"\b|\b(?:needs?|needing|requires?|due\s+for|overdue\s+for)\s+(?:a\s+)?re-?\s*(?:check|confirm)\w*",
    re.IGNORECASE,
)
# "…don't show whether it is stale", "if it's out of date": not a verdict.
_OPEN = re.compile(r"\b(?:whether|if)\b[^.;:]*$", re.IGNORECASE)
# Nov 16 replay (adv_number_mismatch_state_vs_review): a freshness word Ask reports from a record is the record's
# argument, not Ask's verdict. "A pending Finance review proposes…, saying the $2,500 figure is outdated", "arguing the
# $2,500 figure is outdated", "treats the $2,500 figure as outdated". Earlier in the same clause: a reporting verb
# (ask_assertions._REPORTING, plus arguing and treats … as) or a pending/proposal frame (as DEC-028's V1). Never when
# Current State is the one said to report it: Current State holds no freshness verdicts.
_REPORTED = re.compile(
    r"\b(?:argu(?:e|es|ed|ing)|contend(?:s|ed|ing)?|treat(?:s|ed|ing)?\b[^.;]*\bas|"
    r"call(?:s|ed|ing)?|consider(?:s|ed|ing)?|saying|claiming|stating|noting|describing|reporting)\b"
    r"|\b(?:pending|propos(?:e|es|ed|al|ing)|awaiting|suggest(?:s|ed|ing)?|under\s+review|not\s+(?:yet\s+)?(?:been\s+)?accepted)\b",
    re.IGNORECASE,
)
_STATE_REPORTS = re.compile(r"\bcurrent\s+state\s+(?:\w+\s+){0,2}?(?:says|said|states?|shows?|records?|notes?|lists?|treats?)\b",
                            re.IGNORECASE)
_ABOUT_STATE = re.compile(r"\bcurrent\s+state\b", re.IGNORECASE)


def freshness_verdict(text: str, *, about_state: bool) -> str | None:
    """The freshness wording the unit uses as a verdict on Current State, or None. `about_state`: the unit cites a
    Current State record (a current_state claim or a State card); otherwise it counts only when it says "Current
    State"."""
    if not (about_state or _ABOUT_STATE.search(text or "")):
        return None
    from ask_assertions import _REPORTING
    for match in _FRESHNESS.finditer(text or ""):
        before = re.split(r"[.;!?]", text[:match.start()])[-1]
        if _OPEN.search(before):
            continue
        framed = _ABOUT_STATE.sub(" ", before)         # "State" in "Current State" is not the reporting verb "states"
        if (_REPORTING.search(framed) or _REPORTED.search(framed)) and not _STATE_REPORTS.search(before):
            continue
        return match.group(0)
    return None


# --- 2. existence absence ------------------------------------------------------------------------------------------

_KIND_WORDS = (
    ("state", r"current\s+state(?:\s+(?:record|entry|entries|item|fact|statement)s?)?|state\s+(?:record|entry|entries|item|fact)s?"),
    ("reviews", r"reviews?"),
    ("questions", r"(?:open\s+)?questions?"),
    ("any", r"(?:supplied\s+|provided\s+|other\s+)?(?:record|entry|entries|item|evidence|note|document)s?"),
)
_KIND = "|".join(f"(?:{pattern})" for _, pattern in _KIND_WORDS)
_KINDS = rf"(?P<kinds>(?:{_KIND})(?:\s*(?:,|/|\bor\b|\band\b|,\s*or\b)\s*(?:an?\s+)?(?:{_KIND}))*)"
_COVERS = (r"(?:covers?|covering|mentions?|mentioning|address(?:es)?|addressing|discuss(?:es)?|discussing|refers?\s+to|"
           r"(?:is|are)\s+about|about|on|regarding|concerning|related\s+to|relating\s+to)")
_ABSENCE = (
    re.compile(rf"\b(?:no|none\s+of\s+the|not\s+(?:a|any)|without\s+(?:a|any))\s+{_KINDS}\s+(?:(?:that|which)\s+)?"
               rf"(?:\w+\s+){{0,3}}?{_COVERS}\s+(?P<subject>[^.;:!?]*)", re.IGNORECASE),
    re.compile(rf"\bthere\s+(?:is|are)\s+no\s+{_KINDS}\s+(?:(?:that|which)\s+)?{_COVERS}\s+(?P<subject>[^.;:!?]*)",
               re.IGNORECASE),
)
_SUBJECT_END = re.compile(r",|\b(?:and|but|so|because|which|while|though|although|since|among|in\s+the\s+(?:supplied|provided))\b",
                          re.IGNORECASE)
_STOP = {
    "the", "a", "an", "and", "or", "of", "for", "in", "on", "to", "by", "at", "is", "are", "was", "were", "be", "been",
    "it", "its", "this", "that", "these", "those", "them", "they", "their", "there", "here", "any", "anything", "all",
    "which", "what", "when", "who", "how", "whether", "about", "with", "from", "as", "yet", "still", "now", "current",
    "state", "record", "records", "recorded", "item", "items", "entry", "entries", "question", "questions", "review",
    "reviews", "project", "topic", "subject", "matter", "issue", "out", "date", "stale", "outdated", "up", "does",
    "do", "did", "has", "have", "had", "not", "no", "supplied", "provided", "among", "currently", "specific",
    "specifically", "explicit", "explicitly", "same", "such", "one", "ones", "thing", "things", "something",
}
_FIELDS = {
    "state": ("topic", "statement"),
    "reviews": ("decision_question", "why_consequential"),
    "questions": ("text", "blocks"),
    "answered_questions": ("text", "answer"),
    "history": ("new_statement", "old_statement", "reason"),
    "evidence": ("content", "summary", "title"),
}


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _words(text: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in _STOP}


def _buckets(kinds: str) -> tuple[str, ...]:
    found = []
    for name, pattern in _KIND_WORDS:       # in order, each kind's words removed once matched ("Current State record")
        kinds, n = re.subn(rf"\b(?:{pattern})\b", " ", kinds, flags=re.IGNORECASE)
        if n:
            found.append(name)
    if "any" in found or not found:
        return tuple(_FIELDS)
    buckets = []
    for name in found:
        buckets += {"state": ["state"], "reviews": ["reviews"], "questions": ["questions", "answered_questions"]}[name]
    return tuple(buckets)


def false_absence(text: str, project: Mapping[str, Iterable[Mapping[str, Any]]], query: str = "") -> str | None:
    """The id of a record that the unit says doesn't exist, or None. An existence claim's subject ("the VIP
    carve-out") shares at least half its distinctive words with a record of a kind the claim names (a pronoun means the
    question's own subject, and one distinctive word of it is enough), anywhere in the project. A word is distinctive when at most a quarter of that kind's
    records use it (at least 2), so "pilot" in a pilot project matches nothing on its own and "VIP" does."""
    for match in (m for pattern in _ABSENCE for m in pattern.finditer(text or "")):
        subject = _SUBJECT_END.split(match.group("subject") or "", maxsplit=1)[0]
        words = _words(subject)
        pronoun = not words           # "…covers it": the question's subject, which one distinctive word identifies
        words = words or _words(query)
        if not words:
            continue
        for bucket in _buckets(match.group("kinds") or ""):
            records = [(r, _words(" ".join(str(r.get(f) or "") for f in _FIELDS[bucket]))) for r in project.get(bucket, []) or []]
            limit = max(2, len(records) // 4)
            distinctive = {w for w in words if sum(w in body for _, body in records) <= limit}
            if not distinctive:
                continue
            need = 1 if pronoun else (len(distinctive) + 1) // 2
            best = max(records, key=lambda rb: len(distinctive & rb[1]), default=None)
            if best and len(distinctive & best[1]) >= need:
                return str(best[0].get("id") or bucket)
    return None
