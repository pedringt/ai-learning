"""Authority-aware candidate selection and synthesis orchestration for State Ask."""
from __future__ import annotations

import json
import re
import time
from typing import Any, Iterator, Mapping, Protocol

from ask_contract import AskSelection, AskSynthesis
from ask_refinement_transforms import apply_refinement_transform
from review_service import list_evidence, list_history, list_project_rules, list_questions, list_reviews, list_state


class AskProvider(Protocol):
    def run(self, prompt: str) -> Mapping[str, Any]: ...


def _compact_candidates(connection: Any) -> dict[str, list[dict]]:
    state = list_state(connection)
    reviews = list_reviews(connection, "open")
    questions = list_questions(connection, "open")
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
        } for x in reviews],
        "questions": [{"id": x["id"], "text": x["text"], "blocking": bool(x["blocking"]), "blocks": x["blocks"], "authority": "known_unknown"} for x in questions],
        "history": [{
            "id": x["id"], "state_item_id": x["state_item_id"], "old_statement": x.get("old_statement"),
            "new_statement": x.get("new_statement"), "changed_at": str(x.get("changed_at") or ""),
            "decision_question": x.get("decision_question"), "authority": "accepted_past_transition",
        } for x in history],
        "evidence": [{
            "id": x["id"], "content": x["content"], "source_type": x["source_type"],
            "submitted_at": str(x.get("submitted_at") or ""), "authority": "supporting_or_event_evidence"
        } for x in evidence],
        "rules": [{"id": x["id"], "text": x["text"], "category": x["category"], "authority": "interpretation_guardrail"} for x in rules],
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

    return {
        "state": state[:14],
        "reviews": reviews,
        "questions": ranked("questions", 12),
        "history": ranked("history", 10),
        "evidence": ranked("evidence", 12),
        "rules": list(candidates["rules"]),
    }


_TRANSFORM_RE = re.compile(r"\b(shorter|shorten|concise|brief(er)?|make (?:this|it)|turn (?:this|it)|format|agenda|bullets?|leadership(?:-ready)?|more detail(?:ed)?|focus(?: only)?|rewrite|summari[sz]e)\b", re.I)
_FOLLOWUP_RE = re.compile(r"\b(source|support(?:s|ed)?|why|how do we know|where did|what about|which|clarif|explain|that|this|it|those|these)\b", re.I)

def _followup_mode(query: str, previous_answer: Mapping[str, Any] | None) -> str:
    """Deterministically decide whether a continuation replaces or appends."""
    if not previous_answer:
        return "new"
    q = query.strip().lower()
    if _TRANSFORM_RE.search(q):
        return "replace"
    return "append"

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

def _one_call_prompt(query: str, candidates: Mapping[str, Any], previous_answer: Mapping[str, Any] | None) -> str:
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
- Open Reviews qualify Current State; they never replace it. Include a Review when it materially challenges State used by the answer.
- A Question is blocking only when its supplied record says blocking=true. Ordinary Questions are known unknowns, not blockers.
- History is accepted past change. Evidence is what was said or observed and cannot silently override Current State.
- Project Rules constrain interpretation.
- Unknown must remain unknown. Newer does not mean more authoritative. Approval does not mean implementation.
- Optimize for relevance, not completeness. Omit tempting recent noise.
- Refinement may change format, audience, length, focus, or ordering, but never project truth.{refinement_guidance}
- For meeting prep, frame relevant Questions as opportunities to get answered.
- Meeting prep is a portable working brief, not a dashboard or record dump. It should be useful when pasted into a meeting document and leave room for live notes.
- For meeting prep, prefer this information architecture when supported: concise before-the-meeting summary; Decisions needed; Questions to get answered; Useful context. State navigation/actions are rendered separately by the client.
- Do not repeat the same issue across multiple sections. A Review and linked Question may both appear, but explain each once.
- Never call something a blocker unless the supplied Question says blocking=true. Never claim a count of blockers unless it matches selected blocking Questions.

Job choices: current_fact, meeting_prep, catch_up, project_update, why_or_provenance, attention_check, historical, drafting, general_project_synthesis, refinement.

User request: {query}
Previous answer (for refinement only): {previous}

Authority-tagged candidate records:
{json.dumps(candidates, ensure_ascii=False)}

