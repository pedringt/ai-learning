"""Authority-aware candidate selection and synthesis orchestration for State Ask."""
from __future__ import annotations

import json
import re
import time
from typing import Any, Mapping, Protocol

from ask_contract import AskSelection, AskSynthesis
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


def _is_explicit_meeting_prep(query: str) -> bool:
    """Use the fast path only when the requested job is unambiguous."""
    words = set(re.findall(r"[a-z0-9]+", query.lower()))
    return "meeting" in words and bool(words.intersection({"prep", "prepare", "brief", "briefing"}))


def _deterministic_meeting_selection(candidates: Mapping[str, list[dict]]) -> AskSelection:
    """Select a compact, authority-safe meeting context without a model round-trip.

    Candidates are already relevance-ranked for the query. Reviews and concrete
    blockers get priority; linked State/Questions are then restored by the normal
    validation safety net.
    """
    reviews = list(candidates["reviews"][:3])
    blocking = [x for x in candidates["questions"] if x.get("blocking")][:3]
    ordinary = [x for x in candidates["questions"] if not x.get("blocking")][:3]

    required_state = {sid for r in reviews for sid in r.get("affected_state_ids", [])}
    state_ids = list(required_state)
    for item in candidates["state"]:
        if item["id"] not in state_ids:
            state_ids.append(item["id"])
        if len(state_ids) >= 6:
            break

    required_evidence = {eid for r in reviews for eid in r.get("evidence_ids", [])}
    evidence_ids = list(required_evidence)
    for item in candidates["evidence"]:
        if item["id"] not in evidence_ids:
            evidence_ids.append(item["id"])
        if len(evidence_ids) >= 6:
            break

    return AskSelection(
        job="meeting_prep",
        state_ids=state_ids[:6],
        review_ids=[x["id"] for x in reviews],
        blocking_question_ids=[x["id"] for x in blocking],
        question_ids=[x["id"] for x in ordinary],
        history_ids=[x["id"] for x in candidates["history"][:3]],
        evidence_ids=evidence_ids[:6],
    )


def _one_call_prompt(query: str, candidates: Mapping[str, Any], previous_answer: Mapping[str, Any] | None) -> str:
    previous = json.dumps(previous_answer, ensure_ascii=False)[:12000] if previous_answer else "null"
    return f"""You are State Ask. In one response, first select the project records relevant to the request, then synthesize the grounded answer from only those selected records.

Authority rules are non-negotiable:
- Current State governs what is true, allowed, or in scope now.
- Open Reviews qualify Current State; they never replace it. Include a Review when it materially challenges State used by the answer.
- A Question is blocking only when its supplied record says blocking=true. Ordinary Questions are known unknowns, not blockers.
- History is accepted past change. Evidence is what was said or observed and cannot silently override Current State.
- Project Rules constrain interpretation.
- Unknown must remain unknown. Newer does not mean more authoritative. Approval does not mean implementation.
- Optimize for relevance, not completeness. Omit tempting recent noise.
- Refinement may change format, audience, length, focus, or ordering, but never project truth.
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

Job choices: current_fact, meeting_prep, catch_up, project_update, why_or_provenance, attention_check, historical, drafting, general_project_synthesis, refinement.

User request: {query}
Previous answer (for refinement only): {previous}

Candidate records:
{json.dumps(candidates, ensure_ascii=False)}

Return only IDs from the supplied candidates in the required JSON schema."""


_SELECTION_LIMITS = {
    "state_ids": 12,
    "review_ids": 8,
    "blocking_question_ids": 8,
    "question_ids": 10,
    "history_ids": 12,
    "evidence_ids": 12,
}


