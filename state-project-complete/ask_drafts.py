"""Explicitly requested hypothetical drafts (#567, Paige Nov 11).

A user may ask Ask to draft something on an assumption ("Assume the 25% price increase goes through. Draft the customer
email announcing the new price."). The draft may then read naturally, as though the assumption holds, while the
assumption itself stays visible and never becomes a project fact. This module decides when that applies and checks
the draft's body; ask_service applies it to the one draft section of such an answer.

When it applies: the request (the user's words, read by software) has a drafting verb, an artifact and an assumption
marker, and the answer has a draft section. A refinement of that draft ("make it shorter") keeps the assumption, shown
as coming from the earlier request; any other later request does not inherit it. If the assumption can't be extracted
cleanly, the draft is still shown, with a line saying State couldn't tell what it assumes (never silently dropped).

What software writes: the draft's title ("Hypothetical email draft") and the assumption line, quoting the user:
"Hypothetical draft — assumes: ‘the 25% price increase goes through.’ This assumption is not established by State's
records." That last sentence only when software can support it (the assumption's figures are in a pending record and
in no Current State record, or, without figures, a pending record matches it and no Current State record does);
otherwise "State hasn't verified this assumption."

What the draft's body may and may not do:
- May write as though the assumption holds: a status or go-ahead about what the assumption covers.
- May not add anything beyond it: an approval or action credited to someone the assumption doesn't name ("Legal
  approved the increase"), a commitment ("we guarantee…"), or a date or figure State can't verify.
- Figures: each must be in the records or the request, or a calculation software verifies from them, with the same
  kind and unit and related wording ($61.25/month from $49/month × 1.25, with 25% in the request).

What is not verified: whether the extracted clause captures everything the user meant, and whether the draft's prose
is otherwise misleading. The assumption line, the eval and human review cover those.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Iterable, Mapping

import ask_assertions

_VERB = re.compile(r"\b(?:draft|write|compose|prepare|create|rewrite|redraft|revise)\b", re.I)
ARTIFACTS = ("press release", "slack message", "email", "e-mail", "message", "announcement", "memo", "letter", "post",
             "note", "update", "reply", "notice", "faq")
_ARTIFACT = re.compile(r"\b(" + "|".join(re.escape(a) for a in ARTIFACTS) + r")s?\b", re.I)
_MARKER = re.compile(r"\b(?:assume|assuming|suppose|supposing|imagine|pretend|hypothetically|as\s+if|if)\b", re.I)
_EXTRACT = (
    re.compile(r"\b(?:assume|assuming|suppose|supposing|imagine|pretend)\s+(?:that\s+)?(?P<a>[^.?!;]+)", re.I),
    re.compile(r"\bas\s+if\s+(?P<a>[^.?!;]+)", re.I),
    re.compile(r"\bif\s+(?P<a>[^,.?!;]+?)\s*(?:,|\bthen\b)", re.I),
    re.compile(r"\b(?:draft|write|compose|prepare|create)\b[^.?!]*?\bif\s+(?P<a>[^.?!;]+)", re.I),
)
_POLITE = re.compile(r"\bif\s+(?:possible|you\s+can|you\s+could|needed|necessary|so|helpful|you\s+don't\s+mind)\b", re.I)
_TRIM = re.compile(r",?\s+(?:and\s+|then\s+)?(?:draft|write|compose|prepare|create|rewrite|redraft|revise)\b.*$", re.I)
_EDIT = re.compile(r"\b(?:shorter|shorten|longer|formal|informal|tone|warmer|friendlier|simpler|simplify|rewrite|"
                   r"revise|edit|reword|polish|tighten|expand|bullet|subject\s+line|sign-?off|greeting)\b", re.I)


@dataclass(frozen=True)
class DraftRequest:
    artifact: str
    assumption: str | None          # the user's own words; None when it couldn't be extracted cleanly
    inherited: bool = False         # carried from the earlier request by a refinement of the draft

    @property
    def ambiguous(self) -> bool:
        return self.assumption is None


def _content(text: str) -> set[str]:
    return {w for w in ask_assertions._content(text) if w not in _ASSUMPTION_STOP}


_ASSUMPTION_STOP = frozenset({"goes", "throug", "happen", "happens", "passes", "proceed", "ahead", "gets"})


def hypothetical_request(query: str) -> DraftRequest | None:
    """A drafting request on an explicit assumption, or None. The assumption is the user's words, trimmed."""
    # "if possible", "if you can": politeness, not an assumption.
    query = _POLITE.sub(" ", query or "")
    artifact = _ARTIFACT.search(query)
    if not (_VERB.search(query) and artifact and _MARKER.search(query)):
        return None
    found = []
    for pattern in _EXTRACT:
        for m in pattern.finditer(query):
            text = _TRIM.sub("", m.group("a")).strip(" ,;:\"'“”‘’")
            # "assuming the price goes up and assuming Legal signs off": one assumption, the user's words joined.
            text = re.sub(r"\band\s+(?:assuming|assume|suppose|supposing)\s+(?:that\s+)?", "and ", text, flags=re.I)
            if text and text.lower() not in (f.lower() for f in found):
                found.append(text)
    found = [f for f in found if not any(f != g and f.lower() in g.lower() for g in found)]
    clean = found[0] if len(found) == 1 and 2 <= len(_content(found[0])) and len(found[0]) <= 160 else None
    return DraftRequest(artifact.group(1).lower().replace("e-mail", "email"), clean)


