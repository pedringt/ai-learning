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


def _already_hedged(text: str) -> bool:
    lowered = text.lower()
    if any(hedge in lowered for hedge in _PENDING_HEDGE_PHRASES):
        return True
    negation = _NEGATION_RE.search(lowered)
    return bool(negation and _SETTLED_TARGET_WORD_RE.search(lowered, negation.end()))


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
    (re.compile(r"\bnow\s+known\b", re.I), lambda m: _match_case("reported (not yet confirmed)", m.group(0))),
    (re.compile(r"\bno\s+longer\s+blocking\b", re.I), lambda m: _match_case("reported as potentially no longer blocking, pending Review", m.group(0))),
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

_WORD_RE = re.compile(r"[a-z0-9]+")


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


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
    for statement in statements:
        tokens = _words(statement or "")
        grams.update(zip(tokens, tokens[1:], tokens[2:]))
    return frozenset(grams)


def _quotes_governing_state(text: str, match: "re.Match[str]", governing_ngrams: frozenset) -> bool:
    """True if a three-word run around `match` appears in a governing state statement."""
    if not governing_ngrams:
        return False
    before = _words(text[:match.start()])[-2:]
    inside = _words(match.group(0))
    after = _words(text[match.end():])[:2]
    sequence = before + inside + after
    first, end = len(before), len(before) + len(inside)
    for start in range(max(0, first - 2), end):
        gram = tuple(sequence[start:start + 3])
        if len(gram) == 3 and start + 3 > first and gram in governing_ngrams:
            return True
    return False


def _soften_unearned_settled_prose(value: str | None, governing_ngrams: frozenset = frozenset()) -> str | None:
    """Sentence-scoped companion to _soften_unearned_settled_words: rewrites
    an unhedged settled-sounding claim within full prose (Ask's summary,
    and free-text item text/detail), leaving any sentence that already
    hedges completely untouched. Narrow by design -- this is a deterministic
    backstop for a specific, recurring trust failure (Ask narrating pending
    Review/Evidence/Question material as settled), not a general rewriter,
    per explicit direction after live testing showed prompt wording alone
    isn't reliable here (~1/4 pass in a small live sample). Only called
    when the answer's own selected context includes an open Review or open
    Question (has_pending_material in _validate_synthesis).

    `governing_ngrams` (see _governing_state_ngrams, #227): a matched word is left
    alone when the wording around it quotes a governing Current State statement
    verbatim, so an approved, established fact is never rewritten into an
    unapproved one. Everything else is still softened.
    """
    if not value:
        return value
    sentences = _SENTENCE_SPLIT_RE.split(value)
    rewritten = []
    for sentence in sentences:
        if _already_hedged(sentence):
            rewritten.append(sentence)
            continue
        fixed = sentence
        for pattern, replacement in _UNEARNED_SETTLED_PROSE_REPLACEMENTS:
            current = fixed
            fixed = pattern.sub(
                lambda m, r=replacement, t=current: m.group(0) if _quotes_governing_state(t, m, governing_ngrams) else r(m),
                current,
            )
        rewritten.append(fixed)
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


def _clean_visible_ask_text(value: str | None, internal_ids: set[str]) -> str | None:
    """Remove implementation identifiers from prose shown to users."""
    if value is None:
        return None
    text = str(value)
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
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—:;,.")
    return text or None