def _selection_from_raw(raw: Mapping[str, Any]) -> AskSelection:
    """Normalize provider cardinality before strict contract validation.

    Structured-output schemas should keep providers inside these bounds, but
    software remains the final enforcement layer. Preserve provider ordering
    while deduplicating and trimming excess IDs.
    """
    data = dict(raw)
    for field, limit in _SELECTION_LIMITS.items():
        values = data.get(field, [])
        if not isinstance(values, list):
            continue
        data[field] = list(dict.fromkeys(values))[:limit]
    return AskSelection.model_validate(data)


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
    # Mandatory authority context wins over model-selected optional context
    # when the bounded contract is full.
    data["review_ids"] = list(dict.fromkeys(mandatory_reviews + data["review_ids"]))[:_SELECTION_LIMITS["review_ids"]]

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
        data[field] = list(dict.fromkeys([qid] + data[field]))[:_SELECTION_LIMITS[field]]
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
    return f"""You synthesize State Ask answers from authority-labeled project records.
Return a useful answer first, not a record dump. Use concise adaptive sections.

Non-negotiable rules:
- Current State governs present truth.
- Relevant open Reviews must be visible in the main answer under needs_review, never hidden only in sources.
- confirmed blockers must remain distinct from ordinary open Questions. For a blocker, include its exact 'blocks' dependency in detail.
- Evidence may describe activity/claims but may not silently override Current State.
- Unknown must remain unknown. Do not infer absence from missing information.
- Refinement may change format, audience, length, focus, or ordering; it may not change project truth.
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


def _validate_synthesis(answer: AskSynthesis, selection: AskSelection, context: Mapping[str, Any]) -> AskSynthesis:
    allowed: dict[str, set[str]] = {
        "state": {x["id"] for x in context.get("state", [])},
        "review": {x["id"] for x in context.get("reviews", [])},
        "history": {x["id"] for x in context.get("history", [])},
        "evidence": {x["id"] for x in context.get("evidence", [])},
        "blocking_question": {x["id"] for x in context.get("questions", []) if x["blocking"]},
        "question": {x["id"] for x in context.get("questions", []) if not x["blocking"]},
    }
    clean_sections = []
    for section in answer.sections:
        clean_items = []
        for item in section.items:
            if item.record_type == "none":
                clean_items.append(item); continue
            if item.record_id and item.record_id in allowed.get(item.record_type, set()):
                clean_items.append(item)
        section.items = clean_items
        clean_sections.append(section)
    answer.sections = clean_sections
    all_allowed_ids = set().union(*allowed.values(), {x["id"] for x in context.get("rules", [])})
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


def build_ask_preview(connection: Any, query: str) -> dict[str, Any]:
    """Return an immediate, software-grounded preview while synthesis runs.

    This intentionally does not ask the model to infer anything. For explicit
    meeting-prep jobs it uses the same deterministic selection and authority
    validation as the fast Ask path, so every count reflects records that may
    legitimately appear in the final answer. Other jobs get a neutral progress
    state until their provider-driven selection is available.
    """
    started = time.perf_counter()
    candidates = _trim_candidates_for_query(query, _compact_candidates(connection))
    if not _is_explicit_meeting_prep(query):
        return {
            "job": "general",
            "grounded": False,
            "message": "Checking Current State and open items…",
            "counts": {},
            "elapsed_ms": round((time.perf_counter() - started) * 1000),
        }

    selection = _validate_selection(_deterministic_meeting_selection(candidates), candidates)
    counts = {
        "reviews": len(selection.review_ids),
        "blockers": len(selection.blocking_question_ids),
        "questions": len(selection.question_ids),
        "state": len(selection.state_ids),
    }
    parts = []
    if counts["reviews"]:
        parts.append(f"{counts['reviews']} relevant {'Review' if counts['reviews'] == 1 else 'Reviews'}")
    if counts["blockers"]:
        parts.append(f"{counts['blockers']} {'blocker' if counts['blockers'] == 1 else 'blockers'}")
    if counts["questions"]:
        parts.append(f"{counts['questions']} open {'question' if counts['questions'] == 1 else 'questions'}")
    if counts["state"]:
        parts.append(f"{counts['state']} Current State {'fact' if counts['state'] == 1 else 'facts'}")
    message = "Found " + ", ".join(parts[:-1]) + ((" and " + parts[-1]) if len(parts) > 1 else (parts[-1] if parts else "relevant project context")) + ". Drafting the brief…"
    return {
        "job": "meeting_prep",
        "grounded": True,
        "message": message,
        "counts": counts,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
    }

def prepare_streaming_meeting_ask(connection: Any, query: str, previous_answer: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Prepare the deterministic meeting-prep fast path without calling a model."""
    total_started = time.perf_counter()
    context_started = time.perf_counter()
    candidates = _trim_candidates_for_query(query, _compact_candidates(connection))
    context_ms = round((time.perf_counter() - context_started) * 1000)
    if not _is_explicit_meeting_prep(query):
        raise ValueError("Streaming Ask currently supports explicit meeting-prep requests only")
    selection = _validate_selection(_deterministic_meeting_selection(candidates), candidates)
    context = _selected_context(selection, candidates)
    return {
        "query": query,
        "selection": selection,
        "context": context,
        "candidates": candidates,
        "prompt": _synthesis_prompt(query, selection, context, previous_answer),
        "context_ms": context_ms,
        "total_started": total_started,
    }


