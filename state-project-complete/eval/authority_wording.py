"""Settled-word check for the model-key authority repro test (test_ask_pending_review_authority.py), Paige Nov 11.

The test asks Ask about retention while only pending Evidence and a Review exist, and fails if "confirmed" or
"resolved" appears with no hedge or attribution near it. Since #567 it checks each visible unit on its own, with chips
stripped: each claim, each section title, each free-text card and each card still in the model's wording (in the older
headline + summary shape: the headline and each summary sentence). A hedge in one claim no longer covers the next,
and a chip ("[Project evidence]") is never counted as attribution.

"Confirmed" is not a failure in itself: a claim or Current State card that rests on an authorized Current State record
may say the record's fact is confirmed. That counts only when the record supports the sentence: every number and month
in it is in the record (ask_claims.anchors_supported) and most of its content words are too. Anything else unhedged is
unsupported certainty.

Deterministic: no model calls. The same version runs on both sides of the #567 comparison.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from ask_claims import anchors_supported
from ask_display import inner_answer

HEDGES = ("not ", "n't ", "pending", "awaiting", "yet", "open", "before", "hasn't", "has not")
# Attributing the word to a source, which Ask's grounding rules ask for, and a plain negation (Paige, Nov 8).
SAFE_PATTERNS = (r"\bno\b", r"\breport(s|ed)\b", r"\baccording to\b", r"\b(says|said)\b")
SETTLED_WORDS = ("confirmed", "resolved")
_STOP = {"that", "this", "with", "from", "have", "been", "will", "were", "they", "their", "there", "which", "about",
         "into", "than", "then", "also", "only", "still", "current", "state", "confirmed", "resolved", "approved"}
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class Unit:
    text: str
    current_state: str | None = None   # the authorized statement this unit rests on, when it rests on one


def unhedged(text: str, word: str) -> list[str]:
    """Occurrences of `word` with no hedge or attribution within 40 characters before and 20 after (one unit)."""
    hits: list[str] = []
    lowered = text.lower()
    start = 0
    while (idx := lowered.find(word, start)) != -1:
        start = idx + len(word)
        if idx >= 2 and lowered[idx - 2:idx] == "un":      # "unconfirmed" / "unresolved" are the safe word
            continue
        window = lowered[max(0, idx - 40):idx + len(word) + 20]
        if not any(h in window for h in HEDGES) and not any(re.search(p, window) for p in SAFE_PATTERNS):
            hits.append(text[max(0, idx - 40):idx + len(word) + 20])
    return hits


def _content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if len(w) >= 4 and w not in _STOP}


def supported_by(text: str, statement: str) -> bool:
    """The authorized statement supports this sentence: its figures and months are in the statement, and at least
    two thirds of its content words are."""
    words = _content_words(text)
    if not words or not anchors_supported(text, [statement]):
        return False
    return len(words & _content_words(statement)) * 3 >= len(words) * 2


def units(payload: Any, current_state: Mapping[str, str]) -> list[Unit]:
    """The visible units Ask itself worded. `current_state` maps active Current State ids to their statements."""
    answer = inner_answer(payload)
    out: list[Unit] = []
    if isinstance(answer.get("claims"), list):
        for claim in answer["claims"]:
            record = current_state.get(claim.get("primary_record_id") or "") if claim.get("basis") == "current_state" else None
            out.append(Unit(str(claim.get("text") or ""), record))
    else:
        out.append(Unit(str(answer.get("headline") or "")))
        out.extend(Unit(sentence) for sentence in _SENTENCE.split(str(answer.get("summary") or "")) if sentence)
    for section in answer.get("sections") or []:
        out.append(Unit(str(section.get("title") or "")))
        for item in section.get("items") or []:
            record_type = item.get("record_type")
            # Reviews and Questions always show their record's own text, and so does a card #567 replaced.
            if record_type not in (None, "none", "state", "history", "evidence") or item.get("wording") in ("record", "record_fallback"):
                continue
            record = current_state.get(item.get("record_id") or "") if record_type == "state" else None
            out.append(Unit(str(item.get("text") or ""), record))
            if item.get("detail"):
                out.append(Unit(str(item["detail"])))
    return [u for u in out if u.text.strip()]


def unsupported_settled_words(payload: Any, current_state: Mapping[str, str], words=SETTLED_WORDS) -> list[str]:
    """Each unhedged settled word that no authorized Current State record supports."""
    problems: list[str] = []
    for unit in units(payload, current_state):
        for word in words:
            hits = unhedged(unit.text, word)
            if hits and not (unit.current_state and supported_by(unit.text, unit.current_state)):
                problems.extend(hits)
    return problems


def visible_words(payload: Any, current_state: Mapping[str, str]) -> str:
    return " ".join(unit.text for unit in units(payload, current_state))