def previous_draft(previous_answer: Mapping[str, Any] | None) -> Mapping[str, Any] | None:
    answer = (previous_answer or {}).get("answer", previous_answer) if isinstance(previous_answer, Mapping) else None
    for section in (answer or {}).get("sections") or []:
        if isinstance(section, Mapping) and isinstance(section.get("hypothetical"), Mapping):
            return section
    return None


def draft_request(query: str, previous_answer: Mapping[str, Any] | None) -> DraftRequest | None:
    """This request's hypothetical draft, if any. A new assumption in the request wins; otherwise a refinement of the
    previous answer's hypothetical draft keeps that draft's assumption, marked as inherited. Any other request starts
    without one, so an assumption never carries into a question it no longer applies to."""
    fresh = hypothetical_request(query)
    if fresh:
        return fresh
    earlier = previous_draft(previous_answer)
    if not earlier or not _EDIT.search(query or "") or "?" in (query or ""):
        return None
    hyp = earlier["hypothetical"]
    assumption = hyp.get("assumption")
    assumption = str(assumption)[:160] if isinstance(assumption, str) and assumption.strip() else None
    artifact = str(hyp.get("artifact") or "draft")
    return DraftRequest(artifact if artifact in ARTIFACTS else "draft", assumption, inherited=True)


# --- the assumption line ------------------------------------------------------------------------------------------

def _record_texts(records: Iterable[Mapping[str, Any]], *keys: str) -> list[str]:
    return [" ".join(str(r.get(k) or "") for k in keys) for r in records]


def not_established(assumption: str, current_state: list[str], pending: list[str]) -> bool:
    """Software can support "not established by State's records": the assumption's figures are in a pending record
    and in no Current State record; or, if it names no figure, a pending record matches it and no Current State
    record does. Otherwise the line says State hasn't verified it."""
    from ask_claims import anchors
    numbers, months = anchors(assumption)
    if numbers or months:
        def has(text: str) -> bool:
            n, m = anchors(text)
            return numbers <= n and months <= m
        return any(has(t) for t in pending) and not any(has(t) for t in current_state)
    words = _content(assumption)

    def matches(text: str) -> bool:
        return bool(words) and len(words & _content(text)) * 2 >= len(words)
    return any(matches(t) for t in pending) and not any(matches(t) for t in current_state)


def title(req: DraftRequest) -> str:
    return f"Hypothetical {req.artifact} draft"


