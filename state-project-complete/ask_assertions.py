"""What a claim asserts, and whether its cited records carry the authority for it (#567, Paige Nov 11).

Replaces word rewriting. Software never edits a sentence the model wrote: each claim or card is shown as written,
withheld, or (for a model-worded record card) replaced by its record's own text. This module decides which, from what
the sentence asserts and the authority of the records it cites. Only two kinds of assertion need authority:

- status: something is settled now ("the terms are confirmed", "retention is resolved", "the budget is approved");
- permission: something may go ahead ("Security approval can proceed", "the data flow is cleared").

Everything else (a report of what a source said, a pending proposal, an open question, a negation or a denial, a
past status the sentence says was undone, a condition still to be met) is not checked here: those are the claim's
basis, which the chip shows and the reference check already verified.

Authority, by basis (the claim's primary record sets it; supporting records never raise it, but a Current State record
cited as support may carry a status in the clause that contrasts with it, as in "…, so the approved size remains 10"):
- current_state: a status must share most of its content words with a cited Current State record, and a permission
  needs a cited Current State record that itself grants one ("can proceed", "can begin", "approved for").
- answered_question: may say the Question was answered or resolved, state its recorded answer, and report who gave
  it; no permission.
- history: may state a past status ("was approved on Oct 3"); not a present status or a permission.
- evidence_says: may report what a source said or did ("Legal confirmed 30 days", "Legal reportedly confirmed…"); not
  a status in its own voice or a permission. Any basis may report a source it cites as support (Evidence or a Review):
  "Retention is not resolved yet: Legal reportedly confirmed 30 days…" on an open Question, citing the Evidence.
- pending_review, open_question, none: neither.

What software verifies, and what it does not:
- Verified: the sentence-level pattern (a settled word or go-ahead that is not negated, attributed, conditional or
  historical within its clause), the record's type and status, the overlap of content words with a Current State
  record, and that a Current State record grants some permission.
- Not verified: meaning. Word overlap is not entailment; a permission in the record may not cover the permission in
  the sentence ("implementation planning can begin" does not settle whether "work not dependent on retention can
  proceed"); a pattern can miss an unusual phrasing in either direction. Those stay with the model's interpretation,
  the chip a person sees, independent evals (eval/authority_wording.py does not import this module) and human review.

A failure withholds the unit and records why; it never rewrites it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

STATUS_WORDS = ("confirmed", "resolved", "approved", "decided", "established", "finalized", "final", "accepted",
                "settled", "agreed", "signed off", "confirms", "resolves", "approves", "settles")
_STATUS = re.compile(r"\b(?:" + "|".join(w.replace(" ", r"\s+") for w in STATUS_WORDS) + r")\b", re.I)
_PERMISSION = re.compile(
    r"\b(?:can|may|could|should)\s+(?:now\s+)?(?:proceed|move\s+forward|go\s+ahead|begin|start|launch|go\s+live)\b"
    r"|\b(?:is|are)\s+(?:now\s+)?(?:cleared|unblocked|allowed|permitted|free)\b"
    r"|\bno\s+longer\s+block(?:ed|s|ing)\b",
    re.I,
)
# A clause is the unit a negation or an attribution covers.
_CLAUSE_BREAK = re.compile(r"[;:]|(?<!\d),(?!\d)|\s[—–]\s|\b(?:but|so|while|although|though|whereas|because|therefore|thus|"
                           r"which\s+means|meaning)\b", re.I)
_NEGATION = re.compile(r"\b(?:not|no|never|nothing|none|neither|nor|without|cannot)\b|n['’]t\b", re.I)
# A status the clause makes conditional, proposed or required rather than asserting it.
_NOT_ASSERTED = re.compile(
    r"\b(?:whether|if|once|unless|until|would|pending|propos(?:e|es|ed|al)|awaiting|await|requires?|required|needs?|"
    r"needed|before|expected|planned|suggests?|appears?|might|asks?|asking|if\s+accepted|to\s+be|"
    # Nov 11 (steps 1-2 capture): a condition still to be met, not a status. "contingent on that Review being
    # accepted", "conditionally on the increase being approved", "subject to final approval", "assumes it is approved".
    r"contingent|conditional(?:ly)?|subject\s+to|provided\s+that|on\s+condition|assum(?:e|es|ed|ing)|"
    r"(?:should|must|will|could|may|might|can)(?:\s+only)?\s+be)\b", re.I)
_REPORTING = re.compile(
    r"\b(?:says|say|said|reports?|reported|reportedly|states?|stated|claims?|claimed|describes?|described|writes|wrote|"
    r"mentions?|mentioned|notes?\s+that|noted|according\s+to|per)\b", re.I)
_POSSESSIVE_SOURCE = re.compile(r"\b[A-Z][\w-]*['’]s\s+(?:\w+\s+){0,2}$")
_BE = re.compile(r"\b(?:is|are|was|were|be|been|being|has\s+been|have\s+been|had\s+been|remains?|stays?|looks?|"
                 r"seems?|becomes?|became)\s+(?:\w+ly\s+)?$", re.I)
_DETERMINER = re.compile(r"\b(?:the|a|an|this|that|these|those|its|their|our|your|any|all)\s+(?:\w+ly\s+)?$", re.I)
# "was approved", "was previously marked approved": a past status, at most two words between.
_PAST_STATUS = re.compile(r"\b(?:was|were|had\s+been)\s+(?:[\w-]+\s+){0,2}$", re.I)
_REVERSAL = re.compile(r"\b(?:re-?opened|reversed|revoked|withdrawn|rescinded|superseded|replaced|rolled\s+back|"
                       r"no\s+longer|later\s+changed|since\s+changed|was\s+changed|has\s+changed)\b", re.I)
# The clause denies the subject's status or record: "Confirmed retention terms are not recorded", "The approved pilot
# budget is not yet recorded in Current State". Only a status or record predicate counts: "The approved budget is not
# enough" still asserts approval.
_DENIED_AFTER = re.compile(
    r"^(?:\s+[\w'’$,.-]+){0,6}?\s+(?:(?:is|are|was|were|has|have)\s+(?:not|never)|isn['’]t|aren['’]t|wasn['’]t|"
    r"weren['’]t|hasn['’]t|haven['’]t)\s+(?!only\b)(?:yet\s+)?(?:been\s+)?(?:yet\s+)?(?:correct|accurate|true|right|valid|"
    r"established|recorded|confirmed|accepted|approved|resolved|settled|final|known|decided|in\s+current\s+state|"
    r"on\s+record|in\s+place|part\s+of\s+current\s+state)\b", re.I)
_PERMISSION_NEGATED = re.compile(
    r"\b(?:cannot|can\s+not|can['’]t|may\s+not|should\s+not|shouldn['’]t|is\s+not|isn['’]t|are\s+not|aren['’]t)\s+"
    r"(?:yet\s+)?(?:now\s+)?$|\b(?:nothing|no\s+\w+|none)\s+(?:\w+\s+){0,3}$", re.I)
_PERMISSION_GRANT = re.compile(
    r"\b(?:can|may)\s+(?:now\s+)?(?:proceed|begin|start|move\s+forward|go\s+ahead|launch)\b|\bapproved\s+for\b|"
    r"\b(?:is|are)\s+(?:allowed|permitted|cleared)\b|\bin\s+(?:the\s+)?(?:first-pilot\s+|pilot\s+)?scope\b", re.I)
_CONTENT = re.compile(r"[a-z][a-z-]{3,}")
_STOP = frozenset({
    "that", "this", "with", "from", "have", "been", "will", "were", "they", "their", "there", "which", "about", "into",
    "than", "then", "also", "only", "still", "current", "state", "record", "records", "recorded", "says", "said",
    "does", "until", "when", "what", "while", "now", *(w for w in STATUS_WORDS if " " not in w),
})


@dataclass(frozen=True)
class Assertion:
    kind: str          # "status" or "permission"
    clause: str
    phrase: str
    historical: bool = False   # a past status ("was approved")
    attributed: bool = False   # credited to a source in the clause ("Legal confirmed", "reportedly")


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: str | None = None          # why it was withheld
    assertions: tuple[Assertion, ...] = ()


def _clauses(text: str) -> list[str]:
    parts, start = [], 0
    for m in _CLAUSE_BREAK.finditer(text):
        parts.append(text[start:m.start()])
        start = m.end()
    parts.append(text[start:])
    return [p for p in parts if p.strip()]


def _status_assertions(clause: str, sentence: str = "") -> Iterable[Assertion]:
    for m in _STATUS.finditer(clause):
        before, after = clause[:m.start()], clause[m.end():]
        if before[-2:].lower() == "un" or (before and before[-1] == "-"):
            continue
        if _NEGATION.search(before) or _NOT_ASSERTED.search(before) or "?" in clause:
            continue
        if re.search(r"\bbeing\s+(?:\w+ly\s+)?$", before, re.I):
            continue          # "the Review being accepted": only directly before the word, not anywhere in the clause
        lead = before.strip()
        if _DENIED_AFTER.match(after):
            continue          # "Confirmed retention terms are not recorded"; "the premise that … is resolved is not correct"
        if re.search(r"\bmay\b", before, re.I):
            continue          # "new legal evidence may contradict the approved terms"
        if _PAST_STATUS.search(before) and _REVERSAL.search(sentence or clause):
            continue                                        # "was resolved previously, then reopened"
        attributed = bool(_REPORTING.search(before) or _POSSESSIVE_SOURCE.search(before)
                          or (lead and not _BE.search(before) and not _DETERMINER.search(before)
                              and re.match(r"\s+\w", after)))   # active voice: "Legal confirmed vendor retention"
        yield Assertion("status", clause.strip(), m.group(0), historical=bool(_PAST_STATUS.search(before)),
                        attributed=attributed)


def _permission_assertions(clause: str) -> Iterable[Assertion]:
    for m in _PERMISSION.finditer(clause):
        before = clause[:m.start()]
        if _PERMISSION_NEGATED.search(before) or re.search(r"\b(?:whether|if|once|unless|until)\b", before, re.I):
            continue
        if re.match(r"\bno\s+longer\b", m.group(0), re.I) and _NEGATION.search(before):
            continue
        yield Assertion("permission", clause.strip(), m.group(0))


def assertions(text: str) -> list[Assertion]:
    """The status and permission assertions a sentence makes in its own voice, clause by clause."""
    out: list[Assertion] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text or ""):
        for clause in _clauses(sentence):
            out.extend(_status_assertions(clause, sentence))
            out.extend(_permission_assertions(clause))
    return out


def _content(text: str) -> set[str]:
    return {w[:6] for w in _CONTENT.findall(text.lower()) if w not in _STOP}


def _covers(clause: str, phrase: str, statement: str) -> bool:
    words = _content(clause.replace(phrase, " "))
    return bool(words) and len(words & _content(statement)) * 2 >= len(words)


def check(text: str, basis: str, records: Mapping[str, Iterable[Mapping[str, Any]]]) -> Verdict:
    """Whether the claim's cited records carry the authority for what it asserts. `records` maps the kinds of cited
    record ("current_state", "answered_question") to the records cited (primary first, then supporting) that can
    carry authority; only the basis's own kind counts."""
    found = tuple(assertions(text))
    current_state = [str(r.get("statement") or "") for r in records.get("current_state", ())]
    answered = list(records.get("answered_question", ()))
    # A claim that contrasts its record with Current State cites that record as support (Paige, Nov 11): the contrast
    # clause may state Current State's status. It never changes the basis or the chip.
    supporting_state = [str(r.get("statement") or "") for r in records.get("supporting_current_state", ())]
    for a in found:
        if a.kind == "status" and basis != "current_state" and any(_covers(a.clause, a.phrase, s) for s in supporting_state):
            continue
        if a.kind == "permission":
            if basis == "current_state" and any(_PERMISSION_GRANT.search(s) for s in current_state):
                continue
            return Verdict(False, f"permission ({a.phrase!r}) with no Current State record that grants one", found)
        if basis == "current_state" and any(_covers(a.clause, a.phrase, s) for s in current_state):
            continue
        if basis == "answered_question" and answered:
            if re.match(r"(?:resolved|answered|closed|settled|decided)$", a.phrase, re.I) or any(
                    _covers(a.clause, a.phrase, f"{q.get('text', '')} {q.get('answer', '')}") for q in answered):
                continue
        if basis == "history" and a.historical:
            continue
        if a.attributed and (basis in ("evidence_says", "history", "pending_review", "answered_question")
                             or records.get("cited_sources")):
            continue    # a report of what a cited source said, whatever the claim's basis (Nov 11 capture, run 1)
        return Verdict(False, f"status ({a.phrase!r}) not carried by a {basis.replace('_', ' ')} basis", found)
    return Verdict(True, None, found)
