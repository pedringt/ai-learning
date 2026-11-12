"""Authority-aware candidate selection and synthesis orchestration for State Ask."""
from __future__ import annotations

import json
import hashlib
import logging
import re
import time
import uuid
from datetime import date
from typing import Any, Iterator, Mapping, Protocol

from ask_contract import (  # noqa: I001
    AskHypothetical,
    MEETING_PREP_ITEM_CAPS, MEETING_PREP_MAX_REFINEMENTS, MEETING_PREP_MAX_SECTIONS, MEETING_PREP_SECTION_ORDER,
    MEETING_PREP_SECTION_TITLES, AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis,
)
import ask_assertions
import ask_drafts
from contextvars import ContextVar
from ask_claims import MAX_CLAIMS, ClaimChecker, anchors_supported, canonical_card, fixed_headline, prepare_answer_raw, record_text
from ask_display import claim_lines, has_withheld, withheld_line
from ask_refinement_transforms import apply_refinement_transform, detect_refinement_type
from db import project_id_of
from ask_authority_text import (  # noqa: F401  (re-exported: tests and callers import these from ask_service)
    _evidence_backing,
    _DEMO_SLUG_ID,
    _INTERNAL_JSON_FIELD_NAMES,
    _NEGATION_RE,
    _PENDING_HEDGE_PHRASES,
    _SENTENCE_SPLIT_RE,
    _SETTLED_TARGET_WORD_RE,
    _SETTLED_WORD_REPLACEMENTS,
    _UNEARNED_SETTLED_PROSE_REPLACEMENTS,
    _WORD_RE,
    _already_hedged,
    _candidate_pool_ids,
    _clean_visible_ask_text,
    _source_type_labels,
    _governing_state_ngrams,
    _match_case,
    _quotes_governing_state,
    _soften_unearned_settled_prose,
    _soften_unearned_settled_words,
    _words,
)
from review_service import list_evidence, list_history, list_project_rules, list_questions, list_state, question_source_evidence
# Ask sees the Review list people see (an extension point; Baseline hides routine
# Starting State creates), so it never counts draft facts as separate Reviews.
from review_service import list_presented_reviews as list_reviews

logger = logging.getLogger("state.ask")


class AskProvider(Protocol):
    def run(self, prompt: str) -> Mapping[str, Any]: ...


def _persist_model_call_metrics(connection: Any, provider: Any) -> None:
    """Persist metadata-only Ask call telemetry without risking the Ask response."""
    drain = getattr(provider, "drain_call_metrics", None)
    if not callable(drain):
        return
    rows = drain()
    if not rows:
        return
    try:
        project_id = project_id_of(connection)
        for row in rows:
            connection.execute(
                "INSERT INTO model_call_metrics("
                "id, project_id, operation, provider, model_identifier, "
                "duration_ms, input_tokens, output_tokens"
                ") VALUES (?,?,?,?,?,?,?,?)",
                (
                    f"model_call_{uuid.uuid4().hex[:16]}",
                    project_id,
                    "ask",
                    str(row.get("provider") or "unknown"),
                    str(row.get("model_identifier") or "unknown"),
                    int(row.get("duration_ms") or 0),
                    row.get("input_tokens"),
                    row.get("output_tokens"),
                ),
            )
        connection.commit()
    except Exception:  # broad on purpose: best-effort telemetry write must never fail Ask
        logger.warning("Could not persist Ask model-call telemetry", exc_info=True)
        # Ask's contract retry reuses this connection; a failed INSERT must not leave Postgres aborted.
        if getattr(connection, "is_postgres", False):
            connection.rollback()


_SELECTION_LIMITS = {
    "state_ids": 12,
    "review_ids": 8,
    "blocking_question_ids": 8,
    "question_ids": 10,
    "history_ids": 12,
    "evidence_ids": 12,
    "answered_question_ids": 6,
}