def assumption_line(req: DraftRequest, candidates: Mapping[str, Any]) -> str:
    if req.ambiguous:
        return ("Hypothetical draft — State couldn't tell exactly what this draft assumes from your request, and "
                "hasn't verified it.")
    state = _record_texts(candidates.get("state", []), "statement")
    pending = (_record_texts(candidates.get("reviews", []), "decision_question", "why_consequential", "proposed_statement",
                             "ai_proposed_statement", "proposal")
               + _record_texts(candidates.get("questions", []), "text", "blocks")
               + _record_texts(candidates.get("evidence", []), "content"))
    source = " (from your earlier request)" if req.inherited else ""
    verdict = ("This assumption is not established by State's records." if not_established(req.assumption, state, pending)
               else "State hasn't verified this assumption.")
    return f"Hypothetical draft — assumes{source}: ‘{req.assumption.rstrip('.')}.’ {verdict}"


NO_CONTEXT_NOTE = "No checked context from State's records about this assumption is shown here."
PART_WITHHELD_NOTE = ("Part of this draft went beyond your assumption, or named something State couldn't check, and "
                      "was left out.")
ALL_WITHHELD_NOTE = ("This draft went beyond your assumption, or named something State couldn't check, so it isn't "
                     "shown.")
CLARIFY_REFINEMENT = "Say what this draft should assume"


def relevant(req: DraftRequest, texts: Iterable[str]) -> bool:
    """Whether any shown, checked text speaks to the assumption (a shared content word or figure)."""
    if req.ambiguous:
        return True
    from ask_claims import anchors
    stems = lambda text: {w[:4] for w in ask_assertions._CONTENT.findall(text.lower()) if w not in ask_assertions._STOP}  # noqa: E731
    words = stems(req.assumption) - {"goes", "thro", "happ", "pass", "proc", "ahea", "gets"}
    numbers, _ = anchors(req.assumption)
    return any(words & stems(t) or numbers & anchors(t)[0] for t in texts)


# --- figures ------------------------------------------------------------------------------------------------------

_FIGURE = re.compile(
    r"(?P<cur>\$)?(?P<num>\d[\d,]*(?:\.\d+)?)(?P<pct>\s?%|\s?percent\b)?"
    r"(?P<unit>\s*(?:/|per\s+|a\s+|each\s+)(?:month|mo|year|yr|user|seat|week|day)s?\b)?", re.I)
_STEM = re.compile(r"[a-z]{4,}")
_FIGURE_STOP = frozenset({"from", "with", "will", "your", "that", "this", "have", "been", "month", "year", "change",
                          "changes", "changing", "effective", "starting", "today"})


@dataclass(frozen=True)
class Figure:
    kind: str           # "currency", "percent", "number"
    value: Decimal
    unit: str | None
    context: frozenset
    text: str


def figures(text: str) -> list[Figure]:
    out = []
    for m in _FIGURE.finditer(text or ""):
        if re.match(r"\d{4}-\d", text[m.start():m.start() + 6]):
            continue                                  # ISO dates are anchors, not figures
        try:
            value = Decimal(m.group("num").replace(",", ""))
        except InvalidOperation:
            continue
        kind = "currency" if m.group("cur") else "percent" if m.group("pct") else "number"
        unit = None
        if m.group("unit"):
            unit = re.sub(r"^(?:/|per|a|each)\s*", "", m.group("unit").strip().lower()).rstrip("s")
            unit = {"mo": "month", "yr": "year"}.get(unit, unit)
        window = text[max(0, m.start() - 50):m.end() + 50].lower()
        context = frozenset(w[:4] for w in _STEM.findall(window) if w not in _FIGURE_STOP)
        out.append(Figure(kind, value, unit, context, m.group(0).strip()))
    return out


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def figure_verified(target: Figure, sources: list[Figure], assumption_context: frozenset) -> bool:
    """Verbatim in the sources (same kind and value), or a calculation from them: a base of the same kind and a
    compatible unit, changed by a source percentage (× (1 ± p/100) or × p/100), or two such bases added or
    subtracted. A derived figure's nearby wording must share a word stem with its base's, or with the assumption."""
    if any(s.kind == target.kind and s.value == target.value for s in sources):
        return True
    if target.kind == "percent":
        return False
    compatible = [s for s in sources if s.kind == target.kind and (s.unit == target.unit or not s.unit or not target.unit)]
    related = lambda base: bool(target.context & (base.context | assumption_context))  # noqa: E731
    percents = [s.value for s in sources if s.kind == "percent"]
    t = _cents(target.value)
    for base in compatible:
        for p in percents:
            for candidate in (base.value * (1 + p / 100), base.value * (1 - p / 100), base.value * p / 100):
                if _cents(candidate) == t and related(base):
                    return True
        for other in compatible:
            if other is not base and _cents(abs(base.value - other.value)) == t and related(base):
                return True
            if other is not base and _cents(base.value + other.value) == t and related(base):
                return True
    return False


