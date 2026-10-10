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
    "evidence says", "evidence reports", "pending review", "awaiting review",
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
_NEGATION_RE = re.compile(r"\bnot\b|n['’]t\b", re.I)
_SETTLED_TARGET_WORD_RE = re.compile(
    r"\b(?:confirmed|resolved|resolves|established|approved|decided|known|blocking)\b", re.I
)


def _hedged_by_phrase(text: str) -> bool:
    lowered = text.lower()
    return any(hedge in lowered for hedge in _PENDING_HEDGE_PHRASES)


def _negated(text: str) -> bool:
    lowered = text.lower()
    negation = _NEGATION_RE.search(lowered)
    return bool(negation and _SETTLED_TARGET_WORD_RE.search(lowered, negation.end()))


def _already_hedged(text: str) -> bool:
    return _hedged_by_phrase(text) or _negated(text)


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


def _soften_unearned_settled_words(value: str | None) -> str | None:
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
    return any(word in tokens and noun in tokens and numbers <= statement_numbers
               for tokens, statement_numbers, _grams in statements)


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


def _soften_match(text: str, match: "re.Match[str]", replacement, governing) -> str:
    if _quotes_governing_state(text, match, governing) or _refers_to_governing_state(text, match, governing):
        return match.group(0)
    attributive = _ATTRIBUTIVE_REPLACEMENTS.get(match.group(0).lower())
    if attributive and _attributive(text, match):
        # "the approved move budget" -> "the proposed (not yet approved) move budget",
        # not the ungrammatical "the proposed for approval (not yet approved) move budget".
        return _match_case(attributive, match.group(0))
    return replacement(match)


def _soften_unearned_settled_prose(value: str | None, governing_ngrams: frozenset = frozenset()) -> str | None:
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
    rewritten into an unapproved one. Everything else is still softened.
    """
    if not value:
        return value
    sentences = _SENTENCE_SPLIT_RE.split(value)
    rewritten = []
    for sentence in sentences:
        if _hedged_by_phrase(sentence):
            rewritten.append(sentence)
            continue
        parts = _CLAUSE_SPLIT_RE.split(sentence)
        for index in range(0, len(parts), 2):  # odd indexes are the delimiters
            if _negated(parts[index]):
                continue
            fixed = parts[index]
            for pattern, replacement in _UNEARNED_SETTLED_PROSE_REPLACEMENTS:
                current = fixed
                fixed = pattern.sub(lambda m, r=replacement, t=current: _soften_match(t, m, r, governing_ngrams), current)
            parts[index] = fixed
        rewritten.append("".join(parts))
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
    "source_ids", "uncertainty_ids", "suggested_refinements",
    "governing_current_fact", "qualifies_current_state", "known_unknown",
    "accepted_past_transition", "supporting_or_event_evidence", "interpretation_guardrail",
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
    text = re.sub(r"\s+(?:by|from|per|via|see)\s*([;,]?\s*\))", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[;,]\s*\)", ")", text)
    text = re.sub(r"\(\s*(?:[,;]\s*)*\)", "", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—:;,.")
    return text or None
