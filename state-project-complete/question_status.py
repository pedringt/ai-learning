"""#640 Option B (draft, not wired into Ask): requests about a recorded Question's resolution status.

Everything here is deterministic. It decides whether a request is explicitly about whether a Question was answered
(or is still open), identifies which Question it means from the words that name the Question (never from status words),
asks for clarification when that identity is not clear, and checks an Ask answer's headline and body against the
matched record. When a check fails it builds a neutral answer from the record.

Word matching is a heuristic, not proof that a record answers the request: it is used only to decide between "one
clear Question", "ask which one" and "not a Question-status request". Paige, Nov 7: keep scope words (privileged vs
standard) distinct, exclude status words from identity, and clarify when identity is ambiguous.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

# ---------------------------------------------------------------------------------------------- word normalization

# Inflections are stripped by rule. Derived forms (a noun from a verb) are mapped by this explicit table, because
# suffix stripping does not connect them: "retention" -> "retent" never meets "retain". Only listed pairs map; a
# test checks each one, and an unlisted derivation is a known gap, not a silent match.
_DERIVATIONS = {
    "retention": "retain", "retentions": "retain",
    "deletion": "delete", "deletions": "delete",
    "approval": "approve", "approvals": "approve",
    "automation": "automate",
    "decision": "decide", "decisions": "decide",
    "selection": "select",
    "expansion": "expand",
    "integration": "integrate",
    "reconsideration": "reconsider",
}
_STOP = {
    "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "me", "my", "we", "our", "this", "that", "what",
    "is", "are", "be", "been", "was", "were", "with", "about", "has", "have", "had", "did", "does", "do", "it", "its",
    "how", "long", "any", "there", "which", "who", "when", "after", "before", "by", "from", "yet", "still", "now",
    "they", "their", "if", "so", "can", "will", "would", "should", "not", "no", "yes",
}
# Words that say what kind of request this is, not which Question it concerns. Never used for identity.
STATUS_WORDS = {
    "question", "questions", "answer", "answered", "answers", "answering", "unanswered", "resolve", "resolved",
    "unresolved", "resolution", "close", "closed", "open", "opened", "pending", "settle", "settled", "status",
}


def normalize(word: str) -> str:
    """One form per word family: inflections stripped, listed derivations mapped, and a final silent "e" dropped so
    the base and inflected forms meet (delete/deleted/deleting -> "delet"; approve/approved -> "approv"). Reviewer
    counterexamples (Nov 7) found delete != deleted and approve != approved before the last step."""
    w = word.lower()
    if w in _DERIVATIONS:
        w = _DERIVATIONS[w]
    else:
        for suffix, keep in (("ies", "y"), ("ied", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
            if len(w) > len(suffix) + 3 and w.endswith(suffix) and not w.endswith("ss"):
                w = w[: -len(suffix)] + keep
                break
        w = _DERIVATIONS.get(w, w)
    if len(w) > 4 and w.endswith("e") and not w.endswith("ee"):
        w = w[:-1]
    return w


def identity_terms(text: str) -> set[str]:
    """Normalized words that can name a Question: no stop words, no status words, hyphenated words split."""
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {normalize(w) for w in words if len(w) > 2 and w not in _STOP and w not in STATUS_WORDS}


# ---------------------------------------------------------------------------------------------- request scope

_EXPLICIT_QUESTION = re.compile(r"\bquestions?\b", re.I)
_ANSWERED_BY = re.compile(r"\b(?:has|have|did|was|were)\b(?:\s+\w+){0,3}?\s+(?:answered|resolved|closed)\b", re.I)
_ASKED_ANSWERED = re.compile(r"\b(?:answered|resolved|closed)\b", re.I)
_ASKED_OPEN = re.compile(r"\b(?:unanswered|unresolved|still\s+open|open|pending)\b", re.I)
# About the content or validity of an answer, not about whether one exists: different reasoning, normal Ask path.
_CONTENT_REQUEST = re.compile(
    r"\b(?:still\s+(?:accurate|true|valid|correct|right)|accurate|accurately|correct|correctly|incorrect|incorrectly|"
    r"valid|wrong|wrongly|properly|improperly|right|well|fully|completely|adequately|sufficiently|thoroughly|"
    r"reliabl[ey]|trustworth\w*|good|better|best|bad|quality|"
    r"what\s+(?:did|does|was|is)\b.*\b(?:say|said|answer)|what\s+(?:was|is)\s+the\s+answer|why|how\s+well)\b", re.I)


@dataclass(frozen=True)
class Scope:
    in_scope: bool
    asks: str = ""  # "answered" or "open": the status the request asks about, which sets its polarity
    reason: str = ""


def request_scope(request: str) -> Scope:
    """In scope only for an explicit request about whether a recorded Question was answered (or is still open).
    "Is the budget settled?" has no Question reference and no "has X answered", so it is not in scope."""
    text = request or ""
    if _CONTENT_REQUEST.search(text):
        return Scope(False, reason="asks about the answer's content or validity")
    explicit = bool(_EXPLICIT_QUESTION.search(text))
    answered_by = bool(_ANSWERED_BY.search(text))
    if not (explicit or answered_by):
        return Scope(False, reason="no explicit Question reference")
    if _ASKED_OPEN.search(text):
        return Scope(True, asks="open")
    if _ASKED_ANSWERED.search(text) or answered_by:
        return Scope(True, asks="answered")
    return Scope(False, reason="no resolution-status wording")


# ---------------------------------------------------------------------------------------------- record identity

@dataclass(frozen=True)
class Match:
    kind: str  # "matched", "clarify" or "none"
    question: Mapping[str, Any] | None = None
    candidates: tuple[Mapping[str, Any], ...] = ()
    reason: str = ""


MIN_SHARED, MIN_LEAD, MAX_CANDIDATES = 2, 1, 3


def match_question(request: str, questions: Sequence[Mapping[str, Any]]) -> Match:
    """Which Question the request names. `questions` are open and answered Question records ({"id", "text", ...}).

    Matched only when one Question shares at least MIN_SHARED identity words with the request, leads every other by
    at least MIN_LEAD, and no request word that the top Question lacks names a different candidate (a scope conflict,
    e.g. "privileged" when the top candidate is about standard resets). Otherwise: clarify when any Question shares a
    word, none when nothing does."""
    wanted = identity_terms(request)
    scored = sorted(((len(wanted & identity_terms(q.get("text", ""))), i, q) for i, q in enumerate(questions)),
                    key=lambda x: (-x[0], x[1]))
    candidates = [(s, q) for s, _, q in scored if s > 0]
    if not candidates:
        return Match("none", reason="no Question shares a word with the request")
    top_score, top = candidates[0]
    runner_up = candidates[1][0] if len(candidates) > 1 else 0
    shortlist = tuple(q for _, q in candidates[:MAX_CANDIDATES])
    if top_score < MIN_SHARED:
        return Match("clarify", candidates=shortlist, reason=f"best match shares only {top_score} word")
    if top_score - runner_up < MIN_LEAD:
        return Match("clarify", candidates=shortlist, reason="two Questions match equally")
    top_terms = identity_terms(top.get("text", ""))
    unexplained = wanted - top_terms
    conflict = [w for w in unexplained if any(w in identity_terms(q.get("text", "")) for _, q in candidates[1:])]
    if conflict:
        return Match("clarify", candidates=shortlist, reason="request words point to another Question: " + ", ".join(sorted(conflict)))
    return Match("matched", question=top)


# ---------------------------------------------------------------------------------------------- answer checks

def is_resolved(question: Mapping[str, Any]) -> bool:
    """The record's explicit status decides. Answer text alone never makes a Question resolved: an open Question can
    carry draft or retained text (reviewer counterexample, Nov 7). A record without a status is not resolved."""
    return str(question.get("status") or "").strip().lower() == "resolved"


_OPENERS = (("not yet", "no"), ("no", "no"), ("yes", "yes"))
_SAYS_RESOLVED = ("answered", "resolved", "closed", "recorded answer")
_SAYS_OPEN = ("still open", "unanswered", "not been answered", "not answered", "no answer", "no recorded answer", "is open", "remains open",
              "open question")


# Whether a Question was answered is yes or no. A hedged opener ("Not fully: ... is answered") misstates it, so it is
# its own kind and never correct. Replay of Nov 7's saved answers found "Not fully" scored as correct without this.
_HEDGES = ("not fully", "not entirely", "not completely", "not quite", "partly", "partially", "mostly", "in part", "sort of")


def _opener(headline: str) -> str:
    words = re.sub(r"[^\w\s]", " ", (headline or "").lower()).split()
    for phrase in _HEDGES:
        if words[: len(phrase.split())] == phrase.split():
            return "hedge"
    if {"fully", "partly", "partially", "entirely"} & set(words[:3]):  # "Not yet fully answered: ..."
        return "hedge"
    for phrase, polarity in _OPENERS:
        if words[: len(phrase.split())] == phrase.split():
            return polarity
    if words[:1] == ["not"]:  # "Not in the sense of an unanswered question: ..." answers no
        return "no"
    return ""


def _asserts(text: str, phrase: str) -> bool:
    from eval.quality_harness import _asserts as asserts, _normalize
    return asserts(_normalize(text), _normalize(phrase))


def _mentions(text: str, phrases: Sequence[str]) -> bool:
    return any(_asserts(text, p) for p in phrases)


_NEGATORS = {"no", "not", "nothing", "never", "without", "neither", "nor", "none", "n't"}


def _states_opposite(text: str, phrases: Sequence[str], *, about_question: bool) -> bool:
    """An opposite-status phrase counts only when it is not negated within its clause (a negator among the five words
    before it: "no recorded answer", "no open Review or open Question") and, for body text, only in a sentence that
    is about a Question ("the vendor contract ... so that is still open" is about the contract). Replay of Nov 7's
    saved answers found seven false alarms without these rules."""
    for sentence in re.split(r"(?<=[.!?;])\s+", text or ""):
        low = sentence.lower()
        if about_question and "question" not in low:
            continue
        for phrase in phrases:
            for m in re.finditer(r"\b" + re.escape(phrase) + r"\b", low):
                before = re.findall(r"[a-z']+", low[: m.start()].replace("n't", " n't"))[-5:]
                if not (_NEGATORS & set(before)) and _asserts(low, phrase):
                    return True
    return False


@dataclass
class Check:
    raw_headline_correct: bool
    preferred_format: bool  # a factual headline with no yes/no opener
    wrong_record: bool
    body_ok: bool
    problems: list[str] = field(default_factory=list)

    @property
    def fallback(self) -> str:
        """"none", "headline" (headline replaced, body kept) or "full" (whole answer built from the record)."""
        if self.wrong_record or not self.body_ok:
            return "full"
        return "none" if self.raw_headline_correct else "headline"


def check_answer(scope: Scope, question: Mapping[str, Any], answer: Mapping[str, Any]) -> Check:
    resolved = is_resolved(question)
    inner = answer.get("answer") if isinstance(answer.get("answer"), Mapping) else answer
    headline = str(inner.get("headline") or "")
    body = " ".join([str(inner.get("summary") or "")] + [
        f"{i.get('text', '')} {i.get('detail') or ''}" for s in inner.get("sections") or [] for i in s.get("items") or []])
    problems: list[str] = []

    # Which Question the answer relies on: its Question cards. Citing only a different Question is a wrong record.
    cited = {i.get("record_id") for s in inner.get("sections") or [] for i in s.get("items") or []
             if i.get("record_type") in {"question", "blocking_question", "answered_question"}}
    wrong_record = bool(cited) and question["id"] not in cited
    if wrong_record:
        problems.append("relies on a different Question: " + ", ".join(sorted(str(c) for c in cited)))

    truth = "yes" if (scope.asks == "answered") == resolved else "no"
    opener = _opener(headline)
    opposite, own = (_SAYS_OPEN, _SAYS_RESOLVED) if resolved else (_SAYS_RESOLVED, _SAYS_OPEN)
    headline_ok = True
    if opener == "hedge":
        headline_ok = False
        problems.append("headline hedges a yes/no status")
    elif opener and opener != truth:
        headline_ok = False
        problems.append(f"headline opens with '{opener}' but the record's answer to what was asked is '{truth}'")
    # The opener clause ("Not in the sense of an unanswered question:") is judged as an opener above; the opposite
    # status is looked for in what the headline goes on to say.
    stated = re.split(r":|\s[—–-]\s", headline, maxsplit=1)[-1] if opener else headline
    if _states_opposite(stated, opposite, about_question=False):
        headline_ok = False
        problems.append("headline states the opposite status")
    if not opener and not _mentions(headline, own):
        headline_ok = False
        problems.append("headline does not state the status")

    body_ok = not _states_opposite(body, opposite, about_question=True)
    if not body_ok:
        problems.append("body states the opposite status")
    if resolved and question.get("answer"):  # an open Question's answer text is never required or shown
        answer_terms = identity_terms(str(question["answer"]))
        if answer_terms and len(answer_terms & identity_terms(body)) < 0.6 * len(answer_terms):
            body_ok = False
            problems.append("body does not carry the recorded answer")
    return Check(raw_headline_correct=headline_ok, preferred_format=not opener, wrong_record=wrong_record,
                 body_ok=body_ok, problems=problems)


# ---------------------------------------------------------------------------------------------- record-built answers

def neutral_headline(question: Mapping[str, Any]) -> str:
    resolved = is_resolved(question)
    return ("Recorded answer available: " if resolved else "Open question: ") + str(question.get("text", "")).strip()


def record_built_answer(question: Mapping[str, Any]) -> dict[str, Any]:
    """The whole answer from the record: no model text survives."""
    resolved = is_resolved(question)
    item = ({"text": question["text"], "record_type": "answered_question", "record_id": question["id"],
             "detail": "Answered: " + str(question["answer"]) if question.get("answer") else "Answered."}
            if resolved else
            {"text": question["text"], "record_type": "question", "record_id": question["id"], "detail": None})
    return {"job": "current_fact", "headline": neutral_headline(question),
            "summary": "State has a recorded answer for this Question." if resolved else "This Question is still open; no answer is recorded.",
            "sections": [{"kind": "questions", "title": "Question", "items": [item]}],
            "source_ids": [question["id"]], "uncertainty_ids": [] if resolved else [question["id"]],
            "suggested_refinements": [], "suggested_question": None}


def clarification_answer(candidates: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    items = [{"text": q["text"], "record_type": "answered_question" if is_resolved(q) else "question",
              "record_id": q["id"], "detail": None} for q in candidates]
    return {"job": "current_fact", "headline": "Which Question do you mean?",
            "summary": "More than one recorded Question could match. Ask again naming the one you mean.",
            "sections": [{"kind": "questions", "title": "Possible Questions", "items": items}],
            "source_ids": [q["id"] for q in candidates], "uncertainty_ids": [],
            "suggested_refinements": [], "suggested_question": None}


def apply(scope: Scope, question: Mapping[str, Any], answer: Mapping[str, Any]) -> tuple[dict[str, Any], Check]:
    """The answer to show and the check that decided it."""
    inner = dict(answer.get("answer") if isinstance(answer.get("answer"), Mapping) else answer)
    result = check_answer(scope, question, inner)
    if result.fallback == "full":
        return record_built_answer(question), result
    if result.fallback == "headline":
        inner["headline"] = neutral_headline(question)
    return inner, result