# --- the draft body -----------------------------------------------------------------------------------------------

_ACTION = re.compile(
    r"\b(?:has|have|had)\s+(?:already\s+)?(?:been\s+)?(?:signed|sent|completed|launched|deployed|notified|shipped|"
    r"implemented|reviewed|approved|confirmed|finalized|agreed)\b|\bsigned\s+off\b", re.I)
_COMMITMENT = re.compile(r"\b(?:we|the\s+company)\s+(?:guarantee|promise|commit\s+to|pledge)\b"
                         r"|\bwill\s+(?:refund|credit|compensate|honou?r|lock\s+in)\b|\bguaranteed?\b", re.I)
_SENTENCE_START = frozenset({"we", "our", "the", "this", "that", "these", "your", "you", "it", "its", "as", "from",
                             "starting", "effective", "hello", "hi", "dear", "thank", "thanks", "subject", "please"})


def _agent(clause: str, phrase: str) -> str | None:
    """Who the clause credits with the status or action: a capitalised name before it ("Legal approved") or after
    "by" ("approved by Legal")."""
    at = clause.lower().find(phrase.lower())
    by = re.search(r"\bby\s+(?:the\s+)?([A-Z][\w-]+)", clause[at:] if at >= 0 else clause)
    if by:
        return by.group(1)
    for word in re.findall(r"\b[A-Z][\w-]+\b", clause[:max(at, 0)]):
        if word.lower() not in _SENTENCE_START:
            return word
    return None


def check_body(text: str, req: DraftRequest, source_texts: list[str]) -> ask_assertions.Verdict:
    """The draft body may write as though the assumption holds, and nothing more."""
    from ask_claims import anchors
    assumption = req.assumption or ""
    sources = [f for t in [*source_texts, assumption] for f in figures(t)]
    assumption_context = frozenset(w[:4] for w in _STEM.findall(assumption.lower()))
    for figure in figures(text):
        if not figure_verified(figure, sources, assumption_context):
            return ask_assertions.Verdict(False, f"figure {figure.text!r} is not in the records or the request, and "
                                                 "is not a calculation software could verify from them")
    _numbers, months = anchors(text)
    known_months: set[int] = set()
    for t in [*source_texts, assumption]:
        known_months |= anchors(t)[1]
    if not months <= known_months:
        return ask_assertions.Verdict(False, "a date or month that is not in the records or the request")
    if m := _COMMITMENT.search(text):
        if not re.search(re.escape(m.group(0)), assumption, re.I):
            return ask_assertions.Verdict(False, f"a commitment ({m.group(0)!r}) the assumption doesn't make")
    found = list(ask_assertions.assertions(text))
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        for m in _ACTION.finditer(sentence):
            found.append(ask_assertions.Assertion("action", sentence.strip(), m.group(0)))
    for a in found:
        if req.ambiguous:
            return ask_assertions.Verdict(False, f"{a.kind} ({a.phrase!r}) in a draft whose assumption is unclear",
                                          tuple(found))
        agent = _agent(a.clause, a.phrase)
        if agent and agent.lower() not in assumption.lower():
            return ask_assertions.Verdict(False, f"{a.kind} ({a.phrase!r}) credited to {agent}, beyond the assumption",
                                          tuple(found))
        # The part of the clause the status or action is in ("The price increase has been approved and takes effect
        # with your next bill": the first part), so neighbouring wording doesn't count against it.
        part = next((p for p in re.split(r",|;|\band\b", a.clause) if a.phrase.lower() in p.lower()), a.clause)
        if not ask_assertions._covers(part, a.phrase, assumption):
            return ask_assertions.Verdict(False, f"{a.kind} ({a.phrase!r}) beyond the assumption", tuple(found))
    return ask_assertions.Verdict(True, None, tuple(found))
