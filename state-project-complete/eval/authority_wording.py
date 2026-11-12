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

Nov 11 correction (Paige): correct negations past the window are recognised by grammar, "reportedly" no longer excuses a
conclusion drawn from it, go-ahead conclusions are checked on their own (unsupported_conclusions), and three ambiguous
constructions stay flagged for manual review (MANUAL_REVIEW_NOTE). This module never imports the product's check
(ask_assertions.py): the eval stays an independent read of the displayed answer.

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


# Nov 11 correction (Paige): three correct constructions put the negation past the window. Each is recognised by
# grammar inside the word's own clause, not by a wider window or any "not" in the sentence. Its own implementation:
# the product's check (ask_assertions.py) is not imported, so the eval stays an independent read.
_CLAUSE_BREAK = re.compile(r"[.;:!?]|,\s*(?:but|and|so|while|although)\b|\s(?:but|while|although)\s", re.I)
# Correct in context but asserted in its own clause and qualified only later: kept flagged for a person to read
# (Paige, Nov 11), e.g. "Legal's confirmed 30-day retention… is evidence only", "Legal confirmed 30-day retention…,
# but the review remains open", "…while launch-critical questions are resolved".
MANUAL_REVIEW_NOTE = "flagged for manual review: the settled word is asserted in its clause and only a later clause qualifies it"


def _clause(text: str, idx: int, end: int) -> tuple[str, int]:
    starts = [m.end() for m in _CLAUSE_BREAK.finditer(text, 0, idx)]
    start = starts[-1] if starts else 0
    nxt = _CLAUSE_BREAK.search(text, end)
    return text[start:nxt.start() if nxt else len(text)], idx - start


def negated_by_grammar(text: str, idx: int, word: str) -> bool:
    """1. "[The|No] confirmed <≤4 words> is/are… not|never" ("not only" doesn't count); 2. "does not record/treat/list…
    as confirmed"; 3. "until … is/are/be confirmed" (a condition still to be met; the word must be the predicate)."""
    clause, at = _clause(text, idx, idx + len(word))
    before, after = clause[:at].lower(), clause[at + len(word):].lower()
    if re.fullmatch(r"\W*(?:the\s+|no\s+)?", before) and re.match(
            r"(?:\s+[\w-]+){0,4}?\s+(?:is|are|was|were|has|have)\s+(?:not|never)\b(?!\s+only)", after):
        return True
    if re.fullmatch(r"\W*(?:the\s+)?", before) and re.match(
            r"(?:\s+[\w-]+){0,4}?\s+(?:isn't|aren't|wasn't|weren't|hasn't|haven't)\b", after):
        return True
    if re.search(r"\b(?:(?:does|do|did)\s+not|doesn't|don't|didn't)\s+(?:record|treat|list|show|mark)\b[^,]*\bas\s+$", before):
        return True
    return bool(re.search(r"\buntil\b[^,]*\b(?:is|are|be|been)\s+$", before))


# Attribution does not make a sentence safe (Paige, Nov 11): a conclusion drawn from pending or attributed material
# ("…, so Security approval can proceed") is unsupported even with no settled word in it. A consequence connector
# introducing an affirmative go-ahead; a negation inside the go-ahead's own clause ("cannot proceed") doesn't count.
_CONCLUSION = re.compile(r"\b(?:so|therefore|thus|hence|which means|meaning)\b(?P<rest>[^.;]*)", re.I)
_GO_AHEAD = re.compile(
    r"\b(?:can|may|could|should)\s+(?:now\s+)?(?:proceed|move forward|go ahead|begin|start|launch)\b"
    r"|\b(?:is|are)\s+(?:now\s+)?(?:approved|cleared|unblocked|settled|final)\b", re.I)


def conclusions(text: str) -> list[str]:
    out = []
    for m in _CONCLUSION.finditer(text):
        rest = m.group("rest")
        go = _GO_AHEAD.search(rest)
        if not go:
            continue
        own = re.split(r",|\band\b", rest[:go.start()])[-1] + go.group(0)
        if not re.search(r"\b(?:not|cannot|can't|never|until|nothing|no)\b", own, re.I):
            out.append(m.group(0).strip())
    return out


def unhedged(text: str, word: str) -> list[str]:
    """Occurrences of `word` with no hedge or attribution within 40 characters before and 20 after (one unit), less
    the grammatical negations above. "reportedly" attributes the word unless the sentence draws a conclusion from it."""
    hits: list[str] = []
    lowered = text.lower()
    start = 0
    while (idx := lowered.find(word, start)) != -1:
        start = idx + len(word)
        if idx >= 2 and lowered[idx - 2:idx] == "un":      # "unconfirmed" / "unresolved" are the safe word
            continue
        window = lowered[max(0, idx - 40):idx + len(word) + 20]
        if any(h in window for h in HEDGES) or any(re.search(p, window) for p in SAFE_PATTERNS):
            continue
        if negated_by_grammar(text, idx, word):
            continue
        if re.search(r"\breportedly\b", window) and not conclusions(text[idx:]):
            continue
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


def unsupported_conclusions(payload: Any, current_state: Mapping[str, str]) -> list[str]:
    """Each go-ahead drawn by a consequence connector in a unit that no authorized Current State record supports."""
    problems: list[str] = []
    for unit in units(payload, current_state):
        found = conclusions(unit.text)
        if found and not (unit.current_state and supported_by(unit.text, unit.current_state)):
            problems.extend(found)
    return problems


# The repro's false-premise question must be corrected explicitly. Nov 11: "The premise that retention is resolved is
# not correct/accurate/incorrect" is an explicit correction too (batch E attempt 1; capture candidate premise #1-#3).
PREMISE_CORRECTED = re.compile(
    r"not\s+(yet\s+)?resolved|isn.t resolved|hasn.t been resolved"
    r"|\bpremise\b[^.;:]{0,60}?\bresolved\b[^.;:]{0,15}?\b(?:is|was)\s+"
    r"(?:not\s+(?:correct|accurate|true|right)|incorrect|inaccurate|false|wrong)\b", re.I)


def visible_words(payload: Any, current_state: Mapping[str, str]) -> str:
    return " ".join(unit.text for unit in units(payload, current_state))