def finalize_streaming_meeting_ask(prepared: Mapping[str, Any], answer_raw: Mapping[str, Any], *, provider_ms: int) -> dict[str, Any]:
    """Validate a completed streamed synthesis and return the normal Ask payload."""
    validation_started = time.perf_counter()
    selection = prepared["selection"]
    context = prepared["context"]
    candidates = prepared["candidates"]
    answer = AskSynthesis.model_validate(answer_raw)
    if answer.job != "meeting_prep":
        answer.job = "meeting_prep"
    answer = _normalize_meeting_prep(_validate_synthesis(answer, selection, context))
    validation_ms = round((time.perf_counter() - validation_started) * 1000)
    selected_open = set(selection.review_ids + selection.blocking_question_ids + selection.question_ids)
    total_open = len(candidates["reviews"]) + len(candidates["questions"])
    remaining = max(0, total_open - len(selected_open))
    remaining_reviews = max(0, len(candidates["reviews"]) - len(selection.review_ids))
    total_ms = round((time.perf_counter() - prepared["total_started"]) * 1000)
    return {
        "answer": answer.model_dump(),
        "selection": selection.model_dump(),
        "open_items_remaining": {"count": remaining, "reviews": remaining_reviews},
        "timing": {
            "pipeline": "deterministic_select_stream",
            "context_ms": prepared["context_ms"],
            "provider_ms": provider_ms,
            "validation_ms": validation_ms,
            "total_ms": total_ms,
        },
    }


def run_ask(connection: Any, provider: AskProvider, query: str, previous_answer: Mapping[str, Any] | None = None) -> dict[str, Any]:
    total_started = time.perf_counter()
    context_started = time.perf_counter()
    candidates = _trim_candidates_for_query(query, _compact_candidates(connection))
    context_ms = round((time.perf_counter() - context_started) * 1000)

    provider_started = time.perf_counter()
    if _is_explicit_meeting_prep(query) and hasattr(provider, "synthesize_selected"):
        selection = _validate_selection(_deterministic_meeting_selection(candidates), candidates)
        selected = _selected_context(selection, candidates)
        try:
            answer_raw = provider.synthesize_selected(_synthesis_prompt(query, selection, selected, previous_answer))
            # Preflight the fast response before committing to the fast path.
            # Truncated/invalid structured output should degrade to the proven
            # one-call route rather than become a user-visible 422.
            fast_answer = AskSynthesis.model_validate(answer_raw)
            if fast_answer.job != "meeting_prep":
                fast_answer.job = "meeting_prep"
            answer_raw = fast_answer.model_dump()
            selection_raw = selection.model_dump()
            pipeline = "deterministic_select_one_call"
        except (ValueError, TypeError):
            if not hasattr(provider, "run"):
                raise
            combined = provider.run(_one_call_prompt(query, candidates, previous_answer))
            selection_raw = combined.get("selection")
            answer_raw = combined.get("answer")
            pipeline = "fast_path_fallback_one_call"
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
    elif hasattr(provider, "run"):
        combined = provider.run(_one_call_prompt(query, candidates, previous_answer))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        selection_raw = combined.get("selection")
        answer_raw = combined.get("answer")
        pipeline = "one_call"
    else:
        # Compatibility path for deterministic test providers while R9.1 lands.
        selection_raw = provider.select(_selector_prompt(query, candidates, previous_answer))
        selection = _validate_selection(_selection_from_raw(selection_raw), candidates)
        selected = _selected_context(selection, candidates)
        answer_raw = provider.synthesize(_synthesis_prompt(query, selection, selected, previous_answer))
        provider_ms = round((time.perf_counter() - provider_started) * 1000)
        pipeline = "two_call_compat"

    validation_started = time.perf_counter()
    selection = _validate_selection(_selection_from_raw(selection_raw), candidates)
    context = _selected_context(selection, candidates)
    answer = _normalize_meeting_prep(_validate_synthesis(AskSynthesis.model_validate(answer_raw), selection, context))
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
        "timing": {
            "pipeline": pipeline,
            "context_ms": context_ms,
            "provider_ms": provider_ms,
            "validation_ms": validation_ms,
            "total_ms": total_ms,
        },
    }
