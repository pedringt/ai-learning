"""Remove summary sentences that only repeat a card (Oct 20, approved by Paige).

Ask answers say most things twice: the summary restates records that the cards below it then show in
the record's own words (the LLM grader cited this in 98% of its concision reasons; a prompt rule only
moved concision 3.07 -> 3.13). This deterministic pass drops a summary sentence only when all of these
hold, so nothing that warns, hedges or corrects is ever removed:

- it is not the summary's first sentence (the direct answer);
- it carries no negation, hedge, pending/open status or correction word (PROTECT_WORDS);
- at least REPEAT_THRESHOLD of its content words appear in one card's text and detail.

`summary_repetition` measures the same overlap for evals, without changing anything.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

REPEAT_THRESHOLD = 0.8
MIN_CONTENT_WORDS = 4

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_WORD = re.compile(r"[a-z0-9$%][a-z0-9$%.,'-]*")
# A sentence with any of these is kept: it warns, hedges, states a status, or corrects a premise.
PROTECT_WORDS = frozenset({
    "not", "no", "never", "none", "nothing", "cannot", "can't", "isn't", "aren't", "wasn't", "hasn't",
    "haven't", "doesn't", "don't", "didn't", "won't", "pending", "open", "unresolved", "unknown",
    "awaiting", "proposed", "proposal", "uncertain", "unclear", "may", "might", "could", "until",
    "however", "but", "although", "premise", "blocking", "blocked", "blocks", "overdue", "yet", "only",
    "unconfirmed", "unaccepted", "unless", "whether", "if", "risk", "conflict", "conflicts", "contradict",
    "contradicts", "superseded", "stale", "reported", "reportedly", "claims", "claim",
})
# Words that frame a restatement ("Current State says ...") and carry no content of their own.
_FRAME_WORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "it",
    "this", "that", "these", "those", "with", "as", "at", "by", "from", "current", "state", "says",
    "say", "records", "record", "recorded", "lists", "listed", "shows", "states", "stated", "notes",
    "according", "project", "its", "their", "there", "which", "also",
})


def split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_SPLIT.split((text or "").strip()) if s.strip()]


def _words(text: str) -> list[str]:
    return [w.strip(".,'") for w in _WORD.findall((text or "").lower())]


def _content(words: Iterable[str]) -> set[str]:
    return {w for w in words if w and w not in _FRAME_WORDS}


def _card_word_sets(answer: Any) -> list[set[str]]:
    cards = []
    for section in _get(answer, "sections") or []:
        for item in _get(section, "items") or []:
            cards.append(_content(_words(f"{_get(item, 'text') or ''} {_get(item, 'detail') or ''}")))
    return [c for c in cards if c]


def _get(obj: Any, key: str) -> Any:
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def _repeats_a_card(sentence: str, cards: list[set[str]]) -> bool:
    words = _words(sentence)
    if PROTECT_WORDS & set(words):
        return False
    content = _content(words)
    if len(content) < MIN_CONTENT_WORDS:
        return False
    return any(len(content & card) / len(content) >= REPEAT_THRESHOLD for card in cards)


def summary_repetition(answer: Any) -> dict[str, Any]:
    """For evals: how many summary sentences (after the first) would be removed as pure repeats."""
    sentences = split_sentences(_get(answer, "summary") or "")
    cards = _card_word_sets(answer)
    repeats = [s for s in sentences[1:] if _repeats_a_card(s, cards)]
    return {"summary_sentences": len(sentences), "repeated_sentences": len(repeats),
            "summary_words": len(_words(_get(answer, "summary") or ""))}


def drop_repeated_summary_sentences(answer: Any) -> Any:
    """Remove summary sentences that only repeat a card (see module docstring). Returns the answer."""
    summary = _get(answer, "summary") or ""
    sentences = split_sentences(summary)
    if len(sentences) < 2:
        return answer
    cards = _card_word_sets(answer)
    if not cards:
        return answer
    kept = [sentences[0]] + [s for s in sentences[1:] if not _repeats_a_card(s, cards)]
    if len(kept) == len(sentences):
        return answer
    new_summary = " ".join(kept)
    if isinstance(answer, dict):
        answer["summary"] = new_summary
    else:
        answer.summary = new_summary
    return answer
