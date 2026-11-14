"""Ask's visible-text scrubber: strips internal record ids, JSON field names and enum values from prose shown to users.

Until #567 this module also held the settled-word backstop (`_soften_unearned_settled_words`/`_prose`), which rewrote
"confirmed / approved / resolved" when no accepted Current State item supported it. Since #567 (Nov 11, Paige) Ask
never rewords a sentence: a claim is shown as written, withheld, or replaced by its record's text (ask_assertions).
The unused backstop was removed on Nov 14; its history is in git and #656.
"""
from __future__ import annotations

import re
from typing import Mapping


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