Return the required JSON object with both `selection` and `answer`. Every answer record_id must be present in the selection and candidate records. Relevant Reviews must appear visibly in the main answer, not only in source_ids. For meeting prep: use at most 4 sections, at most 4 items per section, and at most 3 established Current State items. Prefer one synthesized opening over many State cards. Do not create a section titled Current State or Open Reviews Qualifying Current State. Keep the full answer comfortably under 500 words.
Use concise adaptive sections and short suggested refinements."""

def _selector_prompt(query: str, candidates: Mapping[str, Any], previous_answer: Mapping[str, Any] | None) -> str:
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
- For refinement requests, select records for the TRANSFORMED answer, not the prior one:
  - "shorten it": select only the most essential records (top 30% by importance)
  - "make this 3 bullets": select exactly 3 key facts worth a bullet point each
  - "focus only on blockers": select ONLY Questions where blocking=true and their linked Reviews
  - "turn into agenda": select records that form agenda topics (decisions, timeline, risks)
  - "make it leadership-ready": select only decision/status/risk-relevant records
  - "more detailed": select all supporting records to expand context
  - "what source supports X?" (conversational): select additional source evidence to append

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
    return out


def _synthesis_prompt(query: str, selection: AskSelection, context: Mapping[str, Any], previous_answer: Mapping[str, Any] | None) -> str:
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
- Unknown must remain unknown. Do not infer absence from missing information.
- Refinement may change format, audience, length, focus, or ordering; it may not change project truth.{refinement_guidance}
- For meeting prep, frame relevant Questions as opportunities to get answered.
- Meeting prep is a portable working brief, not a dashboard or record dump. It should be useful when pasted into a meeting document and leave room for live notes.
- For meeting prep, prefer this information architecture when supported: concise before-the-meeting summary; Decisions needed; Questions to get answered; Useful context. State navigation/actions are rendered separately by the client.
- Do not repeat the same issue across multiple sections. A Review and linked Question may both appear, but explain each once.
- Never call something a blocker unless the supplied Question says blocking=true. Never claim a count of blockers unless it matches selected blocking Questions.
- Keep the main output selective; Open Items handles completeness elsewhere.

User request: {query}
Job: {selection.job}
Previous answer: {previous}
Selected validated context:
{json.dumps(context, ensure_ascii=False)}

Use record IDs on items whenever they correspond to a source record. Suggested refinements should be short actions."""


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
    text = re.sub(r"\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—:;,.")
    return text or None


