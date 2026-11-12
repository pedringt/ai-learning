"""Ask answer wording guards (moved verbatim from ask_service.py in #452).

Keeps an Ask answer from presenting pending or proposed material as settled: softens
"confirmed / decided / established" wording that no accepted Current State item supports,
and strips internal record ids and JSON field names from visible answer text. Part of
Ask's pending-vs-confirmed authority boundary; see ask_service._validate_synthesis.
"""
from __future__ import annotations

import re
from typing import Mapping


def _match_case(replacement: str, matched: str) -> str:
    if matched.isupper():
        return replacement.upper()
    if matched[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


# Shared between the headline/title backstop and the full-prose backstop
# below: a piece of text containing one of these is already correctly
# hedged and must be left completely alone by either backstop. Defined once
# up here after a real bug caught this on a live run: the headline backstop
# used to swap "resolved" unconditionally, and mangled an already-correct
# "Retention is not yet resolved" into the nonsensical "not yet pending".
_PENDING_HEDGE_PHRASES = (
    "evidence says", "evidence reports", "pending review", "pending human review", "awaiting review",
    "not yet confirmed", "not yet accepted", "not yet established", "not yet approved",
    "not yet decided", "not yet resolved", "still open", "still pending",
    "remains open", "remains unresolved", "remains unaccepted", "proposed",
    "suggests", "appears to", "reportedly", "reported to", "is reported",
)

# "not yet resolved" above only catches that one exact phrase. In practice a
# model negates a target word in several equally valid ways the fixed phrase
# list can never fully enumerate -- "not resolved yet", "not confirmed
# retention yet", "does not treat retention as resolved" -- and each one
# missed by the list let the word-replacement regexes below run anyway and
# garble an already-correct, already-hedged sentence (live staging QA,
# 2026-09-13 found two of these in the same answer). Generic rule instead of
# another fixed phrase: if a negation appears anywhere before one of the
# target words in the sentence, the claim is already negated and the whole
# sentence is left alone, regardless of how many words or what verb sits in
# between. This is deliberately broader than a bounded word-count window --
# every reported garbling case so far came from under-matching an
# already-hedged sentence, never from over-matching one that genuinely needed
# the replacement, so the safer failure mode here is to skip a sentence, not
# to mangle it.
# Oct 16: "cannot" is one word, so \bnot\b never matched it and "launch readiness cannot be
# considered established" became "...cannot be considered proposed (not yet established)".
_NEGATION_RE = re.compile(
    r"\bnot\b|\bcannot\b|n['’]t\b"
    # Oct 16 (adversarial suite): "no Review, History entry, or Evidence showing that this date was formally
    # approved" became "...formally proposed for approval (not yet approved)". "No" counts only before a
    # record noun, so "No, it's approved" is still softened.
    r"|\bno\s+(?:[\w,]+\s+){0,3}?(?:record|records|review|reviews|evidence|entry|entries|history|document|indication)\b"
    # Oct 27 (production Ask): the headline "No confirmed pilot budget is recorded yet" became "No reported
    # pilot budget...", which contradicted its own summary. "No" directly before the settled word (or one
    # -ly adverb and the word) negates it.
    r"|\bno\s+(?:\w+ly\s+)?(?=(?:confirmed|resolved|established|approved|decided|known)\b)",
    re.I,
)
_SETTLED_TARGET_WORD_RE = re.compile(
    r"\b(?:confirmed|resolved|resolves|established|approved|decided|known|blocking)\b", re.I
)


def _hedged_by_phrase(text: str) -> bool:
    lowered = text.lower()
    return any(hedge in lowered for hedge in _PENDING_HEDGE_PHRASES)


# #656 (Nov 11 retention capture): two negations the rule above missed, so a correct sentence was rewritten
# into a false one. "No retention or deletion term is established as accepted project fact" became "...is proposed
# (not yet established)..." ("no" governs the subject, not the word), and "The premise that retention is resolved is
# not correct" became "The premise that retention is reported (not yet resolved) is not correct" (the denial comes
# after the word). The second form counts only when the negated predicate denies the subject's status or truth,
# within the same clause: "The approved budget is not enough" still asserts approval.
_NO_SUBJECT_RE = re.compile(
    r"\b(?:no|nothing|none)\s+(?!doubt\b)(?:[\w'’-]+\s+){0,6}?(?:is|are|was|were|has\s+been|have\s+been)\s+(?:\w+ly\s+)?"
    r"(?=(?:confirmed|resolved|established|approved|decided|known)\b)",
    re.I,
)
_STATUS_DENIED_AFTER_RE = re.compile(
    r"^(?:\s+[\w'’-]+){0,5}?\s+(?:(?:is|are|was|were|has|have)\s+(?:not|never)|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|"
    r"hasn['’]t|haven['’]t)\s+(?!only\b)(?:yet\s+)?(?:been\s+)?(?:yet\s+)?(?:correct|accurate|true|right|valid|established|"
    r"recorded|confirmed|accepted|approved|resolved|settled|final|known|decided|in\s+current\s+state|on\s+record|in\s+place)\b",
    re.I,
)


def _negated(text: str) -> bool:
    lowered = text.lower()
    negation = _NEGATION_RE.search(lowered)
    if negation and _SETTLED_TARGET_WORD_RE.search(lowered, negation.end()):
        return True
    if _NO_SUBJECT_RE.search(lowered):
        return True
    return any(_status_denied_after(lowered, m) for m in _SETTLED_TARGET_WORD_RE.finditer(lowered))


# A definite noun phrase ("the approved budget has not been recorded") still refers to a thing a source called
# approved, so it keeps the Evidence qualifier (#567, Oct 28). The denial-after form covers a bare noun phrase that
# opens the clause ("Confirmed retention terms are not recorded") and a word inside a that-clause the sentence denies
# ("the premise that retention is resolved is not correct").
_DEFINITE_RE = re.compile(r"\b(?:the|that|this|these|those|its|their|a|an|our|your)\s+$")


def _status_denied_after(lowered: str, match: "re.Match[str]") -> bool:
    lead = re.split(r"[,;:]|\b(?:and|but|so|while|because)\b", lowered[:match.start()])[-1]
    predicative = re.search(r"\b(?:is|are|was|were|be|been)\s+$", lead) and re.search(r"\bthat\b", lead)
    bare = not lead.strip() or re.fullmatch(r"\s*(?:no|any)\s+", lead)
    if not (predicative or bare) or _DEFINITE_RE.search(lead):
        return False
    after = re.split(r"[,;:]|\b(?:and|but|so|while|because)\b", lowered[match.end():])[0]
    return bool(_STATUS_DENIED_AFTER_RE.match(after))


# #656: "The Question was resolved previously, then reopened" became "...was reported (not yet resolved)
# previously...". A past-tense status that the same sentence says was later undone is history, not a claim that it
# holds now. Only a reversal counts: "The budget was approved earlier this week" is still a claim of approval.
_PAST_STATUS_RE = re.compile(
    r"\b(?:was|were|had\s+been)\s+(?:\w+ly\s+)?(?:confirmed|resolved|established|approved|decided)\b", re.I)
_REVERSAL_RE = re.compile(
    r"\b(?:re-?opened|reversed|revoked|withdrawn|rescinded|superseded|replaced|rolled\s+back|no\s+longer|"
    r"later\s+changed|has\s+since\s+changed|since\s+reopened)\b", re.I)


def _historical(text: str) -> bool:
    past = _PAST_STATUS_RE.search(text)
    return bool(past and _REVERSAL_RE.search(text, past.end()))


def _already_hedged(text: str) -> bool:
    return _hedged_by_phrase(text) or _negated(text) or _historical(text)


# #474: a negation only covers its own clause in prose. Cowork, Oct 9: "This conflicts
# with Current State (: Support Slack not approved; ...) and approved vendor data (: 30
# days)" was skipped whole because of the "not approved" inside the parenthesis, so
# "approved vendor data" (an unconfirmed vendor claim) went out as settled. Hedge
# phrases ("proposed", "pending review", ...) still cover the whole sentence.
_CLAUSE_SPLIT_RE = re.compile(r"(;|\(|\)|\s[—–]\s)")


_SETTLED_WORD_REPLACEMENTS = (
    (re.compile(r"\(\s*confirmed\s*\)", re.I), lambda m: ""),
    (re.compile(r"\(\s*resolved\s*\)", re.I), lambda m: ""),
    (re.compile(r"\bconfirmed\b", re.I), lambda m: _match_case("reported", m.group(0))),
    (re.compile(r"\bresolved\b", re.I), lambda m: _match_case("pending", m.group(0))),
)


_HEADLINE_EVIDENCE_WORD_RE = re.compile(r"\b(?:approved|decided|established)\b", re.I)
_HEADLINE_MAX = 180  # AskSynthesis.headline's max_length


def _soften_unearned_settled_words(value: str | None, evidence=()) -> str | None:
    """Headlines and section titles are the one place the model reliably
    keeps reaching for "Confirmed"/"Resolved" as a compact status badge
    (e.g. "Retention Terms: Legal Confirmed", "Confirmed Retention and
    Deletion") even when full-sentence prose elsewhere in the same answer
    correctly hedges ("not yet confirmed", "awaiting review"). Found via
    live QA (2026-09-07, then again 2026-09-12): the _grounding_rules()
    instruction banning this explicitly, including for short labels, still
    left the model non-compliant on a live provider often enough (~0% pass
    in a repeated live check) that prompt wording alone isn't sufficient
    here -- this is the deterministic backstop. Only called when the
    answer's own selected context actually includes an open Review or open
    Question (has_pending_material in _validate_synthesis), so a genuinely
    fully-settled answer's headline is never touched. Checks for an
    existing hedge first (see _already_hedged) so an already-correct
    headline is never touched either.
    """
    if not value:
        return value
    if _already_hedged(value):
        return value
    text = value
    for pattern, replacement in _SETTLED_WORD_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    # #567: a headline's "Approved pilot budget is $40,000" was left as a flat claim while the summary
    # denied it. An Evidence-backed approved / decided / established gets the same qualifier as prose
    # ("confirmed" is already rewritten to "reported" above), shortened if the headline would run long.
    for qualifier in (EVIDENCE_QUALIFIER, _SHORT_EVIDENCE_QUALIFIER):
        candidate = _HEADLINE_EVIDENCE_WORD_RE.sub(
            lambda m, q=qualifier, t=text: m.group(0) + q if _evidence_backed(t, m, evidence) else m.group(0), text)
        if len(candidate) <= _HEADLINE_MAX:
            text = candidate
            break
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—:;,.")
    return text or value


# Full-sentence prose companion to _soften_unearned_settled_words. Live
# testing after the headline/title fix (2026-09-12) still found unhedged
# claims occasionally slipping into prose (summary, free-text items) --
# narrower in scope than the headline fix on purpose, per explicit
# direction: only rewrite a sentence that both (a) contains one of these
# settled-sounding words/phrases and (b) is not already hedged per
# _already_hedged above. A sentence that already hedges ("not yet
# confirmed", "pending review") is left completely alone -- this must
# never touch or garble a sentence the model already got right.
_UNEARNED_SETTLED_PROSE_REPLACEMENTS = (
    # A Review's own resolution status is a different claim from a State
    # claim the generic word replacements below are built for. "The launch
    # date is decided" -> "the launch date is proposed (not yet decided)"
    # reads fine because a proposed *value* makes sense; the same template
    # applied to "that Review is decided" instead claims the Review itself
    # "is proposed" (as if it hadn't been created yet), which is nonsense --
    # the Review already exists and is open; what's unsettled is its
    # resolution. Matched and replaced first, with wording that reuses none
    # of the other patterns' target words, so it can never be reprocessed by
    # a later pattern in this same pass. Live staging QA, 2026-09-13: "Until
    # that Review is proposed (not yet decided)..." was the exact garble.
    (
        re.compile(r"\b(the|that|this)\s+review\s+(?:is|has\s+been)\s+(?:decided|resolved|confirmed|approved)\b", re.I),
        lambda m: f"{m.group(1)} Review remains open",
    ),
    (re.compile(r"\bhas\s+confirmed\b", re.I), lambda m: _match_case("is reported to have said", m.group(0))),
    (re.compile(r"\bconfirmed\b", re.I), lambda m: _match_case("reported (pending Review)", m.group(0))),
    (re.compile(r"\bresolves\b", re.I), lambda m: _match_case("may address (Review still open)", m.group(0))),
    # "reportedly addressed, pending Review" (through 2026-09-13) read as an
    # awkward, wordy comma-splice wherever it landed ("these are reportedly
    # addressed, pending Review"). Restyled to the same short "X (not yet Y)"
    # template already used for established/approved/decided/known below, so
    # the whole family reads consistently and slots cleanly into a sentence.
    (re.compile(r"\bresolved\b", re.I), lambda m: _match_case("reported (not yet resolved)", m.group(0))),
    (re.compile(r"\bestablished\b", re.I), lambda m: _match_case("proposed (not yet established)", m.group(0))),
    (re.compile(r"\bapproved\b", re.I), lambda m: _match_case("proposed for approval (not yet approved)", m.group(0))),
    (re.compile(r"\bdecided\b", re.I), lambda m: _match_case("proposed (not yet decided)", m.group(0))),
    # #474: "the 30-day term on record" for a vendor claim that is not in Current State.
    (re.compile(r"\bon record\b", re.I), lambda m: _match_case("reported (not in Current State)", m.group(0))),
    (re.compile(r"\bnow\s+known\b", re.I), lambda m: _match_case("reported (not yet confirmed)", m.group(0))),
    (re.compile(r"\bno\s+longer\s+blocking\b", re.I), lambda m: _match_case("reported as potentially no longer blocking, pending Review", m.group(0))),
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

_WORD_RE = re.compile(r"[a-z0-9]+")


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


class _GoverningState(frozenset):
    """The three-word runs of the governing statements, plus each statement's words and
    numbers for the attributive check below (#473). Still a frozenset, so callers and
    tests that only need the runs are unaffected."""

    statements: tuple = ()


_NUMBER_RE = re.compile(r"\d[\d,.]*\d|\d")

# A settled word followed by a noun and not preceded by one of these is attributive:
# "the approved move budget", "earlier approved terms", "and approved vendor data".
# Attributive use points at a thing rather than asserting a new status ("the budget is
# approved at $95,000").
_PREDICATIVE_LEADS = frozenset({
    "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "get", "gets", "got",
})
_NOT_A_NOUN = frozenset({
    "by", "for", "in", "at", "on", "to", "and", "or", "as", "with", "until", "under", "from",
    "after", "before", "because", "but", "so", "if", "that", "which", "is", "are", "was", "were",
})
_ATTRIBUTIVE_REPLACEMENTS = {"approved": "proposed (not yet approved)"}


def _numbers(text: str) -> set:
    return {n.replace(",", "").rstrip(".") for n in _NUMBER_RE.findall(text)}


def _attributive(text: str, match: "re.Match[str]") -> str | None:
    """The noun right after an attributive settled word, or None if the use is not attributive."""
    before = _words(text[:match.start()])[-1:]
    after = _words(text[match.end():])[:1]
    if not after or (before and before[0] in _PREDICATIVE_LEADS):
        return None
    noun = after[0]
    if noun in _NOT_A_NOUN or noun.isdigit() or len(noun) < 3:
        return None
    return noun


def _refers_to_governing_state(text: str, match: "re.Match[str]", governing) -> bool:
    """#473: "Current State records the approved move budget at $85,000" paraphrases the
    governing fact "The move budget is approved at $85,000…" without sharing a three-word
    run, and was rewritten into "the proposed for approval (not yet approved) move budget".
    An attributive settled word is spared when a governing statement uses the same word
    about the same noun and every number in the sentence appears in that statement, so
    "the approved move budget of $95,000" (a pending Review's figure) is still softened."""
    statements = getattr(governing, "statements", ())
    word = match.group(0).lower()
    if word == "on record":
        # "the $85,000 budget on record" names the thing on record just before it.
        before = [w for w in _words(text[:match.start()]) if not w.isdigit()][-1:]
        numbers = _numbers(text)
        return bool(before) and any(before[0] in tokens and numbers <= statement_numbers
                                    for tokens, statement_numbers, _grams in statements)
    noun = _attributive(text, match)
    if not statements or not noun:
        return False
    numbers = _numbers(text)
    # #656: the noun phrase, not one word of it: "the approved Support Slack source" is not "approved support
    # material". Up to two words after the settled word must all be in the statement.
    phrase = [w for w in _words(text[match.end():])[:2] if w not in _NOT_A_NOUN and not w.isdigit()]
    phrase = phrase[:2] if len(phrase) == 2 and phrase[0] == noun else [noun]
    # #656: "Support Slack is not an approved retrieval source" uses the word to deny it; it never spares it.
    return any(word in tokens and all(w in tokens for w in phrase) and numbers <= statement_numbers
               and not any(g[0] in ("not", "no") and word in g for g in grams)
               for tokens, statement_numbers, grams in statements)


def _stem(word: str) -> str:
    return word[:5]


def _modified_noun(text: str, match: "re.Match[str]") -> str | None:
    """The noun an attributive settled word modifies, reading through a hyphen compound: "approved-knowledge
    grounding" modifies "grounding"."""
    rest = text[match.end():]
    if rest.startswith("-"):
        rest = re.sub(r"^-[\w]+", "", rest)
    words = [w for w in _words(rest)[:3] if w not in _NOT_A_NOUN and not w.isdigit() and len(w) >= 3]
    return words[0] if words else None


def _names_accepted_thing(text: str, match: "re.Match[str]", governing) -> str | None:
    """#656: "approved-knowledge grounding" paraphrases the governing "grounded in approved support material", and
    "the approved evaluation direction" names the evaluation approach Current State records, but both were rewritten
    to say the thing is "not yet approved". Returns how to word the match instead, or None to soften as before:
    - the word itself, when a governing statement uses the same word about the same noun (stems compared);
    - "" (drop the adjective, never deny it) when a governing statement names the noun without that word and does
      not deny it. The sentence then makes no approval claim either way.
    A sentence whose figures are not in that statement (a pending Review's $95,000) is still softened."""
    statements = getattr(governing, "statements", ())
    if not statements:
        return None
    before = _words(text[:match.start()])[-1:]
    if before and before[0] in _PREDICATIVE_LEADS:
        return None
    noun = _modified_noun(text, match)
    if not noun:
        return None
    word = match.group(0).lower()
    numbers = _numbers(text)
    naming = [(tokens, grams) for tokens, statement_numbers, grams in statements
              if numbers <= statement_numbers and any(_stem(t) == _stem(noun) for t in tokens)]
    # "Support Slack is not an approved retrieval source": Current State denies the word about this thing.
    if any(g[0] in ("not", "no") and word in g for _tokens, grams in naming for g in grams):
        return None
    if any(word in tokens for tokens, _grams in naming):
        return match.group(0)
    return "" if naming else None


def _governing_state_ngrams(statements) -> frozenset:
    """Every three-word run in the governing Current State statements (#227).

    The prose backstop below rewrites settled-sounding words because Ask must not
    narrate *pending* material as settled. A sentence that is quoting an approved,
    governing Current State item is not doing that, and rewriting it makes Ask tell
    the reader an established fact is not yet established. Three words is
    deliberately more than a coincidence: "approved enterprise terms" from the state
    statement protects a sentence quoting it, while "the terms are approved" (a claim
    about something pending) shares no such run and is still softened. Comparison is
    on lowercased alphanumeric words, so case, hyphens and punctuation don't matter.
    """
    grams: set = set()
    parsed = []
    for statement in statements:
        tokens = _words(statement or "")
        grams.update(zip(tokens, tokens[1:], tokens[2:]))
        parsed.append((frozenset(tokens), _numbers(statement or ""), frozenset(zip(tokens, tokens[1:], tokens[2:]))))
    governing = _GoverningState(grams)
    governing.statements = tuple(parsed)
    return governing


def _quotes_governing_state(text: str, match: "re.Match[str]", governing_ngrams: frozenset) -> bool:
    """True if a three-word run around `match` appears in a governing state statement.

    #473: the run alone is not enough when the sentence carries numbers. "The move budget
    is approved at $95,000" shares "budget is approved" with the governing "...approved at
    $85,000" but restates a pending Review's figure, so every number in the sentence must
    also appear in a statement containing the run."""
    if not governing_ngrams:
        return False
    statements = getattr(governing_ngrams, "statements", ())
    numbers = _numbers(text)

    def quoted(gram) -> bool:
        if gram not in governing_ngrams:
            return False
        if not numbers or not statements:
            return True
        return any(gram in grams and numbers <= statement_numbers for _t, statement_numbers, grams in statements)

    before = _words(text[:match.start()])[-2:]
    inside = _words(match.group(0))
    after = _words(text[match.end():])[:2]
    sequence = before + inside + after
    first, end = len(before), len(before) + len(inside)
    for start in range(max(0, first - 2), end):
        gram = tuple(sequence[start:start + 3])
        if len(gram) == 3 and start + 3 > first and quoted(gram):
            return True
    return False


# Oct 16 (eval matrix output excerpts): an answer restating an open Question, "the question of
# whether Security has approved the production data path is open", became "whether Security has
# proposed for approval (not yet approved) the production data path". A word inside a "whether"
# clause, or in a sentence that is itself a question, asks about a status rather than claiming it.
_WHETHER_RE = re.compile(r"\bwhether\b", re.I)


# Oct 27 (production Ask, Northstar budget): "Evidence from the Q3 planning session reports the pilot
# budget as approved at $40,000" became "...reports the pilot budget as proposed for approval (not yet
# approved)...", and the quoted Review title "Is the approved pilot budget ready to be recorded?" was
# rewritten inside its quotes. Both changed what a source said. A settled word is spared when a reporting
# verb earlier in the same clause attributes it to a source, with no comma or conjunction in between
# ("the note says the budget was approved"), or when it sits inside quotation marks. Attribution to State's
# own record is not spared: "Current State says the terms are approved" is the claim the backstop guards.
_REPORTING_VERB_RE = re.compile(
    r"\b(?:says|said|reports|reported|states|stated|claims|claimed|describes|described|writes|wrote|"
    r"mentions|mentioned|notes\s+that|noted\s+that|according\s+to)\b",
    re.I,
)
_ATTRIBUTION_BREAK_RE = re.compile(r",|;|\b(?:and|but|so|while|although|though|because)\b", re.I)
# Only the few words right before the verb name who is speaking: "The only relevant record is an open Review
# noting that the Q3 note says..." is attributed to the note, not to a record (Oct 27 eval matrix, #566).
_STATE_RECORD_SUBJECT_RE = re.compile(r"\b(?:current\s+state|state|history|we)\b", re.I)
# "the record says" is State's own record; "an evidence record reports" is a source (#569 diagnosis, Oct 27).
_SOURCE_RECORD_RE = re.compile(
    r"\b(?:evidence|note|email|message|transcript|minutes|session|meeting|vendor|source|document)\s+records?\b", re.I
)
_RECORD_RE = re.compile(r"\brecords?\b", re.I)
_SUBJECT_WORDS = 4
# #566 (Oct 27 eval matrix): the model also credits a source without a verb: "the Q3 planning session note's
# figure (approved at $40,000...)", "the note's statement — pilot budget approved at...", "the note's figure,
# approved at...", "the note's statement of a $40,000 approved budget". A source document's possessive
# reporting noun attributes what follows it, through a parenthesis, a dash, a colon or one comma right after
# the noun. "The vendor's retention terms are approved" is still softened: terms are not a reporting noun.
_SOURCE_POSSESSIVE_RE = re.compile(
    r"\b(?:note|notes|email|message|evidence|transcript|minutes|session|meeting|recap|document|source|memo|"
    r"ticket|update|vendor|review)['’]s?\s+(?:\w+\s+)?(?:figure|statement|claim|wording|number|amount|text|"
    r"description|report|account|summary|proposal|version|quote)\b",
    re.I,
)
_POSSESSIVE_BREAK_RE = re.compile(r";|\b(?:and|but|so|while|although|though|because)\b", re.I)
_NUMBER_WITH_COMMAS_RE = re.compile(r"\d(?:[\d,.]*\d)?")
_QUOTED_SPAN_RE = re.compile(r"[“\"][^”\"]+[”\"]|(?<![\w’'])['‘][^'’]+['’](?![\w])")


def _attributed_to_a_source(prefix: str) -> bool:
    """True if `prefix`, the sentence text before a settled word (back to the last ";"), credits it to a source."""
    verb = None
    for verb in _REPORTING_VERB_RE.finditer(prefix):
        pass
    # A comma inside "$40,000" is not a clause break (#569 diagnosis, Oct 27).
    if verb and not _ATTRIBUTION_BREAK_RE.search(_NUMBER_WITH_COMMAS_RE.sub("0", prefix[verb.end():])):
        subject = " ".join(_words(prefix[:verb.start()])[-_SUBJECT_WORDS:])
        names_state_record = _RECORD_RE.search(subject) and not _SOURCE_RECORD_RE.search(subject)
        if not _STATE_RECORD_SUBJECT_RE.search(subject) and not names_state_record:
            return True
    noun = None
    for noun in _SOURCE_POSSESSIVE_RE.finditer(prefix):
        pass
    if not noun:
        return False
    between = _NUMBER_WITH_COMMAS_RE.sub("0", prefix[noun.end():])
    if _POSSESSIVE_BREAK_RE.search(between):
        return False
    commas = between.count(",")
    return commas == 0 or (commas == 1 and between.lstrip().startswith(","))


def _inside_quotes(text: str, match: "re.Match[str]") -> bool:
    return any(span.start() < match.start() and match.end() < span.end() for span in _QUOTED_SPAN_RE.finditer(text))


# #567 (Oct 28): when the selected Evidence itself says "approved" (or decided / established /
# confirmed), denying it ("proposed (not yet approved)") makes the answer contradict its source,
# whatever the phrasing ("the approved budget has not been recorded", "..., per the Q3 note").
# Such a word is qualified instead: true to the source, and still clear it is not Current State.
_EVIDENCE_QUALIFIED_WORDS = frozenset({"approved", "decided", "established", "confirmed"})
EVIDENCE_QUALIFIER = " (per Evidence, not in Current State)"
_SHORT_EVIDENCE_QUALIFIER = " (per Evidence)"
_CONTEXT_WORDS = 4
_STOP = frozenset({
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "by", "is", "are", "was", "were",
    "be", "been", "has", "have", "had", "that", "this", "with", "as", "it", "its", "not", "yet", "per",
})


class _EvidenceBacking(tuple):
    """(word set, numbers) for each Evidence text an Ask answer may be quoting."""


def _evidence_backing(texts) -> _EvidenceBacking:
    return _EvidenceBacking((frozenset(_words(t or "")), _numbers(t or "")) for t in texts if t)


def _evidence_backed(text: str, match: "re.Match[str]", evidence) -> bool:
    """True if a selected Evidence record uses the same settled word about the same thing: every
    number in the clause is in it, and a nearby content word (four words either side) is too."""
    word = match.group(0).lower()
    if word not in _EVIDENCE_QUALIFIED_WORDS or not evidence:
        return False
    numbers = _numbers(text)
    near = [w for w in _words(text[:match.start()])[-_CONTEXT_WORDS:] + _words(text[match.end():])[:_CONTEXT_WORDS]
            if len(w) > 3 and w not in _STOP and not w.isdigit()]
    return any(word in tokens and numbers <= ev_numbers and any(w in tokens for w in near)
               for tokens, ev_numbers in evidence)


def _soften_match(text: str, match: "re.Match[str]", replacement, governing, lead: str = "", evidence=()) -> str:
    if _quotes_governing_state(text, match, governing) or _refers_to_governing_state(text, match, governing):
        return match.group(0)
    if _inside_quotes(text, match) or _attributed_to_a_source(lead + text[:match.start()]):
        return match.group(0)
    whether = None
    for whether in _WHETHER_RE.finditer(text[:match.start()]):
        pass
    if whether and "," not in text[whether.end():match.start()]:
        # "Whether or not Legal agrees, the terms are approved" still claims approval.
        return match.group(0)
    if _evidence_backed(text, match, evidence):
        return match.group(0) + EVIDENCE_QUALIFIER
    accepted = _names_accepted_thing(text, match, governing) if match.group(0).lower() in _ATTRIBUTIVE_REPLACEMENTS else None
    if accepted is not None:
        return accepted
    attributive = _ATTRIBUTIVE_REPLACEMENTS.get(match.group(0).lower())
    if attributive and _attributive(text, match):
        # "the approved move budget" -> "the proposed (not yet approved) move budget",
        # not the ungrammatical "the proposed for approval (not yet approved) move budget".
        return _match_case(attributive, match.group(0))
    return replacement(match)


# #656: "Retention is resolved, so Security approval can proceed" became "Retention is reported (not yet resolved),
# so Security approval can proceed": the premise was qualified, but the go-ahead drawn from it still reached the
# reader. The same holds when the premise is attributed to a source ("Legal reportedly confirmed 30 days, so...").
# A consequence clause that grants a go-ahead is removed from such a sentence; the premise stays. A negated go-ahead
# ("so approval cannot proceed") is not one, and a sentence whose premise is itself negated ("Retention is not
# resolved, so only independent work can proceed") is left alone.
_CONSEQUENCE_RE = re.compile(r"[,;]?\s*\b(?:so|therefore|thus|hence|which\s+means|meaning)\b(?P<rest>[^.;]*)", re.I)
_GO_AHEAD_RE = re.compile(
    r"\b(?:can|may|could|should)\s+(?:now\s+)?(?:proceed|move\s+forward|go\s+ahead|begin|start|launch)\b"
    r"|\b(?:is|are)\s+(?:now\s+)?(?:approved|cleared|unblocked|settled|final)\b",
    re.I,
)
_ATTRIBUTION_HEDGES = ("reportedly", "reported to", "is reported", "evidence says", "evidence reports", "according to")
_GO_AHEAD_NEGATION_RE = re.compile(r"\b(?:not|cannot|never|until|nothing|no)\b|n['’]t\b", re.I)


def _drop_unsupported_go_ahead(sentence: str, original: str | None = None) -> str:
    """`original` is the sentence before softening: its premise decides whether it was negated, since the
    softened premise now contains "(not yet resolved)" itself."""
    original_premise = None
    if original is not None:
        first = _CONSEQUENCE_RE.search(original)
        original_premise = original[:first.start()] if first else original
    for consequence in _CONSEQUENCE_RE.finditer(sentence):
        premise, rest = sentence[:consequence.start()], consequence.group("rest")
        go = _GO_AHEAD_RE.search(rest)
        judged = original_premise if original_premise is not None else premise
        if not go or _negated(judged) or re.search(r"\bnot\b|n['’]t\b", judged, re.I):
            continue
        own_clause = re.split(r",|\band\b", rest[:go.start()])[-1] + go.group(0)
        if _GO_AHEAD_NEGATION_RE.search(own_clause):
            continue
        tail = sentence[consequence.end():]
        return premise.rstrip(" ,;") + ("." if not tail.strip() else tail)
    return sentence


def _soften_unearned_settled_prose(value: str | None, governing_ngrams: frozenset = frozenset(), evidence=()) -> str | None:
    """Sentence-scoped companion to _soften_unearned_settled_words: rewrites
    an unhedged settled-sounding claim within full prose (Ask's summary,
    and free-text item text/detail), leaving any sentence that already
    hedges completely untouched (a negation hedges only its own clause, #474). Narrow by design -- this is a deterministic
    backstop for a specific, recurring trust failure (Ask narrating pending
    Review/Evidence/Question material as settled), not a general rewriter,
    per explicit direction after live testing showed prompt wording alone
    isn't reliable here (~1/4 pass in a small live sample). Only called
    when the answer's own selected context includes an open Review or open
    Question (has_pending_material in _validate_synthesis).

    `governing_ngrams` (see _governing_state_ngrams, #227): a matched word is left
    alone when the wording around it quotes a governing Current State statement
    verbatim, or (#473) refers to one attributively ("the approved move budget at
    $85,000"; see _refers_to_governing_state), so an approved, established fact is never
    rewritten into an unapproved one. `evidence` (see _evidence_backing, #567): a word the
    selected Evidence itself uses about the same thing is qualified, not denied. Everything else
    is still softened.
    """
    if not value:
        return value
    sentences = _SENTENCE_SPLIT_RE.split(value)
    rewritten = []
    for sentence in sentences:
        if _historical(sentence):
            rewritten.append(sentence)
            continue
        if _hedged_by_phrase(sentence) or sentence.rstrip().endswith("?"):
            lowered = sentence.lower()
            attributed = any(h in lowered for h in _ATTRIBUTION_HEDGES)
            rewritten.append(_drop_unsupported_go_ahead(sentence) if attributed else sentence)
            continue
        parts = _CLAUSE_SPLIT_RE.split(sentence)
        original = list(parts)
        for index in range(0, len(parts), 2):  # odd indexes are the delimiters
            if _negated(parts[index]):
                continue
            # Attribution can carry into a parenthesis or dash after it, but not past a ";".
            lead = "".join(original[:index]).rsplit(";", 1)[-1]
            fixed = parts[index]
            for pattern, replacement in _UNEARNED_SETTLED_PROSE_REPLACEMENTS:
                current = fixed
                fixed = pattern.sub(lambda m, r=replacement, t=current, l=lead: _soften_match(t, m, r, governing_ngrams, l, evidence), current)
            parts[index] = fixed
        changed = "".join(parts)
        rewritten.append(_drop_unsupported_go_ahead(changed, sentence) if changed != sentence else changed)
    text = " ".join(rewritten)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text or value


# Exact JSON field/key names (and a few fixed enum values) that appear in the
# context blob or previous_answer JSON given to the model -- the only tokens
# a model could plausibly echo verbatim as a leaked implementation detail.
# Deliberately an explicit list, not a "strip anything with an underscore"
# regex: a blanket underscore-shaped-token strip (tried 2026-09-14, reverted
# same day) also deleted legitimate project terminology a user might
# reasonably ask about or a record might legitimately contain -- SOC_2,
# api_v2, feature_flag_beta, review_quality_104_105, or a Note quoting
# someone's own snake_case -- silently changing answer meaning, not just
# formatting. Extend this set when a new internal field name is added to
# _compact_candidates, AskSelection, or AskSynthesis's schema.
_INTERNAL_JSON_FIELD_NAMES = frozenset({
    "ai_proposed_statement", "accepted_as_adjusted", "new_statement", "old_statement",
    "state_item_id", "decision_question", "why_consequential", "affected_state_ids",
    "affected_state_items", "evidence_ids", "evidence_items", "question_ids",
    "question_to_create", "existing_question_id", "review_type", "resolves_question_ids",
    "changed_at", "submitted_at", "source_type", "record_type", "record_id",
    "state_ids", "review_ids", "history_ids", "blocking_question_ids",
    "source_ids", "uncertainty_ids", "suggested_refinements", "suggested_question",
    "governing_current_fact", "qualifies_current_state", "known_unknown",
    "accepted_past_transition", "supporting_or_event_evidence", "interpretation_guardrail",
    "answered_question", "answered_questions", "answered_question_ids", "answered_by_review_id", "answer_evidence_id",
    "resolved_at",
    "needs_review", "recent_context", "open_attention",
})


# Seeded demo record ids are hand-written slugs with a prefix: "demo-review-retention" (Northstar) and
# "demo-juniper-review-elevator" (Juniper). The generated-id shape patterns in _clean_visible_ask_text recognise
# only the tail ("review-elevator"), which used to leave the prefix behind as a mangled fragment such as
# "Demo-juniper- qualifies this risk." (#247), so the whole slug is removed first.
_DEMO_SLUG_ID = re.compile(
    r"\bdemo-(?:(?:northstar|juniper)-)?(?:review|state|question|evidence|proposal|history)-[a-z0-9-]+\b", re.IGNORECASE
)


def _candidate_pool_ids(candidates: Mapping[str, list[dict]] | None) -> set[str]:
    """Every record id the model was shown for this Ask, whether or not it selected the record (#247).

    The model can echo the id of a record it did not select, and only ids in the scrubber's exact-id list are
    removed regardless of shape (some, like Juniper's "jq-elevator", match no shape pattern at all)."""
    ids: set[str] = set()
    for bucket in (candidates or {}).values():
        if isinstance(bucket, list):
            ids.update(str(x["id"]) for x in bucket if isinstance(x, dict) and x.get("id"))
    return ids


# #478: enum values that read fine as words once the underscores go. Source types are free
# text in the data ("vendor_email"), so the candidates' own source types are added per Ask
# (_source_type_labels); this fixed part covers the record types the prompt itself names.
_ENUM_LABELS = {
    "open_question": "open question", "proposed_update": "proposed update",
    "state_at_risk": "state at risk", "missing_understanding": "missing understanding",
    "manual_note": "project update", "working_note": "working note", "demo_seed": "project note",
    "demo_history": "project note",
}


def _source_type_labels(candidates: Mapping[str, list[dict]] | None) -> dict[str, str]:
    labels = dict(_ENUM_LABELS)
    for bucket in (candidates or {}).values():
        if isinstance(bucket, list):
            for record in bucket:
                source = record.get("source_type") if isinstance(record, dict) else None
                if isinstance(source, str) and "_" in source and source not in labels:
                    labels[source] = source.replace("_", " ")
    return labels


def _clean_visible_ask_text(value: str | None, internal_ids: set[str], labels: Mapping[str, str] | None = None) -> str | None:
    """Remove implementation identifiers from prose shown to users."""
    if value is None:
        return None
    text = str(value)
    # #478: "blocking=true; blocks:" style key=value pairs copied from the prompt's record format.
    text = re.sub(r"\b[a-z_]+=(?:true|false|null|none|\d+)\b[;,]?", "", text, flags=re.IGNORECASE)
    for raw, label in sorted((labels or _ENUM_LABELS).items(), key=lambda kv: len(kv[0]), reverse=True):
        text = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(raw)}(?![A-Za-z0-9_])", label, text)
    # Remove exact IDs available to this Ask run first, then defensively strip
    # generated identifier shapes if a model echoes one outside record_id.
    for internal_id in sorted(internal_ids, key=len, reverse=True):
        if internal_id:
            text = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(internal_id)}(?![A-Za-z0-9_])", "", text, flags=re.IGNORECASE)
    text = _DEMO_SLUG_ID.sub("", text)
    text = re.sub(r"\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b", "", text, flags=re.IGNORECASE)
    # Defensively strip known internal field/key names the model might echo
    # from the JSON context it was given (e.g. ai_proposed_statement,
    # accepted_as_adjusted). Found via live staging QA (2026-09-14): Ask's
    # adjustment-provenance citations leaked raw field names as visible
    # answer text. Narrow by design -- see _INTERNAL_JSON_FIELD_NAMES.
    for field_name in _INTERNAL_JSON_FIELD_NAMES:
        text = re.sub(rf"\b{re.escape(field_name)}\b", "", text, flags=re.IGNORECASE)
    # A model sometimes cites an internal ID as an inline parenthetical, e.g.
    # "Retention is confirmed (review_1)." Stripping the ID above is correct
    # (it's an implementation detail, not something a user should see), but
    # left alone it strands the empty citation shell: "confirmed ()." Found
    # via live staging QA (2026-09-13). Only a parenthetical that is now
    # nothing but whitespace/punctuation is removed -- one with other real
    # words left inside ("(see the linked Review)") is untouched.
    text = re.sub(r"\(\s*(?:[,;]\s*)*\)", "", text)
    # #478: an id removed from "(: Support Slack not approved; restricted by k-slack)" leaves
    # "(:" and a dangling "by )". Close those up rather than show an empty slot.
    text = re.sub(r"\(\s*[:;,]\s*", "(", text)
    # #577: "(q-thresholds is open and blocking)" left "( is open and blocking)" once the id was removed.
    text = re.sub(r"\(\s+(?:is|are|was|were|remains|remain)\s+", "(", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+(?:by|from|per|via|see)\s*([;,]?\s*\))", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[;,]\s*\)", ")", text)
    text = re.sub(r"\(\s*(?:[,;]\s*)*\)", "", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    # Trim separators an id removal can strand at either end, and a leading dot, but keep a
    # sentence's own final period: trimming it left every Ask summary and item unpunctuated
    # (Cowork, Oct 11).
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—:;,").lstrip(". ")
    if text in {".", ""}:
        return None
    return text