def ask_cache_key(
    connection: Any,
    query: str,
    previous_answer: Mapping[str, Any] | None = None, today: date | None = None) -> str:
    """Fingerprint an Ask request against every authority-bearing input.

    Reusing a prior answer is safe only while Current State, open Reviews,
    Questions, History, Evidence, and project Rules are unchanged. Including
    the full compact candidate set makes any accepted decision or new evidence
    produce a different key instead of serving a stale answer.

    Also keyed on today's date. None of the authority-bearing inputs above
    change just because a day passed, but an answer's own prose can still go
    stale purely from the passage of time -- a record dated "September 3" is
    accurately described as upcoming on September 2 and stale if that exact
    cached prose is still served on September 4. _grounding_rules() below
    tells the model how to describe a passed date correctly, but that
    instruction only takes effect on an actual model call; a cache hit skips
    the model entirely and would otherwise replay whatever tense the answer
    was generated in indefinitely. Keying on the date forces a fresh call
    (and a fresh grounding-rules read) once the day rolls over, without
    invalidating same-day repeat questions.

    Depends on ordering defined elsewhere. _compact_candidates truncates
    history to 18 entries and evidence to 24, which is only safe because
    list_history and list_evidence in review_service.py both ORDER BY ... DESC:
    the windows hold the newest records, so anything added lands inside them and
    changes the key. Reorder those queries to ASC and this cache silently starts
    serving stale answers -- the tests would still pass, because they add
    records rather than adding 25 of them.
    """
    payload = {
        "query": " ".join(query.lower().split()),
        "previous_answer": previous_answer,
        "candidates": _compact_candidates(connection),
        "as_of_date": (today or date.today()).isoformat(),
        # #567: answers changed shape (claims, fixed headlines); never serve one cached in the older shape.
        "answer_shape": "claims-v2",
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _bounded_selection_raw(selection_raw: Mapping[str, Any] | None) -> dict[str, Any]:
    """Make provider over-selection recoverable before strict contract validation.

    Structured-output schemas should keep providers within these limits, but this
    application-side bound prevents a single extra valid ID from turning an
    otherwise grounded Ask into a retry and 422. Provider order is preserved.
    """
    if not isinstance(selection_raw, Mapping):
        return {}
    data = dict(selection_raw)
    for field, limit in _SELECTION_LIMITS.items():
        values = data.get(field)
        if not isinstance(values, list):
            continue
        bounded: list[str] = []
        seen: set[str] = set()
        for value in values:
            if not isinstance(value, str) or value in seen:
                continue
            seen.add(value)
            bounded.append(value)
            if len(bounded) >= limit:
                break
        data[field] = bounded
    return data


def _compact_candidates(connection: Any) -> dict[str, list[dict]]:
    state = list_state(connection)
    reviews = list_reviews(connection, "open")
    questions = list_questions(connection, "open")
    answered = list_questions(connection, "resolved")[:30]
    history = list_history(connection)[:18]
    evidence = list_evidence(connection)[:24]
    rules = list_project_rules(connection)
    return {
        "state": [{"id": x["id"], "topic": x["topic"], "statement": x["statement"], "authority": "governing_current_fact"} for x in state],
        "reviews": [{
            "id": x["id"], "review_type": x["review_type"], "decision_question": x["decision_question"],
            "why_consequential": x["why_consequential"], "authority": "qualifies_current_state",
            "affected_state_ids": [s["id"] for s in x.get("affected_state_items", [])],
            "evidence_ids": [e["id"] for e in x.get("evidence_items", [])],
            "question_ids": list(x.get("resolves_question_ids", [])),
            **({"question_to_create": {key: x["question_to_create"].get(key) for key in
                 ("id", "text", "evidence_id", "existing_question_id")}} if x.get("question_to_create") else {}),
        } for x in reviews],
        "questions": [{"id": x["id"], "text": x["text"], "blocking": bool(x["blocking"]), "blocks": x["blocks"], "authority": "known_unknown"} for x in questions],
        # #640 (Nov 7): Questions a human closed by accepting a Review. The answer is the Evidence that Review accepted;
        # answering a Question is not a Current State change, so this has its own authority level.
        "answered_questions": [_answered_question(connection, x) for x in answered],
        "history": [{
            "id": x["id"], "state_item_id": x["state_item_id"], "old_statement": x.get("old_statement"),
            "new_statement": x.get("new_statement"), "changed_at": str(x.get("changed_at") or ""),
            "decision_question": x.get("decision_question"), "authority": "accepted_past_transition",
            # state.md #106/#109 holistic pass: when a human adjusted the AI's
            # proposal before accepting, expose what the AI originally
            # suggested as provenance -- new_statement (already above) is the
            # only authoritative current value; ai_proposed_statement is never
            # an alternate truth, only an answer to "what did State propose /
            # what changed." Omitted entirely for an ordinary (non-adjusted)
            # transition so it isn't confused with one.
            **({"accepted_as_adjusted": True, "ai_proposed_statement": x.get("ai_proposed_statement")}
               if x.get("accepted_as_adjusted") else {}),
        } for x in history],
        "evidence": [{
            "id": x["id"], "content": x["content"], "source_type": x["source_type"],
            "submitted_at": str(x.get("submitted_at") or ""), "authority": "supporting_or_event_evidence"
        } for x in evidence],
        "rules": [{"id": x["id"], "text": x["text"], "category": x["category"], "authority": "interpretation_guardrail"} for x in rules],
    }




def _answered_question(connection: Any, question: Mapping[str, Any]) -> dict:
    """A resolved Question with its answer and provenance: the Evidence it was resolved by and the Review that accepted it."""
    evidence_id = question.get("source_evidence_id")
    # Shared with the Question view (review_service.question_source_evidence, #640 Nov 8). The Review below is still
    # chosen as before (most recently resolved linked Review); the view uses the stricter write-path rule instead.
    evidence = question_source_evidence(connection, question)
    review = connection.execute(
        "SELECT rq.review_id FROM review_questions rq JOIN review_issues r ON r.id=rq.review_id "
        "WHERE rq.question_id=? AND r.status='resolved' ORDER BY r.resolved_at DESC LIMIT 1", (question["id"],)).fetchone()
    return {
        "id": question["id"], "text": question["text"], "status": "resolved",
        "answer": (str(evidence["content"])[:600] if evidence else None),
        "resolved_at": str(question.get("resolved_at") or ""),
        "answered_by_review_id": review["review_id"] if review else None,
        "answer_evidence_id": evidence_id,
        "authority": "answered_question",
    }


def _trim_candidates_for_query(query: str, candidates: Mapping[str, list[dict]]) -> dict[str, list[dict]]:
    """Bound the model context with transparent lexical relevance; authority is still enforced later."""
    stop = {"the","a","an","and","or","to","for","of","in","on","me","my","we","our","this","that","what","is","are","be","with","about","prep","prepare","meeting"}
    terms = {x for x in re.findall(r"[a-z0-9]+", query.lower()) if len(x) > 2 and x not in stop}
    # Meeting prep needs a little semantic neighborhood even when the prompt is terse.
    if "security" in terms:
        terms |= {"retention","access","pilot","risk","launch","data","vendor","approval"}

    def text(record: Mapping[str, Any]) -> str:
        return " ".join(str(v) for k, v in record.items() if k not in {"authority"} and not isinstance(v, (list, dict))).lower()

    def ranked(bucket: str, limit: int) -> list[dict]:
        records = list(candidates[bucket])
        scored = []
        for idx, record in enumerate(records):
            body = text(record)
            score = sum(3 for term in terms if term in body)
            if bucket == "questions" and record.get("blocking"):
                score += 1
            scored.append((score, -idx, record))
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [x[2] for x in scored[:limit]]

    reviews = ranked("reviews", 6)
    state = ranked("state", 12)
    required_state = {sid for r in reviews for sid in r.get("affected_state_ids", [])}
    state_by_id = {x["id"]: x for x in candidates["state"]}
    for sid in required_state:
        if sid in state_by_id and sid not in {x["id"] for x in state}:
            state.append(state_by_id[sid])

    # Only answered Questions that share a term with the request: an unrelated old answer is not context (#640).
    answered = [x for x in ranked("answered_questions", 6) if any(term in text(x) for term in terms)]
    return {
        "state": state[:14],
        "reviews": reviews,
        "questions": ranked("questions", 12),
        "answered_questions": answered,
        "history": ranked("history", 10),
        "evidence": ranked("evidence", 12),
        "rules": list(candidates["rules"]),
    }


def _followup_mode(query: str, previous_answer: Mapping[str, Any] | None) -> str:
    """Use the same refinement classifier as deterministic post-processing.

    The backend is the authority for replace-vs-append so the browser cannot
    disagree with the transform that was actually applied.
    """
    if not previous_answer:
        return "new"
    return "replace" if detect_refinement_type(query) else "append"

def _previous_answer_search_text(previous_answer: Mapping[str, Any] | None) -> str:
    if not previous_answer:
        return ""
    bits: list[str] = []
    for key in ("headline", "summary"):
        value = previous_answer.get(key)
        if value:
            bits.append(str(value))
    for section in previous_answer.get("sections", []) or []:
        if isinstance(section, Mapping):
            if section.get("title"):
                bits.append(str(section["title"]))
            for item in section.get("items", []) or []:
                if isinstance(item, Mapping):
                    if item.get("text"):
                        bits.append(str(item["text"]))
                    if item.get("detail"):
                        bits.append(str(item["detail"]))
    return " ".join(bits)[:12000]

def _retrieval_query(query: str, previous_answer: Mapping[str, Any] | None) -> str:
    """Carry prior subject matter into dependent follow-ups/refinements."""
    if not previous_answer:
        return query
    prior = _previous_answer_search_text(previous_answer)
    if not prior:
        return query
    # The continuation field is intentionally session-scoped. Retrieval must use
    # both the user's new instruction and the subject matter already established.
    return f"{query} {prior}"

def ask_today(client_date: date | None = None) -> date:
    """The day Ask treats as today (#476): the asker's local date when it is within a
    day of the server's (UTC) date, otherwise the server's. An evening question west of
    UTC used to be answered as if it were already tomorrow."""
    server_today = date.today()
    if client_date is not None and abs((client_date - server_today).days) <= 1:
        return client_date
    return server_today


def _grounding_rules(today: date | None = None) -> str:
    """Shared non-negotiable rules injected into every prompt that produces
    user-visible Ask prose. Added 2026-09-07 after live QA found three
    related trust problems in the same family: a Review's consequentiality
    ranking changed between a full answer and a "make this shorter"
    refinement of the SAME conversation (selection was independently
    re-derived rather than narrowed from what the fuller answer already
    surfaced); a retention answer grouped access/security facts under a
    "Confirmed Retention Constraints" heading; and a next-step
    recommendation referenced an already-past date as though it were
    upcoming. The model has no other way to know what day it is, or that a
    section title should match its own contents -- both must be explicit.
    """
    return f"""- Today's date is {(today or date.today()).isoformat()}. When referencing a specific date from a record, compare it to today: if that date has already passed, describe it as overdue, still unresolved, or needing follow-up -- never as upcoming or a future next step.
- An open Review is relevant whenever it bears on the request, not only when it challenges a Current State record you already selected. Current State having no entry on a topic is not evidence that nothing relevant exists -- an open Review can be the only record that speaks to the request at all (e.g. "has X been decided?" when Current State is silent but a Review proposes X). Select and surface that Review, and answer that it is proposed/pending, not yet decided -- never report no relevant records exist merely because Current State itself is silent.
- Before answering "no relevant records" or "not enough information" for any yes/no or status question ("has X been decided/approved/changed?", "is X still true?"), you MUST check the supplied candidate Reviews for one whose decision_question or why_consequential addresses the same subject, even if worded differently. A candidate Review record about the same topic being present is proof relevant records DO exist; the correct answer is "not yet decided, pending Review" (job current_fact still applies -- a pending Review is a real, checkable record, not an absence of one), never a claim that no records were found.
- Section, group, and category titles must accurately describe the actual conceptual domain of their contents (for example, do not label access or security constraints as retention constraints, or vice versa). If items span more than one domain, either split them into separate sections or use a domain-neutral title.
- Consequentiality ordering must stay consistent for the same underlying records across every job and every refinement in this conversation. A refinement may narrow, reformat, or shorten what is shown, but it must select from what a fuller answer to the same request would already treat as most important -- never independently re-rank the same records into a different priority order, and never introduce a record that a fuller answer would have omitted.
- An open Review's proposed statement, number, or decision is not accepted into Current State and does not close its linked Question, no matter how certain the underlying Evidence sounds (e.g. "Legal confirmed X"). Never describe an open Review's content as "confirmed", "established", "accepted", or as resolving/answering/closing a Question -- describe it as proposed and awaiting review, and state plainly that the linked Question remains open and the Review has not been accepted into Current State. Only an item actually present in Current State, or a Question actually absent from the open Questions list, may be described as settled.
- Answered Questions are Questions a human closed by accepting a Review; each carries its recorded answer (the Evidence that Review accepted). When the request is about one, say plainly that the Question was answered and give the recorded answer as what the record says. Answering a Question is not a Current State change: never say the answer was recorded in, changed, or replaced Current State unless a Current State record itself says so, and state any related Current State fact exactly as it stands (for example, a contract that "remains under review" still remains under review).
- When Current State says one thing and an open Review contains potentially conflicting evidence, state the maintained Current State first, then explicitly say the conflicting Review is unresolved and may change that understanding if a human accepts it. Do not flatten the two into a single confident answer, and do not present the Review as equivalent authority to Current State. Use explicit uncertainty language such as "under review", "unresolved", or "may change" so a reader can tell what is true now from what is still being evaluated.
- If Current State establishes that an outcome happened but no supplied Current State, Review, Question, History, or Evidence record establishes why it happened, separate the known outcome from the unknown reason. State the known outcome, then explicitly say the reason is unknown, not established, or cannot be determined from the project record. Never infer a motive, cause, or rationale from the outcome alone.
- The words "confirmed" and "resolved" (as a section title, headline, or plain claim) are reserved for something actually in Current State, or a Question actually closed -- never for anything whose only support is an open Review, Evidence, or an open Question, even when the Evidence text itself uses that word. Evidence saying "Legal confirmed X" describes what a source reported to Evidence, not an accepted fact -- phrase it as "Evidence reports Legal said X" or "Legal is reported to have said X", never as "X is confirmed" or "X (Confirmed)". This applies to short labels exactly as much as full sentences: a section titled "Retention Terms: Legal Confirmed" or "Confirmed Retention and Deletion" is the same violation as a sentence claiming retention is confirmed, just shorter -- titles and headlines get the identical scrutiny as prose, they are not exempt because they are brief.
- If the user's question itself assumes or asserts something is resolved, confirmed, decided, or settled (e.g. "Since X is resolved, what can move forward?") and that is not actually true given Current State, open Reviews, and open Questions, correct that false premise plainly before answering anything else in the response -- e.g. "X is not resolved yet: evidence exists, but the Review has not been accepted and the Question remains open." Never adopt the user's framing and answer as though the premise were already true.
- Some history records include what State's AI originally proposed alongside the human-approved wording that was actually accepted, for a case where a human revised the AI's suggestion before accepting it. The approved wording is the only authoritative current value, exactly like any other history record -- the AI's original wording is provenance, never an alternate current fact, and must never be presented as what Current State says now. Use the AI's original wording only to answer a question specifically about what changed or what State originally proposed/suggested (e.g. "was this adjusted?", "what did State originally propose?", "what did the human change?") -- state plainly that a human revised the AI's wording before it was accepted, and give both the original and the approved wording. Do not volunteer this distinction unprompted for a plain "what is X now" question; the approved wording alone answers that. Refer to this distinction only in plain language ("the AI's original proposal" / "the human-approved wording") -- never surface a raw internal field or key name (any underscore-joined identifier from the supplied data) as visible text in your answer.
- Live QA (2026-09-14) found Ask invent a specific, quoted "the AI proposed X, the human approved Y" adjustment story -- complete with two fabricated quoted sentences -- for a Review that had actually been left unchanged, with zero backing History record. This is a hallucination on exactly the claim State exists to make trustworthy, and it is never acceptable: a question about what changed, what was adjusted, or what the AI originally proposed for a specific item MUST be answered only from an actual supplied History record showing that item's original-vs-approved wording. If no such record exists among the supplied candidates -- including when the Review was left unchanged, rejected, or never adjusted -- say so plainly (e.g. "This was left unchanged; there is no adjustment or accepted revision to compare") instead of answering as if one exists. Never construct, paraphrase, or infer wording for "what the AI proposed" or "what was approved" from anything other than a real supplied record -- not from the Review's current proposed statement, not from general plausibility, not from a similar-sounding case."""


def meeting_prep_shape_guidance() -> str:
    """Prompt text stating the final shape of a meeting-prep answer, generated from the same constants
    `_normalize_meeting_prep` enforces (#246), so the model writes what the backend would keep and the prompt
    and the normalizer cannot drift apart."""
    kinds = []
    for kind in MEETING_PREP_SECTION_ORDER:
        title = MEETING_PREP_SECTION_TITLES.get(kind)
        label = f'`{kind}` titled "{title}"' if title else f"`{kind}` (your own short title)"
        cap = MEETING_PREP_ITEM_CAPS[kind]
        kinds.append(f"{label}, at most {cap} item{'' if cap == 1 else 's'}")
    return (
        "This paragraph applies ONLY when the job you choose is `meeting_prep`; for every other job, ignore it and use your own concise section "
        "titles and structure. For a `meeting_prep` answer, write it in its final shape, because the client shows it exactly as you write it. "
        f"Use only these section kinds, each at most once, in exactly this order, with at most {MEETING_PREP_MAX_SECTIONS} sections in total "
        "(leave a kind out rather than padding it): " + "; ".join(kinds) + ". "
        "Put Current State items in an `established` section. Never list the same record twice, even across sections. "
        f"Give at most {MEETING_PREP_MAX_REFINEMENTS} suggested refinements."
    )


def claims_guidance() -> str:
    """How the model writes `claims` (#567). Shared by the one-call and synthesis prompts."""
    return """Write the answer's opening as `claims`: 1 to 4 short sentences (each under 300 characters) that answer the request first, most important first. State software writes the headline; do not write one, and do not write a summary. Each claim states one fact with exactly one basis:
- current_state: what an accepted Current State record says. primary_record_id is that Current State record.
- pending_review: what an open Review proposes, described as proposed and awaiting review, never as decided. primary_record_id is that Review.
- evidence_says: what a source reported, attributed to that source (for example "The Q3 planning note says the pilot budget is approved at $40,000"). A source reporting approval is not State recording it. primary_record_id is that Evidence.
- open_question: an unknown an open Question tracks. primary_record_id is that Question.
- answered_question: a Question a human closed, with its recorded answer. primary_record_id is that answered Question.
- history: an accepted past change. primary_record_id is that History record.
- none: anything that does not rest on one record, such as what State does not have on record, or a corrected premise. primary_record_id is null.
Never put two bases in one claim. If a sentence would combine an accepted fact with a proposal, a source report or an unknown, write two claims. supporting_record_ids (at most 2) lists records that back a claim up without setting its authority, such as the History entry behind a Current State fact. Every number, amount and date in a claim must appear in its records or in the user's request. When a claim contrasts its record with another record (for example a pending Review's 25 users against Current State's 10), list that other record in supporting_record_ids; it does not change the basis. A claim that cites a record it does not rest on, or names a number or date that neither its records nor the request contain, is not shown.
When State has no accepted record of something, say it is not recorded or not established in State. Never say it did not happen, was not approved or is false: an open approval Question means the confirmation is missing, not that approval never happened, and a pending proposal is unaccepted, not untrue. Say that something changed Current State, or that Current State never changed, only from a History record; that a pending Review has not been accepted is not a change history.
For a question with several parts, answer each part in its own claim. State a permission Current State grants directly, citing that record, and name any dependency or condition that appears only in pending material as pending."""


def _one_call_prompt(query: str, candidates: Mapping[str, Any], previous_answer: Mapping[str, Any] | None, today: date | None = None) -> str:
    previous = json.dumps(previous_answer, ensure_ascii=False)[:12000] if previous_answer else "null"
    
    # Build refinement guidance based on whether previous_answer exists
    refinement_guidance = ""
    if previous_answer:
        refinement_guidance = """
IMPORTANT: Refinement transformations must be visibly honored:
- "shorten it" / "make it concise" → Output obviously shorter; target 40-60% of prior content unless dropping would lose critical authority/uncertainty. Keep only the most essential facts.
- "make this 3 bullets" → Create exactly one section with exactly 3 items in that section (fewer only if genuinely fewer than 3 distinct points exist). Each item must be a key fact. Remove all other sections entirely. This is a structural transformation: the answer goes from prose+sections to a single 3-item list.
- "focus only on blockers" → Keep only sections and items about confirmed blockers (Questions where blocking=true). Remove all non-blocking background, context, and supporting detail. If no blockers exist in prior answer, output one section explaining why.
- "turn it into an agenda" → Output a single section titled "Agenda" with 3-5 agenda items (time, topic, decision required). Remove all other sections entirely.
- "make it leadership-ready" → Compress to exactly 2-3 sections: "Decision needed", "Status", "Risk". No background or context unless critical to a decision. 50% of prior length maximum.
- "make it more detailed" → Expand grounded content only. Add more context from Evidence but do not invent facts beyond what records support. Keep all prior sections; add detail within them.
- "what source supports that?" (conversational) → Keep prior answer visible as context; append a new section with source-focused follow-up without losing prior content.

If the user request is a transformation (shorter, bullets, focus, turn into, leadership, detailed), REPLACE the main visible artifact completely with the new structure.
If the request is a conversational follow-up (asking about sources, asking clarifying questions), PRESERVE prior answer and append the new content in a new section.

CRITICAL: "make this 3 bullets" transformation rules:
- Output ONLY one section. No intro paragraph. No other sections.
- Output ONLY 3 items in that section. Exactly 3.
- Each item is a key fact from the prior answer, as a single bullet.
- Remove all other structure, all explanatory text, all groupings.
- Example of WRONG output: "Summary [intro text]. Blocking decisions required [section title]. - Item 1 - Item 2 Proposed refinements [section title]. - Item 3" (this has multiple sections and intro)
- Example of RIGHT output: "- Key fact 1 from prior answer - Key fact 2 from prior answer - Key fact 3 from prior answer" (this is ONLY the 3 bullets, nothing else)
- When a prior answer has many sections (blockers, refinements, checkpoints, etc.), select 3 of the most important points across ALL sections and output only those 3 as bullets.

CRITICAL: Append mode (conversational) means: include the full prior answer as-is PLUS a new section with the follow-up analysis. Do not merge or summarize the prior answer.
"""
    
    return f"""You are State Ask. In one response, first select the project records relevant to the request, then synthesize the grounded answer from only those selected records.

Authority rules are non-negotiable:
- Current State governs what is true, allowed, or in scope now.
- Open Reviews qualify Current State; they never replace it, and their proposed content is not accepted. Never describe an open Review's proposed statement as "confirmed", "established", or as resolving its linked Question -- not even when the underlying Evidence itself uses the word "confirmed" (that describes what a source reported, not an accepted fact). It is proposed and awaiting review, the linked Question is still open, and the Review has not been accepted into Current State. Include a Review when it materially challenges State used by the answer, but phrase it as pending, not settled. If the user's own question assumes something is already resolved/confirmed that isn't, correct that false premise plainly before answering anything else.
- A Question is blocking only when its supplied record says blocking=true. Ordinary Questions are known unknowns, not blockers.
- History is accepted past change. Evidence is what was said or observed and cannot silently override Current State.
- Project Rules constrain interpretation.
- Unknown must remain unknown. Newer does not mean more authoritative. Approval does not mean implementation.
- An open_question Review proposes tracking an unknown, not a State change. Its suggested Question is not yet an open Question or a fact. After authorization the ordinary Question record is still an unknown, never proof of its premise.
- Optimize for relevance, not completeness. Omit tempting recent noise.
- Refinement may change format, audience, length, focus, or ordering, but never project truth.{refinement_guidance}
- For meeting prep, frame relevant Questions as opportunities to get answered.
- Meeting prep is a portable working brief, not a dashboard or record dump. It should be useful when pasted into a meeting document and leave room for live notes.
- For meeting prep, prefer this information architecture when supported: concise before-the-meeting summary; Decisions needed; Questions to get answered; Useful context. State navigation/actions are rendered separately by the client.
- Do not repeat the same issue across multiple sections. A Review and linked Question may both appear, but explain each once.
- When you restate a Review or Question, keep its scope qualifiers (which cases, who, which part, which date). A Review about whether low-risk cases can skip human review is not a proposal to remove all human review (#545).
- suggested_question (#543): null in most answers. Set it only when ALL of these hold: (1) the user's request directly asks for something (a reason, owner, date, number or decision) that no supplied record establishes; (2) no open Review or open Question already covers that topic, even in different words; (3) the answer does not correct a false premise in the request (never turn a premise you corrected into a Question). Then give one short, specific question a person could track. Never suggest tangential follow-ups the user did not ask about, and never present it as tracked or true.
- Never call something a blocker unless the supplied Question says blocking=true. Never claim a count of blockers unless it matches selected blocking Questions.
{_grounding_rules(today)}

Job choices: current_fact, meeting_prep, catch_up, project_update, why_or_provenance, attention_check, historical, drafting, general_project_synthesis, refinement.

User request: {query}
Previous answer (for refinement only): {previous}

Authority-tagged candidate records:
{json.dumps(candidates, ensure_ascii=False)}

{claims_guidance()}

Return the required JSON object with `selection` first, then `answer`. Every answer record_id, primary_record_id and supporting_record_id must be present in the selection and candidate records. Relevant Reviews must appear visibly in the main answer, not only in source_ids. {meeting_prep_shape_guidance()} Prefer one synthesized opening over many State cards. Do not create a section titled Current State or Open Reviews Qualifying Current State. Keep the full answer comfortably under 500 words.
Use concise adaptive sections and short suggested refinements."""

def _selector_prompt(query: str, candidates: Mapping[str, Any], previous_answer: Mapping[str, Any] | None, today: date | None = None) -> str:
    previous = json.dumps(previous_answer, ensure_ascii=False)[:8000] if previous_answer else "null"
    return f"""You are the relevance selector for State, a maintained-project-understanding product.
Select only the records needed to answer the user's request. Do not answer the request.

Authority rules:
- Current State governs what is true/allowed/in scope now.
- Open Reviews qualify Current State; they do not replace it. If a Review materially challenges selected State, include it.
- A blocking Question is blocking only when the record says blocking=true. Ordinary Questions are known unknowns, not blockers.
- History is accepted past change. Evidence is what was said/observed and cannot silently override Current State.
- Project Rules constrain interpretation.
- Optimize for relevance, not completeness. Omit tempting recent noise.
- For refinement requests, select records for the TRANSFORMED answer, not the prior one. A refinement narrows or reformats what a fuller answer to this same request would already treat as most important -- it must not independently re-rank the candidates and arrive at a different priority order, and it must not select a record that a fuller answer would have omitted:
  - "shorten it": from the records a fuller answer would select, keep only the top 30% by importance -- the same top-ranked records, not a fresh independent judgment
  - "make this 3 bullets": select exactly 3 key facts worth a bullet point each, from the highest-priority records
  - "focus only on blockers": select ONLY Questions where blocking=true and their linked Reviews
  - "turn into agenda": select records that form agenda topics (decisions, timeline, risks)
  - "make it leadership-ready": select only decision/status/risk-relevant records
  - "more detailed": select all supporting records to expand context
  - "what source supports X?" (conversational): select additional source evidence to append
{_grounding_rules(today)}

Job choices: current_fact, meeting_prep, catch_up, project_update, why_or_provenance, attention_check, historical, drafting, general_project_synthesis, refinement.

User request: {query}
Previous answer (for refinement only): {previous}

Candidate records:
{json.dumps(candidates, ensure_ascii=False)}

Return only IDs from the supplied candidates in the required JSON schema."""


def _validate_selection(selection: AskSelection, candidates: Mapping[str, list[dict]]) -> AskSelection:
    by_type = {k: {x["id"]: x for x in v} for k, v in candidates.items() if k != "rules"}
    fields = {
        "state_ids": "state", "review_ids": "reviews", "blocking_question_ids": "questions",
        "question_ids": "questions", "history_ids": "history", "evidence_ids": "evidence",
        "answered_question_ids": "answered_questions",
    }
    data = selection.model_dump()
    for field, bucket in fields.items():
        data[field] = list(dict.fromkeys(x for x in data[field] if x in by_type[bucket]))
    data["blocking_question_ids"] = [qid for qid in data["blocking_question_ids"] if by_type["questions"][qid]["blocking"]]
    data["question_ids"] = [qid for qid in data["question_ids"] if not by_type["questions"][qid]["blocking"]]

    # Deterministic safety net: any open Review linked to selected Current State
    # is mandatory context, regardless of model relevance judgment.
    selected_state = set(data["state_ids"])
    mandatory_reviews = [r["id"] for r in candidates["reviews"] if selected_state.intersection(r.get("affected_state_ids", []))]
    data["review_ids"] = list(dict.fromkeys(data["review_ids"] + mandatory_reviews))

    # A selected Review may explicitly resolve/track a known Question. Preserve
    # that relationship so meeting prep cannot surface the Review while hiding
    # the concrete blocker/question attached to it.
    selected_reviews = set(data["review_ids"])
    linked_question_ids = [qid for r in candidates["reviews"] if r["id"] in selected_reviews for qid in r.get("question_ids", [])]
    for qid in linked_question_ids:
        question = by_type["questions"].get(qid)
        if not question:
            continue
        field = "blocking_question_ids" if question["blocking"] else "question_ids"
        data[field] = list(dict.fromkeys(data[field] + [qid]))

    # The reverse relationship must hold too: a selected Question may have an
    # open Review explicitly linked as potentially resolving it (via that
    # Review's own resolves_question_ids). Ask must not show the Question
    # while omitting the qualifying Review -- symmetric with the Review ->
    # Question safety net above. Runs after that net so it also covers
    # Questions that were only added because of a selected Review (those
    # already have their Review selected, so this is a no-op for them; it
    # only adds anything new for Questions the model selected directly).
    selected_questions = set(data["blocking_question_ids"] + data["question_ids"])
    linked_review_ids = [
        r["id"] for r in candidates["reviews"]
        if selected_questions.intersection(r.get("question_ids", []))
    ]
    data["review_ids"] = list(dict.fromkeys(data["review_ids"] + linked_review_ids))
    return AskSelection.model_validate(data)


def _selected_context(selection: AskSelection, candidates: Mapping[str, list[dict]]) -> dict[str, Any]:
    ids = selection.model_dump()
    out: dict[str, Any] = {"rules": candidates["rules"]}
    mapping = {
        "state": "state_ids", "reviews": "review_ids", "history": "history_ids", "evidence": "evidence_ids"
    }
    for bucket, field in mapping.items():
        wanted = set(ids[field]); out[bucket] = [x for x in candidates[bucket] if x["id"] in wanted]
    qids = set(ids["blocking_question_ids"] + ids["question_ids"])
    out["questions"] = [x for x in candidates["questions"] if x["id"] in qids]
    answered = set(ids["answered_question_ids"])
    out["answered_questions"] = [x for x in candidates.get("answered_questions", []) if x["id"] in answered]
    return out


def _synthesis_prompt(query: str, selection: AskSelection, context: Mapping[str, Any], previous_answer: Mapping[str, Any] | None, today: date | None = None) -> str:
    previous = json.dumps(previous_answer, ensure_ascii=False)[:12000] if previous_answer else "null"
    
    refinement_guidance = ""
    if previous_answer:
        refinement_guidance = """

REFINEMENT TRANSFORMATION RULES:
- "shorten it" / "make it concise" → Output obviously shorter; target 40-60% of prior content unless dropping would lose critical authority/uncertainty.
- "make this 3 bullets" → Output ONLY one section with ONLY 3 items. No intro text. No other sections. Each item is a single key fact. Remove ALL other structure. When prior answer has many sections (blockers, refinements, checkpoints, etc.), extract 3 key points across all of them and output only those 3 as bullets. Example WRONG: "Summary [intro]. Blocking decisions [section]. - Item 1 - Item 2 Refinements [section]. - Item 3". Example RIGHT: "- Key fact 1 - Key fact 2 - Key fact 3".
- "focus only on blockers" → Keep only sections and items about confirmed blockers (Questions where blocking=true). Remove all non-blocking background and context. Output only blocked items.
- "turn it into an agenda" → Output one section titled "Agenda" with 3-5 agenda items. Remove all other sections. Include times, topics, and decisions required.
- "make it leadership-ready" → Output exactly 2-3 sections: "Decision needed", "Status", "Risk". No background. Compress to 50% or less of prior length.
- "make it more detailed" → Expand within existing sections. Add supporting context from Evidence but do not invent facts. Keep all prior sections; make them deeper.
- "what source supports X?" (conversational) → Keep prior answer visible in full. Append a new section with source-focused follow-up analysis.

Transformation (shorter, bullets, focus, turn into, leadership, detailed) = replace main artifact completely.
Follow-up (questions, asking about sources) = append new section to prior answer, keeping it intact.
CRITICAL: Append mode means output the full prior answer followed by new content in a separate section. Do not merge or summarize the prior answer.
"""
    
    return f"""You synthesize State Ask answers from authority-labeled project records.
Return a useful answer first, not a record dump. Use concise adaptive sections.

Non-negotiable rules:
- Current State governs present truth.
- Relevant open Reviews must be visible in the main answer under needs_review, never hidden only in sources.
- confirmed blockers must remain distinct from ordinary open Questions. For a blocker, include its exact 'blocks' dependency in detail.
- Evidence may describe activity/claims but may not silently override Current State.
- An open Review's proposed content is not accepted. Never describe it as "confirmed", "established", or as resolving its linked Question -- it is proposed and awaiting review, the linked Question is still open, and the Review has not been accepted into Current State.
- Unknown must remain unknown. Do not infer absence from missing information.
- Refinement may change format, audience, length, focus, or ordering; it may not change project truth.{refinement_guidance}
- For meeting prep, frame relevant Questions as opportunities to get answered.
- Meeting prep is a portable working brief, not a dashboard or record dump. It should be useful when pasted into a meeting document and leave room for live notes.
- For meeting prep, prefer this information architecture when supported: concise before-the-meeting summary; Decisions needed; Questions to get answered; Useful context. State navigation/actions are rendered separately by the client.
- Do not repeat the same issue across multiple sections. A Review and linked Question may both appear, but explain each once.
- When you restate a Review or Question, keep its scope qualifiers (which cases, who, which part, which date). A Review about whether low-risk cases can skip human review is not a proposal to remove all human review (#545).
- suggested_question (#543): null in most answers. Set it only when ALL of these hold: (1) the user's request directly asks for something (a reason, owner, date, number or decision) that no supplied record establishes; (2) no open Review or open Question already covers that topic, even in different words; (3) the answer does not correct a false premise in the request (never turn a premise you corrected into a Question). Then give one short, specific question a person could track. Never suggest tangential follow-ups the user did not ask about, and never present it as tracked or true.
- Never call something a blocker unless the supplied Question says blocking=true. Never claim a count of blockers unless it matches selected blocking Questions.
- Keep the main output selective; Open Items handles completeness elsewhere.
{_grounding_rules(today)}

User request: {query}
Job: {selection.job}
Previous answer: {previous}
Selected validated context:
{json.dumps(context, ensure_ascii=False)}

{claims_guidance()}

Use record IDs on items whenever they correspond to a source record. Suggested refinements should be short actions."""


# Per-unit decisions for eval diagnostics (#567, Nov 11): when an eval sets this to a list, every claim, card and
# title the checks see is appended with its raw text, basis, cited records, decision and reason. Production never
# sets it, so nothing is collected and nothing withheld is ever sent to the browser.
UNIT_DECISIONS: ContextVar[list | None] = ContextVar("ask_unit_decisions", default=None)


def _log_decision(unit: str, raw_text: str | None, basis: str | None, primary: str | None, supporting: list[str],
                  decision: str, reason: str | None, found: tuple = ()) -> None:
    log = UNIT_DECISIONS.get()
    if log is None:
        return
    log.append({"unit": unit, "raw_text": raw_text, "basis": basis, "primary_record_id": primary,
                "supporting_record_ids": list(supporting), "decision": decision, "reason": reason,
                "assertions": [{"kind": a.kind, "phrase": a.phrase, "clause": a.clause, "historical": a.historical,
                                "attributed": a.attributed} for a in found]})


# The title a section shows when the model's title asserts a status or a go-ahead (#567, Nov 11).
SECTION_FALLBACK_TITLES = {
    "needs_review": "Needs your review", "questions": "Get these answered", "established": "Current State",
    "recent_context": "Recent context", "changes": "What changed", "open_attention": "Needs your attention",
    "draft": "Draft", "other": "Project context",
}


class _AnswerChecks:
    """The application-side checks on an answer's visible parts, built from the records Ask selected for this request.
    _validate_synthesis runs them on the finished answer; streaming runs the same object on each claim and section as
    it completes (#567), so nothing is shown while streaming that the finished answer would not show."""

    def __init__(self, context: Mapping[str, Any], candidates: Mapping[str, list[dict]] | None = None, *,
                 query: str = "", today: date | None = None, previous_answer: Mapping[str, Any] | None = None):
        self.context = context
        # #567 (Nov 11): an explicitly requested hypothetical draft (ask_drafts.py), or a refinement of one.
        self.draft = ask_drafts.draft_request(query, previous_answer)
        self.draft_used = False
        self.moved_items: list[AskAnswerItem] = []
        self.pool = candidates if candidates is not None else context
        self.allowed: dict[str, set[str]] = {
            "state": {x["id"] for x in context.get("state", [])},
            "review": {x["id"] for x in context.get("reviews", [])},
            "history": {x["id"] for x in context.get("history", [])},
            "evidence": {x["id"] for x in context.get("evidence", [])},
            "blocking_question": {x["id"] for x in context.get("questions", []) if x["blocking"]},
            "question": {x["id"] for x in context.get("questions", []) if not x["blocking"]},
            "answered_question": {x["id"] for x in context.get("answered_questions", [])},
        }
        self.all_internal_ids = set().union(*self.allowed.values(), {x["id"] for x in context.get("rules", [])})
        self.all_internal_ids |= _candidate_pool_ids(candidates)          # ids the model was shown, selected or not (#247)
        self.labels = _source_type_labels(candidates)                     # vendor_email -> vendor email (#478)
        self.canonical_reviews = {x["id"]: x for x in context.get("reviews", [])}
        self.canonical_questions = {x["id"]: x for x in context.get("questions", [])}
        self.canonical_answered = {x["id"]: x for x in context.get("answered_questions", [])}

        # #567 (Nov 11): the word backstop (_soften_unearned_settled_*) no longer runs on answers. Claims, cards and
        # titles are shown as written, withheld, or replaced by record text (ask_assertions), never reworded.
        self.checker = ClaimChecker(context, query=query, today=today)

    def clean(self, value: str | None) -> str | None:
        return _clean_visible_ask_text(value, self.all_internal_ids, self.labels)

    def claim(self, claim: AskClaim) -> AskClaim | None:
        """#567: the claim with its chip label, or None to withhold it. Software never edits a claim's words (Paige,
        Nov 11): it passes the reference and anchor checks (ask_claims) and the authority check (ask_assertions:
        what it asserts, and whether its cited records carry that), or it is withheld."""
        raw_text = claim.text
        claim.text = self.clean(claim.text) or ""
        label = self.checker.check_claim(claim.model_dump()) if claim.text else None
        if label is None:
            _log_decision("claim", raw_text, claim.basis, claim.primary_record_id, claim.supporting_record_ids,
                          "withheld", "reference or anchor check failed")
            return None
        verdict = ask_assertions.check(claim.text, claim.basis, self._authority_records(claim))
        if verdict.ok and self._restates_assumption(claim.text):
            verdict = ask_assertions.Verdict(False, "restates the draft's assumption as fact", verdict.assertions)
        if not verdict.ok:
            _log_decision("claim", raw_text, claim.basis, claim.primary_record_id, claim.supporting_record_ids,
                          "withheld", verdict.reason, verdict.assertions)
            return None
        claim.label = label or None
        _log_decision("claim", raw_text, claim.basis, claim.primary_record_id, claim.supporting_record_ids, "shown",
                      None, verdict.assertions)
        return claim

    def _restates_assumption(self, text: str) -> bool:
        """Outside the draft, a unit that states the draft's assumption as fact (most of its content words, with no
        negation, condition or attribution) is withheld: the assumption never becomes current fact (Nov 11)."""
        if not self.draft or self.draft.ambiguous:
            return False
        words = ask_drafts._content(self.draft.assumption)
        if not words or len(words & ask_drafts._content(text)) * 3 < len(words) * 2:
            return False
        return not (ask_assertions._NEGATION.search(text) or ask_assertions._NOT_ASSERTED.search(text)
                    or ask_assertions._REPORTING.search(text))

    def _draft_section(self, section: AskAnswerSection) -> bool:
        """The one section that gets the hypothetical-draft treatment: the first draft section (or the first whose
        title names a draft) in an answer to a request that qualifies."""
        if not self.draft or self.draft_used:
            return False
        title = (section.title or "").lower()
        return section.kind == "draft" or "draft" in title or self.draft.artifact in title

    def _authority_records(self, claim: AskClaim) -> dict[str, list[Mapping[str, Any]]]:
        """The cited records that can carry authority for the claim's basis: Current State records (primary, then
        supporting) for a current_state claim; the answered Question for an answered_question claim."""
        state = self.checker.records["state"]
        cited = [claim.primary_record_id, *claim.supporting_record_ids]
        if claim.basis == "current_state":
            return {"current_state": [state[r] for r in cited if r in state]}
        sources = {**self.checker.records["evidence"], **self.checker.records["review"], **self.checker.linked}
        out: dict[str, list[Mapping[str, Any]]] = {
            "supporting_current_state": [state[r] for r in claim.supporting_record_ids if r in state],
            # Evidence or a Review cited as support: the claim may report what it says (Nov 11).
            "cited_sources": [sources[r] for r in claim.supporting_record_ids if r in sources]}
        if claim.basis == "answered_question":
            record = self.checker.records["answered_question"].get(claim.primary_record_id or "")
            out["answered_question"] = [record] if record else []
        return out

    def _is_record_text(self, item: AskAnswerItem) -> bool:
        """Whether a card's text is its record's own text (a genuine record card), not new prose citing it."""
        record = (self.canonical_reviews.get(item.record_id or "") or self.canonical_questions.get(item.record_id or "")
                  or self.checker.card_record(item.record_type, item.record_id))
        if not record:
            return False
        own = " ".join(str(record.get(k) or "") for k in ("decision_question", "text", "statement", "content", "new_statement"))
        words = set(re.findall(r"[a-z0-9]+", (item.text or "").lower()))
        return bool(words) and len(words & set(re.findall(r"[a-z0-9]+", own.lower()))) * 10 >= len(words) * 8

    def _checked_draft(self, section: AskAnswerSection) -> tuple[AskAnswerSection, int]:
        """The hypothetical draft: software title and assumption line; the body may write as though the assumption
        holds (ask_drafts.check_body), detail lines are checked as usual, record cards move out of the draft."""
        req = self.draft
        self.draft_used = True
        section.kind = "draft"
        section.title = ask_drafts.title(req)
        hyp = AskHypothetical(artifact=req.artifact, assumption=req.assumption,
                              line=ask_drafts.assumption_line(req, self.pool))
        kept, withheld = [], 0
        for item in section.items:
            if item.record_type != "none":
                # Fresh comparison, Nov 11: the model labels its draft with the record it drafts from (a Review), and
                # moving it out showed the Review's text in its place, so the requested draft vanished. An item is a
                # record card only when its text is that record's own text; otherwise it is draft body and the record
                # id was its source.
                if self._is_record_text(item):
                    self.moved_items.append(item)
                    continue
                item.record_type, item.record_id = "none", None
            raw_text = item.text
            item.wording = "model"
            item.text = self.clean(item.text) or ""
            item.detail = self.clean(item.detail)
            verdict = ask_drafts.check_body(item.text, req, self.checker.open_sources) if item.text else \
                ask_assertions.Verdict(False, "empty")
            if verdict.ok and item.detail:
                detail = ask_assertions.check(item.detail, "none", {})
                if not detail.ok:
                    verdict = ask_assertions.Verdict(False, f"detail line: {detail.reason}", detail.assertions)
            _log_decision("draft", raw_text, "hypothetical", None, [], "shown" if verdict.ok else "withheld",
                          verdict.reason, verdict.assertions)
            if verdict.ok:
                kept.append(item)
            else:
                withheld += 1
        if withheld:
            hyp.notes.append(ask_drafts.ALL_WITHHELD_NOTE if not kept else ask_drafts.PART_WITHHELD_NOTE)
        section.items = kept
        section.hypothetical = hyp
        return section, withheld

    def section(self, section: AskAnswerSection) -> tuple[AskAnswerSection, int]:
        """The section with its cards checked, and how many cards were withheld."""
        section.hypothetical = None        # software-only: a model or browser value is never kept
        if self._draft_section(section):
            return self._checked_draft(section)
        withheld = 0
        raw_title = section.title
        section.title = self.clean(section.title) or "Project context"
        # A title asserts nothing on a record's authority, so one that states a status or a go-ahead is replaced by the
        # section kind's fixed title, never reworded (#567, Nov 11).
        title_check = ask_assertions.check(section.title, "none", {})
        if not title_check.ok:
            section.title = SECTION_FALLBACK_TITLES.get(section.kind, "Project context")
        _log_decision("title", raw_title, "none", None, [], "shown" if title_check.ok else "fallback",
                      title_check.reason, title_check.assertions)
        clean_items = []
        for item in section.items:
            item.wording = "model"
            if item.record_type == "none":
                raw_text = item.text
                item.text = self.clean(item.text) or "Project context"
                item.detail = self.clean(item.detail)
                # A free-text card cites no record, so it may not assert a status or a go-ahead: shown as written or
                # withheld (#567, Nov 11).
                verdict = ask_assertions.check(f"{item.text} {item.detail or ''}", "none", {})
                if verdict.ok and self._restates_assumption(f"{item.text} {item.detail or ''}"):
                    verdict = ask_assertions.Verdict(False, "restates the draft's assumption as fact", verdict.assertions)
                _log_decision("card", raw_text, "none", None, [], "shown" if verdict.ok else "withheld", verdict.reason,
                              verdict.assertions)
                if not verdict.ok:
                    withheld += 1
                    continue
                clean_items.append(item)
                continue
            if not (item.record_id and item.record_id in self.allowed.get(item.record_type, set())):
                # #567: a card whose record isn't among the selected records is withheld, and counted.
                withheld += 1
                continue
            # For unresolved decisions/questions, visible wording comes from
            # application-owned records rather than model paraphrase.
            if item.record_type == "review" and item.record_id in self.canonical_reviews:
                source = self.canonical_reviews[item.record_id]
                item.text = source["decision_question"]
                item.detail = source.get("why_consequential")
                item.wording = "record"
            elif item.record_type in {"question", "blocking_question"} and item.record_id in self.canonical_questions:
                source = self.canonical_questions[item.record_id]
                item.text = source["text"]
                item.detail = source.get("blocks") if item.record_type == "blocking_question" else None
                item.wording = "record"
            elif item.record_type == "answered_question" and item.record_id in self.canonical_answered:
                # #640: the Question and its recorded answer, from the records, never a model paraphrase.
                source = self.canonical_answered[item.record_id]
                item.text = source["text"]
                item.detail = ("Answered: " + source["answer"]) if source.get("answer") else "Answered."
                item.wording = "record"
            else:
                # #567: a Current State, History or Evidence card keeps the model's wording only when every number
                # and month it names is in its record; otherwise it shows the record's own text. Its reference has
                # already passed (selected, this project, this type, this status).
                record = self.checker.card_record(item.record_type, item.record_id)
                item.text = self.clean(item.text) or ""
                item.detail = self.clean(item.detail)
                if record is None:
                    withheld += 1
                    continue
                raw_text = item.text
                reason = None
                if not item.text or not anchors_supported(f"{item.text} {item.detail or ''}", [record_text(record)]):
                    reason = "anchor check failed"
                else:
                    # The model's wording of a record card is checked like a claim on that record (#567, Nov 11).
                    basis = {"state": "current_state", "history": "history", "evidence": "evidence_says"}[item.record_type]
                    verdict = ask_assertions.check(f"{item.text} {item.detail or ''}", basis,
                                                   {"current_state": [record]} if basis == "current_state" else {})
                    reason = verdict.reason
                if reason:
                    item.text, item.detail = canonical_card(item.record_type, record, self.labels)
                    item.wording = "record_fallback"
                _log_decision("card", raw_text, item.record_type, item.record_id, [],
                              "fallback" if reason else "shown", reason)
            clean_items.append(item)
        section.items = clean_items
        return section, withheld


def _validate_synthesis(
    answer: AskSynthesis, selection: AskSelection, context: Mapping[str, Any],
    candidates: Mapping[str, list[dict]] | None = None, *, query: str = "", today: date | None = None,
    previous_answer: Mapping[str, Any] | None = None,
) -> AskSynthesis:
    checks = _AnswerChecks(context, candidates, query=query, today=today, previous_answer=previous_answer)
    shown_claims = []
    for claim in answer.claims:
        checked = checks.claim(claim)
        if checked is None:
            answer.withheld_claims += 1
        else:
            shown_claims.append(checked)
    answer.claims = shown_claims
    answer.suggested_refinements = [cleaned for value in answer.suggested_refinements if (cleaned := checks.clean(value))]
    if answer.suggested_question:
        answer.suggested_question = checks.clean(answer.suggested_question) or None

    clean_sections = []
    for section in answer.sections:
        section, withheld = checks.section(section)
        answer.withheld_items += withheld
        clean_sections.append(section)
    if checks.moved_items:      # record cards the model put inside the draft, checked as usual outside it
        moved, withheld = checks.section(AskAnswerSection(kind="other", title="Project context", items=checks.moved_items))
        answer.withheld_items += withheld
        clean_sections.append(moved)
    answer.sections = _without_redundant_cards(answer.claims, clean_sections)
    _finish_hypothetical(answer, checks)
    allowed = checks.allowed
    uncertainty_allowed = allowed["review"] | allowed["blocking_question"] | allowed["question"]
    answer.source_ids = list(dict.fromkeys(x for x in answer.source_ids if x in checks.all_internal_ids))
    answer.uncertainty_ids = list(dict.fromkeys(x for x in answer.uncertainty_ids if x in uncertainty_allowed))

    present_reviews = {i.record_id for s in answer.sections for i in s.items if i.record_type == "review" and i.record_id}
    missing_reviews = [x for x in context.get("reviews", []) if x["id"] not in present_reviews]
    if missing_reviews:
        answer.sections.insert(0, AskAnswerSection(
            kind="needs_review", title="Needs your review",
            items=[AskAnswerItem(text=x["decision_question"], record_type="review", record_id=x["id"], detail=x["why_consequential"], wording="record") for x in missing_reviews]
        ))
    present_blockers = {i.record_id for s in answer.sections for i in s.items if i.record_type == "blocking_question" and i.record_id}
    missing_blockers = [x for x in context.get("questions", []) if x["blocking"] and x["id"] not in present_blockers]
    if missing_blockers:
        question_section = next((s for s in answer.sections if s.kind == "questions"), None)
        items = [AskAnswerItem(text=x["text"], record_type="blocking_question", record_id=x["id"], detail=x.get("blocks"), wording="record") for x in missing_blockers]
        if question_section:
            question_section.items = items + question_section.items
        else:
            answer.sections.append(AskAnswerSection(kind="questions", title="Get these answered", items=items))
    return answer



_CARD_WORD = re.compile(r"[a-z0-9$.,%]+")


def _card_words(text: str) -> set[str]:
    return {w.strip(".,") for w in _CARD_WORD.findall((text or "").lower()) if len(w.strip(".,")) > 2}


def _without_redundant_cards(claims: list[AskClaim], sections: list[AskAnswerSection]) -> list[AskAnswerSection]:
    """Paige, Nov 12 (P11): a Current State card repeating a shown claim that cites the same record is hidden, but only
    when the card adds no information: every word and figure in it (text and detail) is already in that claim. A
    claim may summarize part of a record (P13), so a card that adds anything stays. Not counted as withheld."""
    cited: dict[str, set[str]] = {}
    for claim in claims:
        if claim.basis == "current_state" and claim.primary_record_id:
            cited.setdefault(claim.primary_record_id, set()).update(_card_words(claim.text))
    if not cited:
        return sections
    kept_sections = []
    for section in sections:
        items = []
        for item in section.items:
            words = _card_words(f"{item.text} {item.detail or ''}")
            if item.record_type == "state" and item.record_id in cited and words and words <= cited[item.record_id]:
                _log_decision("card", item.text, "state", item.record_id, [], "hidden", "repeats a shown claim on the same record")
                continue
            items.append(item)
        if items or not section.items or section.hypothetical:
            section.items = items
            kept_sections.append(section)
    return kept_sections


def _finish_hypothetical(answer: AskSynthesis, checks: "_AnswerChecks") -> None:
    """#567 (Nov 11): after everything is checked, say so when no checked context about the draft's assumption is
    shown (never manufacture one), and offer to clarify an assumption State couldn't extract."""
    draft = next((s for s in answer.sections if s.hypothetical), None)
    if not draft or not checks.draft:
        return
    shown = [c.text for c in answer.claims] + [i.text for s in answer.sections if s is not draft for i in s.items]
    if not ask_drafts.relevant(checks.draft, shown) and ask_drafts.NO_CONTEXT_NOTE not in draft.hypothetical.notes:
        draft.hypothetical.notes.append(ask_drafts.NO_CONTEXT_NOTE)
    if checks.draft.ambiguous and ask_drafts.CLARIFY_REFINEMENT not in answer.suggested_refinements:
        answer.suggested_refinements.insert(0, ask_drafts.CLARIFY_REFINEMENT)


def _transform_keeping_drafts(query: str, answer: AskSynthesis) -> AskSynthesis:
    """Refinement transforms rebuild sections ("make this 3 bullets" merges them), which would separate a
    hypothetical draft from its assumption line. The draft section is set aside and put back as it was (Nov 11)."""
    drafts = [s for s in answer.sections if s.hypothetical]
    answer.sections = [s for s in answer.sections if not s.hypothetical]
    answer = apply_refinement_transform(query, answer)
    answer.sections = [*answer.sections, *drafts]
    return answer


def _normalize_meeting_prep(answer: AskSynthesis) -> AskSynthesis:
    """Make meeting prep read like a briefing rather than exposed retrieval machinery."""
    if answer.job != "meeting_prep":
        return answer
    from ask_contract import AskAnswerSection

    priority = {kind: index for index, kind in enumerate(MEETING_PREP_SECTION_ORDER)}
    merged: dict[str, AskAnswerSection] = {}
    seen_records: set[tuple[str, str]] = set()
    for section in answer.sections:
        kind = section.kind
        # Current facts belong in one quiet established section.
        if kind == "other" and any(i.record_type == "state" for i in section.items):
            kind = "established"
        target = merged.get(kind)
        if not target:
            target = AskAnswerSection(kind=kind, title=MEETING_PREP_SECTION_TITLES.get(kind, section.title), items=[])
            merged[kind] = target
        for item in section.items:
            key = (item.record_type, item.record_id or item.text.strip().lower())
            if key in seen_records:
                continue
            seen_records.add(key)
            # Renderer adds the label; store only the dependency itself.
            if item.record_type == "blocking_question" and item.detail:
                detail = item.detail.strip()
                if detail.lower().startswith("blocks:"):
                    item.detail = detail.split(":", 1)[1].strip()
            target.items.append(item)

    sections = []
    for kind, section in sorted(merged.items(), key=lambda kv: priority.get(kv[0], 99)):
        section.items = section.items[:MEETING_PREP_ITEM_CAPS.get(kind, 3)]
        if section.items:
            sections.append(section)
    answer.sections = sections[:MEETING_PREP_MAX_SECTIONS]
    answer.suggested_refinements = answer.suggested_refinements[:MEETING_PREP_MAX_REFINEMENTS]
    return answer


def _parse_streamed_json(text: str) -> Mapping[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def _finish_display_fields(answer: AskSynthesis, previous_answer: Mapping[str, Any] | None) -> None:
    """#567: software writes the headline (fixed per job) and the compatibility summary: the displayed claims as
    plain text with their chips, plus the withheld line when something was withheld. Runs after refinement
    transforms, which may clear the headline or the claims."""
    if answer.headline:
        answer.headline = fixed_headline(answer.job, previous_answer)
    lines = claim_lines(answer.model_dump())
    if has_withheld(answer.model_dump()):
        lines.append(withheld_line(answer.model_dump()))
    answer.summary = "\n".join(lines)


def _finalize_ask_result(
    candidates: Mapping[str, list[dict]],
    selection_raw: Mapping[str, Any],
    answer_raw: Mapping[str, Any],
    *,
    pipeline: str,
    context_ms: int,
    provider_ms: int,
    total_started: float,
    query: str,
    previous_answer: Mapping[str, Any] | None,
    db_ms: int | None = None,
    trim_ms: int | None = None,
    first_token_ms: int | None = None,
    today: date | None = None,
    first_validated_ms: int | None = None,
) -> dict[str, Any]:
    validation_started = time.perf_counter()
    selection = _validate_selection(AskSelection.model_validate(_bounded_selection_raw(selection_raw)), candidates)
    context = _selected_context(selection, candidates)
    prepared, withheld_before = prepare_answer_raw(answer_raw)
    answer = AskSynthesis.model_validate(prepared)
    answer.withheld_claims = withheld_before
    answer = _validate_synthesis(answer, selection, context, candidates, query=query, today=today,
                                 previous_answer=previous_answer)
    answer = _transform_keeping_drafts(query, _normalize_meeting_prep(answer))
    _finish_display_fields(answer, previous_answer)
    validation_ms = round((time.perf_counter() - validation_started) * 1000)

    selected_open = set(selection.review_ids + selection.blocking_question_ids + selection.question_ids)
    total_open = len(candidates["reviews"]) + len(candidates["questions"])
    remaining = max(0, total_open - len(selected_open))
    remaining_reviews = max(0, len(candidates["reviews"]) - len(selection.review_ids))
    total_ms = round((time.perf_counter() - total_started) * 1000)
    timing: dict[str, Any] = {
        "pipeline": pipeline,
        "context_ms": context_ms,
        "provider_ms": provider_ms,
        "validation_ms": validation_ms,
        "total_ms": total_ms,
    }
    # Stage breakdown for latency debugging. Optional so a caller that hasn't
    # measured a given sub-stage (e.g. the deterministic-refinement shortcut,
    # which has no model call) doesn't have to fake a number for it.
    if db_ms is not None:
        timing["db_ms"] = db_ms
    if trim_ms is not None:
        timing["trim_ms"] = trim_ms
    if first_token_ms is not None:
        timing["first_token_ms"] = first_token_ms
    if first_validated_ms is not None:
        # #567: when the first checked claim or section was sent, from the start of the request: what a person
        # waits for now that raw model text is no longer shown.
        timing["first_validated_ms"] = first_validated_ms
    return {
        "answer": answer.model_dump(),
        "selection": selection.model_dump(),
        "open_items_remaining": {"count": remaining, "reviews": remaining_reviews},
        "followup_mode": _followup_mode(query, previous_answer),
        "timing": timing,
    }


def _selection_raw_from_answer(answer: Mapping[str, Any]) -> dict[str, Any]:
    """Reconstruct an approximate selection payload from a previous answer's own
    record references, for the deterministic-refinement shortcut below, where no
    fresh model call selects new candidates. `_validate_selection` still checks
    every id against real candidates, so a stale or malformed id here is inert.
    """
    ids: dict[str, list[str]] = {"state": [], "review": [], "blocking_question": [], "question": [], "answered_question": [], "history": [], "evidence": []}
    for section in answer.get("sections", []) or []:
        for item in section.get("items", []) or []:
            record_type = item.get("record_type")
            record_id = item.get("record_id")
            if record_id and record_type in ids:
                ids[record_type].append(record_id)
    # #567 (Nov 12): the records the claims cite too. A Current State card that only repeated a claim is hidden
    # (_without_redundant_cards), so the cards alone no longer list every record the answer rests on. A supporting id's
    # type isn't stored; it is offered under each type, and _validate_selection drops it wherever it doesn't exist.
    basis_types = {"current_state": "state", "pending_review": "review", "evidence_says": "evidence", "history": "history",
                   "answered_question": "answered_question"}
    for claim in answer.get("claims") or []:
        if not isinstance(claim, Mapping):
            continue
        primary, basis = claim.get("primary_record_id"), claim.get("basis")
        if primary and basis in basis_types:
            ids[basis_types[basis]].append(primary)
        elif primary and basis == "open_question":
            ids["blocking_question"].append(primary)
            ids["question"].append(primary)
        for supporting in claim.get("supporting_record_ids") or []:
            if isinstance(supporting, str):
                for bucket in ids.values():
                    bucket.append(supporting)
    ids = {key: list(dict.fromkeys(values)) for key, values in ids.items()}
    return {
        "job": answer.get("job", "refinement"),
        "state_ids": ids["state"],
        "review_ids": ids["review"],
        "blocking_question_ids": ids["blocking_question"],
        "question_ids": ids["question"],
        "history_ids": ids["history"],
        "evidence_ids": ids["evidence"],
        "answered_question_ids": ids["answered_question"],
    }


def _refinement_shortcut_result(
    connection: Any,
    query: str,
    previous_answer: Mapping[str, Any],
    total_started: float,
    today: date | None = None,
) -> dict[str, Any]:
    """Serve a recognized refinement ("make this 3 bullets", "shorten it", "focus
    on blockers", etc.) without a model round-trip.

    ask_refinement_transforms.py already reshapes the prior answer with zero AI
    involvement -- the normal pipeline was paying for a full model call and then
    discarding most of its output to run this same transform anyway. Database
    reads still happen here (cheap, and needed for an honest open-items-remaining
    count against current State), but nothing goes to the model.
    """
    db_started = time.perf_counter()
    raw_candidates = _compact_candidates(connection)
    db_ms = round((time.perf_counter() - db_started) * 1000)
    trim_started = time.perf_counter()
    candidates = _trim_candidates_for_query(_retrieval_query(query, previous_answer), raw_candidates)
    trim_ms = round((time.perf_counter() - trim_started) * 1000)
    selection_raw = _selection_raw_from_answer(previous_answer)
    return _finalize_ask_result(
        candidates, selection_raw, previous_answer, pipeline="deterministic_refinement",
        context_ms=db_ms + trim_ms, provider_ms=0, total_started=total_started,
        query=query, previous_answer=previous_answer, db_ms=db_ms, trim_ms=trim_ms, today=today,
    )


class _StreamedAnswerScanner:
    """Reads the one-call Ask JSON as it streams ({"selection": {...}, "answer": {..., "claims": [...], "sections":
    [...], ...}}) and returns the selection once it is complete, then each claim and each section once its object is
    complete (#567). Nothing is returned before the selection, because nothing can be checked without it."""

    _SELECTION_KEY = re.compile(r'"selection"\s*:\s*')
    _ARRAYS = ("claims", "sections")      # in the order ANSWER_JSON_SCHEMA puts them

    def __init__(self) -> None:
        self.text = ""
        self.selection: Mapping[str, Any] | None = None
        self._search_from = 0
        self._array = 0                    # index into _ARRAYS
        self._pos: int | None = None       # inside the current array
        self._decoder = json.JSONDecoder()

    def feed(self, chunk: str) -> list[tuple[str, Mapping[str, Any]]]:
        """Add text; return ("claim" | "section", object) for each object completed by it."""
        self.text += chunk
        if self.selection is None:
            match = self._SELECTION_KEY.search(self.text)
            if not match:
                return []
            try:
                value, end = self._decoder.raw_decode(self.text, match.end())
            except json.JSONDecodeError:
                return []
            if not isinstance(value, Mapping):
                self._array = len(self._ARRAYS)
                return []
            self.selection, self._search_from = value, end
        found: list[tuple[str, Mapping[str, Any]]] = []
        while self._array < len(self._ARRAYS):
            name = self._ARRAYS[self._array]
            if self._pos is None:
                match = re.compile(rf'"{name}"\s*:\s*\[').search(self.text, self._search_from)
                if not match:
                    break
                self._pos = match.end()
            pos = self._pos
            while pos < len(self.text) and self.text[pos] in " \t\r\n,":
                pos += 1
            if pos >= len(self.text):
                break
            if self.text[pos] == "]":
                self._array, self._pos, self._search_from = self._array + 1, None, pos + 1
                continue
            try:
                value, end = self._decoder.raw_decode(self.text, pos)
            except json.JSONDecodeError:
                break
            self._pos = end
            if isinstance(value, Mapping):
                found.append((name[:-1], value))
        return found


class _StreamChecks:
    """Checks streamed claims and sections with the same _AnswerChecks the finished answer uses."""

    def __init__(self, selection_raw: Any, candidates: Mapping[str, list[dict]], query: str, today: date | None,
                 previous_answer: Mapping[str, Any] | None = None):
        selection = _validate_selection(AskSelection.model_validate(_bounded_selection_raw(selection_raw)), candidates)
        self.checks = _AnswerChecks(_selected_context(selection, candidates), candidates, query=query, today=today,
                                    previous_answer=previous_answer)
        self.claims_kept = 0        # prepare_answer_raw keeps the first MAX_CLAIMS claims that pass its bounds
        self.claim_index = 0
        self.section_index = 0

    def claim_event(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        index, self.claim_index = self.claim_index, self.claim_index + 1
        prepared, withheld = prepare_answer_raw({"claims": [raw]})
        if withheld or not prepared["claims"] or self.claims_kept >= MAX_CLAIMS:
            return {"index": index, "status": "withheld"}
        self.claims_kept += 1
        try:
            checked = self.checks.claim(AskClaim.model_validate(prepared["claims"][0]))
        except ValueError:
            checked = None
        if checked is None:
            return {"index": index, "status": "withheld"}
        return {"index": index, "status": "shown", "claim": checked.model_dump()}

    def section_event(self, raw: Mapping[str, Any]) -> dict[str, Any] | None:
        index, self.section_index = self.section_index, self.section_index + 1
        try:
            section, withheld = self.checks.section(AskAnswerSection.model_validate(raw))
        except ValueError:
            return None             # the finished answer fails validation too, and the endpoint retries
        return {"index": index, "section": section.model_dump(), "withheld_items": withheld}


def stream_ask_events(
    connection: Any,
    provider: AskProvider,
    query: str,
    previous_answer: Mapping[str, Any] | None = None,
    today: date | None = None,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield grounded-context status, real provider deltas, then a validated final Ask payload."""
    total_started = time.perf_counter()

    # A hypothetical draft is refined by the model (keeping its assumption), not by the deterministic transforms.
    if previous_answer and detect_refinement_type(query) and not ask_drafts.previous_draft(previous_answer):
        yield "final", _refinement_shortcut_result(connection, query, previous_answer, total_started, today)
        return

    db_started = time.perf_counter()
    raw_candidates = _compact_candidates(connection)
    db_ms = round((time.perf_counter() - db_started) * 1000)
    trim_started = time.perf_counter()
    candidates = _trim_candidates_for_query(_retrieval_query(query, previous_answer), raw_candidates)
    trim_ms = round((time.perf_counter() - trim_started) * 1000)
    context_ms = db_ms + trim_ms
    yield "preview", {
        "counts": {
            "reviews": len(candidates["reviews"]),
            "blockers": sum(1 for x in candidates["questions"] if x.get("blocking")),
            "questions": sum(1 for x in candidates["questions"] if not x.get("blocking")),
        }
    }

    if not hasattr(provider, "stream"):
        result = run_ask(connection, provider, query, previous_answer, today=today)
        yield "final", result
        return

    provider_started = time.perf_counter()
    first_token_ms: int | None = None
    chunks: list[str] = []
    # #567: the browser never receives the model's raw text. Each claim and each section is checked against the
    # selected records (the same checks as the finished answer) once the selection and that object are complete, and
    # only then sent. The final payload stays authoritative.
    scanner = _StreamedAnswerScanner()
    stream_checks: _StreamChecks | None = None
    selection_failed = False
    first_validated_ms: int | None = None
    for text in provider.stream(_one_call_prompt(query, candidates, previous_answer, today=today)):
        if not text:
            continue
        if first_token_ms is None:
            first_token_ms = round((time.perf_counter() - provider_started) * 1000)
        chunks.append(text)
        for kind, raw in scanner.feed(text):
            if selection_failed:
                break
            if stream_checks is None:
                try:
                    stream_checks = _StreamChecks(scanner.selection, candidates, query, today, previous_answer)
                except ValueError:
                    selection_failed = True     # it fails the finished answer too; nothing is shown
                    break
            event = stream_checks.claim_event(raw) if kind == "claim" else stream_checks.section_event(raw)
            if event is not None:
                if first_validated_ms is None and (event.get("status") == "shown" or event.get("section")):
                    first_validated_ms = round((time.perf_counter() - total_started) * 1000)
                yield kind, event
    provider_ms = round((time.perf_counter() - provider_started) * 1000)
    _persist_model_call_metrics(connection, provider)
    combined = _parse_streamed_json("".join(chunks))
    selection_raw = combined.get("selection")
    answer_raw = combined.get("answer")
    result = _finalize_ask_result(
        candidates, selection_raw, answer_raw, pipeline="one_call_stream",
        context_ms=context_ms, provider_ms=provider_ms, total_started=total_started,
        query=query, previous_answer=previous_answer, db_ms=db_ms, trim_ms=trim_ms, first_token_ms=first_token_ms,
        today=today, first_validated_ms=first_validated_ms,
    )
    yield "final", result


def run_ask(connection: Any, provider: AskProvider, query: str, previous_answer: Mapping[str, Any] | None = None, today: date | None = None) -> dict[str, Any]:
    total_started = time.perf_counter()

    # A hypothetical draft is refined by the model (keeping its assumption), not by the deterministic transforms.
    if previous_answer and detect_refinement_type(query) and not ask_drafts.previous_draft(previous_answer):
        return _refinement_shortcut_result(connection, query, previous_answer, total_started, today)

    db_started = time.perf_counter()
    raw_candidates = _compact_candidates(connection)
    db_ms = round((time.perf_counter() - db_started) * 1000)
    trim_started = time.perf_counter()
    candidates = _trim_candidates_for_query(_retrieval_query(query, previous_answer), raw_candidates)
    trim_ms = round((time.perf_counter() - trim_started) * 1000)
    context_ms = db_ms + trim_ms

    provider_started = time.perf_counter()
    if hasattr(provider, "synthesize_selected") and not hasattr(provider, "run"):
        # Deterministic compatibility path for direct-fact providers. Relevance is
        # selected by application code; the model/provider only phrases the answer.
        evidence_ids = [candidates["evidence"][0]["id"]] if candidates["evidence"] else []
        linked_reviews = [r["id"] for r in candidates["reviews"] if set(r.get("evidence_ids", [])) & set(evidence_ids)]
        selection = AskSelection(
            job="current_fact", state_ids=[], review_ids=linked_reviews,
            blocking_question_ids=[], question_ids=[], history_ids=[], evidence_ids=evidence_ids,
        )
        selection_raw = selection.model_dump()
        selected = _selected_context(selection, candidates)
        answer_raw = provider.synthesize_selected(_synthesis_prompt(query, selection, selected, previous_answer, today=today))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        pipeline = "deterministic_fact_one_call"
    elif hasattr(provider, "run"):
        combined = provider.run(_one_call_prompt(query, candidates, previous_answer, today=today))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        selection_raw = combined.get("selection")
        answer_raw = combined.get("answer")
        pipeline = "one_call"
    else:
        # Compatibility path for deterministic test providers while R9.1 lands.
        selection_raw = provider.select(_selector_prompt(query, candidates, previous_answer, today=today))
        selection = _validate_selection(AskSelection.model_validate(_bounded_selection_raw(selection_raw)), candidates)
        selected = _selected_context(selection, candidates)
        answer_raw = provider.synthesize(_synthesis_prompt(query, selection, selected, previous_answer, today=today))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        pipeline = "two_call_compat"

    _persist_model_call_metrics(connection, provider)
    return _finalize_ask_result(
        candidates, selection_raw, answer_raw, pipeline=pipeline,
        context_ms=context_ms, provider_ms=provider_ms, total_started=total_started,
        query=query, previous_answer=previous_answer, db_ms=db_ms, trim_ms=trim_ms, today=today,
    )