def _validate_synthesis(answer: AskSynthesis, selection: AskSelection, context: Mapping[str, Any]) -> AskSynthesis:
    allowed: dict[str, set[str]] = {
        "state": {x["id"] for x in context.get("state", [])},
        "review": {x["id"] for x in context.get("reviews", [])},
        "history": {x["id"] for x in context.get("history", [])},
        "evidence": {x["id"] for x in context.get("evidence", [])},
        "blocking_question": {x["id"] for x in context.get("questions", []) if x["blocking"]},
        "question": {x["id"] for x in context.get("questions", []) if not x["blocking"]},
    }
    all_internal_ids = set().union(*allowed.values(), {x["id"] for x in context.get("rules", [])})
    canonical_reviews = {x["id"]: x for x in context.get("reviews", [])}
    canonical_questions = {x["id"]: x for x in context.get("questions", [])}

    answer.headline = _clean_visible_ask_text(answer.headline, all_internal_ids) or "Project answer"
    answer.summary = _clean_visible_ask_text(answer.summary, all_internal_ids) or "See the grounded project details below."
    answer.suggested_refinements = [
        cleaned for value in answer.suggested_refinements
        if (cleaned := _clean_visible_ask_text(value, all_internal_ids))
    ]

    clean_sections = []
    for section in answer.sections:
        section.title = _clean_visible_ask_text(section.title, all_internal_ids) or "Project context"
        clean_items = []
        for item in section.items:
            if item.record_type == "none":
                item.text = _clean_visible_ask_text(item.text, all_internal_ids) or "Project context"
                item.detail = _clean_visible_ask_text(item.detail, all_internal_ids)
                clean_items.append(item)
                continue
            if item.record_id and item.record_id in allowed.get(item.record_type, set()):
                # For unresolved decisions/questions, visible wording comes from
                # application-owned records rather than model paraphrase.
                if item.record_type == "review" and item.record_id in canonical_reviews:
                    source = canonical_reviews[item.record_id]
                    item.text = source["decision_question"]
                    item.detail = source.get("why_consequential")
                elif item.record_type in {"question", "blocking_question"} and item.record_id in canonical_questions:
                    source = canonical_questions[item.record_id]
                    item.text = source["text"]
                    item.detail = source.get("blocks") if item.record_type == "blocking_question" else None
                else:
                    item.text = _clean_visible_ask_text(item.text, all_internal_ids) or "Project context"
                    item.detail = _clean_visible_ask_text(item.detail, all_internal_ids)
                clean_items.append(item)
        section.items = clean_items
        clean_sections.append(section)
    answer.sections = clean_sections
    all_allowed_ids = all_internal_ids
    uncertainty_allowed = allowed["review"] | allowed["blocking_question"] | allowed["question"]
    answer.source_ids = list(dict.fromkeys(x for x in answer.source_ids if x in all_allowed_ids))
    answer.uncertainty_ids = list(dict.fromkeys(x for x in answer.uncertainty_ids if x in uncertainty_allowed))

    present_reviews = {i.record_id for s in answer.sections for i in s.items if i.record_type == "review" and i.record_id}
    missing_reviews = [x for x in context.get("reviews", []) if x["id"] not in present_reviews]
    if missing_reviews:
        from ask_contract import AskAnswerItem, AskAnswerSection
        answer.sections.insert(0, AskAnswerSection(
            kind="needs_review", title="Needs your review",
            items=[AskAnswerItem(text=x["decision_question"], record_type="review", record_id=x["id"], detail=x["why_consequential"]) for x in missing_reviews]
        ))
    present_blockers = {i.record_id for s in answer.sections for i in s.items if i.record_type == "blocking_question" and i.record_id}
    missing_blockers = [x for x in context.get("questions", []) if x["blocking"] and x["id"] not in present_blockers]
    if missing_blockers:
        from ask_contract import AskAnswerItem, AskAnswerSection
        question_section = next((s for s in answer.sections if s.kind == "questions"), None)
        items = [AskAnswerItem(text=x["text"], record_type="blocking_question", record_id=x["id"], detail=x.get("blocks")) for x in missing_blockers]
        if question_section:
            question_section.items = items + question_section.items
        else:
            answer.sections.append(AskAnswerSection(kind="questions", title="Get these answered", items=items))
    return answer



def _normalize_meeting_prep(answer: AskSynthesis) -> AskSynthesis:
    """Make meeting prep read like a briefing rather than exposed retrieval machinery."""
    if answer.job != "meeting_prep":
        return answer
    from ask_contract import AskAnswerSection

    priority = {"needs_review": 0, "questions": 1, "established": 2, "recent_context": 3, "changes": 4, "open_attention": 5, "draft": 6, "other": 7}
    merged: dict[str, AskAnswerSection] = {}
    seen_records: set[tuple[str, str]] = set()
    for section in answer.sections:
        kind = section.kind
        # Current facts belong in one quiet established section.
        if kind == "other" and any(i.record_type == "state" for i in section.items):
            kind = "established"
        target = merged.get(kind)
        if not target:
            titles = {
                "needs_review": "Decisions needed",
                "questions": "Get these answered",
                "established": "Useful context",
                "recent_context": "Recent context",
                "changes": "What changed",
                "open_attention": "Useful context",
            }
            target = AskAnswerSection(kind=kind, title=titles.get(kind, section.title), items=[])
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

    caps = {"needs_review": 2, "questions": 4, "established": 3, "recent_context": 2, "changes": 2, "open_attention": 3, "draft": 4, "other": 2}
    sections = []
    for kind, section in sorted(merged.items(), key=lambda kv: priority.get(kv[0], 99)):
        section.items = section.items[:caps.get(kind, 3)]
        if section.items:
            sections.append(section)
    answer.sections = sections[:4]
    answer.suggested_refinements = answer.suggested_refinements[:3]
    return answer


def _parse_streamed_json(text: str) -> Mapping[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


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
) -> dict[str, Any]:
    validation_started = time.perf_counter()
    selection = _validate_selection(AskSelection.model_validate(selection_raw), candidates)
    context = _selected_context(selection, candidates)
    answer = apply_refinement_transform(query, _normalize_meeting_prep(_validate_synthesis(AskSynthesis.model_validate(answer_raw), selection, context)))
    validation_ms = round((time.perf_counter() - validation_started) * 1000)

    selected_open = set(selection.review_ids + selection.blocking_question_ids + selection.question_ids)
    total_open = len(candidates["reviews"]) + len(candidates["questions"])
    remaining = max(0, total_open - len(selected_open))
    remaining_reviews = max(0, len(candidates["reviews"]) - len(selection.review_ids))
    total_ms = round((time.perf_counter() - total_started) * 1000)
    return {
        "answer": answer.model_dump(),
        "selection": selection.model_dump(),
        "open_items_remaining": {"count": remaining, "reviews": remaining_reviews},
        "followup_mode": _followup_mode(query, previous_answer),
        "timing": {
            "pipeline": pipeline,
            "context_ms": context_ms,
            "provider_ms": provider_ms,
            "validation_ms": validation_ms,
            "total_ms": total_ms,
        },
    }


def stream_ask_events(
    connection: Any,
    provider: AskProvider,
    query: str,
    previous_answer: Mapping[str, Any] | None = None,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield grounded-context status, real provider deltas, then a validated final Ask payload."""
    total_started = time.perf_counter()
    context_started = time.perf_counter()
    candidates = _trim_candidates_for_query(_retrieval_query(query, previous_answer), _compact_candidates(connection))
    context_ms = round((time.perf_counter() - context_started) * 1000)
    yield "preview", {
        "counts": {
            "reviews": len(candidates["reviews"]),
            "blockers": sum(1 for x in candidates["questions"] if x.get("blocking")),
            "questions": sum(1 for x in candidates["questions"] if not x.get("blocking")),
        }
    }

    if not hasattr(provider, "stream"):
        result = run_ask(connection, provider, query, previous_answer)
        yield "final", result
        return

    provider_started = time.perf_counter()
    chunks: list[str] = []
    for text in provider.stream(_one_call_prompt(query, candidates, previous_answer)):
        if not text:
            continue
        chunks.append(text)
        yield "delta", {"text": text}
    provider_ms = round((time.perf_counter() - provider_started) * 1000)
    combined = _parse_streamed_json("".join(chunks))
    selection_raw = combined.get("selection")
    answer_raw = combined.get("answer")
    result = _finalize_ask_result(
        candidates, selection_raw, answer_raw, pipeline="one_call_stream",
        context_ms=context_ms, provider_ms=provider_ms, total_started=total_started,
        query=query, previous_answer=previous_answer,
    )
    yield "final", result


def run_ask(connection: Any, provider: AskProvider, query: str, previous_answer: Mapping[str, Any] | None = None) -> dict[str, Any]:
    total_started = time.perf_counter()
    context_started = time.perf_counter()
    candidates = _trim_candidates_for_query(_retrieval_query(query, previous_answer), _compact_candidates(connection))
    context_ms = round((time.perf_counter() - context_started) * 1000)

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
        answer_raw = provider.synthesize_selected(_synthesis_prompt(query, selection, selected, previous_answer))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        pipeline = "deterministic_fact_one_call"
    elif hasattr(provider, "run"):
        combined = provider.run(_one_call_prompt(query, candidates, previous_answer))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        selection_raw = combined.get("selection")
        answer_raw = combined.get("answer")
        pipeline = "one_call"
    else:
        # Compatibility path for deterministic test providers while R9.1 lands.
        selection_raw = provider.select(_selector_prompt(query, candidates, previous_answer))
        selection = _validate_selection(AskSelection.model_validate(selection_raw), candidates)
        selected = _selected_context(selection, candidates)
        answer_raw = provider.synthesize(_synthesis_prompt(query, selection, selected, previous_answer))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        pipeline = "two_call_compat"

    return _finalize_ask_result(
        candidates, selection_raw, answer_raw, pipeline=pipeline,
        context_ms=context_ms, provider_ms=provider_ms, total_started=total_started,
        query=query, previous_answer=previous_answer,
    )
