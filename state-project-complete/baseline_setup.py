"""Explicit Baseline Setup lifecycle for State (Issue #155).

Baseline Setup changes how starting project material is interpreted and organized,
but it does not change State's authority boundary:

    AI interprets -> software enforces -> people authorize.

Original Evidence remains one immutable row. Large sources may be interpreted in
bounded chunks, but only the normal Review workflow can change Current State or
create Questions.
"""
from __future__ import annotations

import copy
import logging
import os
import re
import threading
import uuid
from contextlib import contextmanager
from typing import Any, Mapping

from fastapi import HTTPException, Request

from db import connect, project_id_of

logger = logging.getLogger("state.baseline")

_MAX_CHUNK_CHARS = 2600
_MAX_QUESTIONS_PER_CHUNK = 2
_METADATA_LOCK = threading.Lock()
_INTERPRETATION_METADATA: dict[str, dict[str, Any]] = {}
_INSTALL_LOCK = threading.Lock()
_INSTALLED = False
_BASELINE_PROVIDER_CLASSES: tuple[type, type] | None = None


def _norm(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def is_baseline_setup(connection: Any) -> bool:
    """Return whether the active user-created project is establishing baseline.

    Migration 015 marks user-created projects that existed before this feature as
    already established. New ``project_*`` rows get a NULL completion timestamp
    until a person explicitly finishes Baseline Setup. Seeded demo projects never
    enter the lifecycle.
    """
    project_id = project_id_of(connection)
    if not project_id.startswith("project_"):
        return False
    try:
        row = connection.execute(
            "SELECT baseline_completed_at FROM projects WHERE id=?", (project_id,)
        ).fetchone()
    except Exception:
        return False
    return bool(row) and row["baseline_completed_at"] is None


def baseline_prompt_guidance(connection: Any, evidence: Mapping[str, Any]) -> str:
    """Additional provider guidance while a project is in Baseline Setup."""
    parts: list[str] = []
    chunk_index = evidence.get("_state_chunk_index")
    chunk_count = evidence.get("_state_chunk_count")
    if chunk_index and chunk_count:
        parts.append(
            "This is interpretation chunk "
            f"{chunk_index} of {chunk_count} from one immutable Evidence source. "
            "Interpret only claims present in this chunk; provenance still points to the original Evidence item."
        )

    if not is_baseline_setup(connection):
        return "\n".join(parts)

    areas = connection.execute(
        "SELECT name FROM project_areas WHERE project_id=? ORDER BY sort_order, name",
        (project_id_of(connection),),
    ).fetchall()
    existing_areas = [row["name"] for row in areas]
    area_line = (
        "Existing accepted project areas: " + ", ".join(existing_areas)
        if existing_areas else
        "There are no accepted project areas yet."
    )
    parts.append(
        """
<baseline_setup_mode>
This project is still in Baseline Setup. Keep using the baseline coverage bar even if Current State already contains accepted facts. Setup ends only when the person explicitly finishes it.

Build a coherent starting picture across this Evidence and the Current State, open Reviews, and open Questions already shown:
- Favor coverage of durable starting knowledge: purpose, scope, rules, architecture, current priorities, constraints, evaluation approach, important decisions, and important unresolved questions.
- Reconcile against understanding already represented or pending from earlier baseline sources. If the same fact or Question is already accurately represented, do not create a duplicate merely because another source repeats it.
- Preserve source framing. A learning exercise, hypothetical scenario, option, or proposed plan must remain labeled that way; never turn it into a real operational initiative or settled fact.
- Explicit important unresolved questions should each be surfaced as open_question recommendations unless an equivalent open Question is already shown.
- For Current State creates, make each proposed_statement one independently maintainable fact. Do not pack a list of unrelated facts, exercises, criteria, or decisions into one giant statement.
- A single Review may contain multiple create proposals only when they belong to one coherent human decision. The resulting facts still need to be independently maintainable later.
- For each create proposal, include two optional organizational hints: proposed_area_name (a broad durable section name, usually 2-5 words) and proposed_topic (a short human-readable title for that fact). Reuse an existing area name when it fits. Prefer a small stable taxonomy rather than a new area for every subject.
- Areas are organization only, not truth. Software will not persist a new area until a human accepts the associated fact.
- Keep recommendation prose especially concise because a baseline source may contain many distinct facts or Questions.
""".strip()
        + "\n" + area_line + "\n</baseline_setup_mode>"
    )
    return "\n\n".join(parts)


def _split_dense_question_block(text: str) -> list[str]:
    """Split question-heavy Markdown without interpreting the questions.

    This is a mechanical output-budget guard. It treats bullet/question lines as
    boundaries and carries the nearest heading into each resulting chunk so the
    model does not lose source framing such as "Open product questions".
    """
    lines = text.splitlines()
    heading = ""
    units: list[str] = []
    prose: list[str] = []

    def flush_prose() -> None:
        nonlocal prose
        block = "\n".join(prose).strip()
        if block:
            units.append(block)
        prose = []

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_prose()
            continue
        if re.match(r"^#{1,6}\s+", line):
            flush_prose()
            heading = line
            continue
        is_question_item = "?" in line and bool(
            re.match(r"^(?:[-*+]\s+|\d+[.)]\s+)", line) or line.endswith("?")
        )
        if is_question_item:
            flush_prose()
            units.append(f"{heading}\n{line}".strip() if heading else line)
        else:
            prose.append(line)
    flush_prose()
    return units or [text]


def split_evidence_text(text: str, max_chars: int = _MAX_CHUNK_CHARS) -> list[str]:
    """Split source text for bounded interpretation while preserving Evidence.

    The stored Evidence is never altered. This function only creates temporary
    model-call chunks. It prefers paragraph boundaries and also splits unusually
    question-dense material even when the input itself is short, because six
    explicit Questions can require far more structured output than their input
    character count suggests.
    """
    clean = (text or "").strip()
    if not clean:
        return [""]

    question_dense = clean.count("?") > _MAX_QUESTIONS_PER_CHUNK
    if len(clean) <= max_chars and not question_dense:
        return [clean]

    if question_dense:
        base_units = _split_dense_question_block(clean)
    else:
        base_units = [p.strip() for p in re.split(r"\n\s*\n", clean) if p.strip()]

    units: list[str] = []
    for block in base_units:
        if len(block) <= max_chars:
            units.append(block)
            continue
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", block) if s.strip()]
        if len(sentences) <= 1:
            units.extend(block[i:i + max_chars] for i in range(0, len(block), max_chars))
            continue
        current = ""
        for sentence in sentences:
            candidate = f"{current} {sentence}".strip()
            if current and len(candidate) > max_chars:
                units.append(current)
                current = sentence
            elif len(sentence) > max_chars:
                if current:
                    units.append(current)
                    current = ""
                units.extend(sentence[i:i + max_chars] for i in range(0, len(sentence), max_chars))
            else:
                current = candidate
        if current:
            units.append(current)

    chunks: list[str] = []
    current = ""
    question_count = 0
    for unit in units:
        unit_questions = unit.count("?")
        candidate = f"{current}\n\n{unit}".strip()
        would_overflow = bool(current) and len(candidate) > max_chars
        would_overload_questions = bool(current) and question_count + unit_questions > _MAX_QUESTIONS_PER_CHUNK
        if would_overflow or would_overload_questions:
            chunks.append(current)
            current = unit
            question_count = unit_questions
        else:
            current = candidate
            question_count += unit_questions
    if current:
        chunks.append(current)
    return chunks or [clean]


def _proposal_key(proposal: Mapping[str, Any]) -> tuple[str, str, str]:
    return (
        str(proposal.get("operation") or ""),
        str(proposal.get("state_item_id") or ""),
        _norm(str(proposal.get("proposed_statement") or "")),
    )


def merge_interpretation_payloads(payloads: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Merge bounded chunk outputs before State's canonical validation.

    Software only merges exact normalized duplicates. It does not fuzzy-guess
    that two differently worded claims mean the same thing. The model sees
    Current State/open Reviews/open Questions as reconciliation context, and the
    human remains the authority for any surfaced ambiguity.
    """
    if not payloads:
        return {"summary": "No interpretation was produced.", "topics": [], "review_recommendations": []}
    if len(payloads) == 1:
        return copy.deepcopy(dict(payloads[0]))

    merged: dict[str, Any] = {
        "summary": f"Baseline source interpreted in {len(payloads)} bounded chunks.",
        "topics": [],
        "review_recommendations": [],
    }
    if any("outcome" in payload for payload in payloads):
        merged["outcome"] = "no_review"

    topic_seen: set[str] = set()
    recommendation_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for payload in payloads:
        for topic in payload.get("topics") or []:
            key = _norm(str(topic))
            if key and key not in topic_seen:
                topic_seen.add(key)
                merged["topics"].append(topic)
        for raw in payload.get("review_recommendations") or []:
            rec = copy.deepcopy(dict(raw))
            rec_key = (str(rec.get("review_type") or ""), _norm(str(rec.get("decision_question") or "")))
            existing = recommendation_by_key.get(rec_key)
            if existing is None:
                recommendation_by_key[rec_key] = rec
                merged["review_recommendations"].append(rec)
                continue
            for field in ("affected_state_item_ids", "resolves_question_ids"):
                values = list(existing.get(field) or [])
                for value in rec.get(field) or []:
                    if value not in values:
                        values.append(value)
                existing[field] = values
            proposals = list(existing.get("proposed_changes") or [])
            seen_proposals = {_proposal_key(p) for p in proposals}
            for proposal in rec.get("proposed_changes") or []:
                key = _proposal_key(proposal)
                if key not in seen_proposals:
                    proposals.append(proposal)
                    seen_proposals.add(key)
            existing["proposed_changes"] = proposals

    if merged["review_recommendations"]:
        if "outcome" in merged:
            merged["outcome"] = "review_recommended"
    else:
        explanations = [str(p.get("no_review_explanation") or "").strip() for p in payloads]
        merged["no_review_explanation"] = next(
            (x for x in explanations if x),
            "No consequential baseline change was identified.",
        )
    return merged


def record_interpretation_metadata(
    evidence_id: str,
    merged_payload: Mapping[str, Any],
    chunk_payloads: list[Mapping[str, Any]],
) -> None:
    proposals: list[dict[str, str]] = []
    for rec in merged_payload.get("review_recommendations") or []:
        for proposal in rec.get("proposed_changes") or []:
            statement = str(proposal.get("proposed_statement") or "").strip()
            if not statement:
                continue
            proposals.append({
                "statement_norm": _norm(statement),
                "area_name": str(proposal.get("proposed_area_name") or "").strip(),
                "topic": str(proposal.get("proposed_topic") or "").strip(),
            })
    represented = sum(1 for p in chunk_payloads if p.get("review_recommendations"))
    metadata = {
        "proposals": proposals,
        "chunk_count": len(chunk_payloads) or 1,
        "represented_chunks": represented,
        "unrepresented_chunks": max(0, (len(chunk_payloads) or 1) - represented),
    }
    with _METADATA_LOCK:
        _INTERPRETATION_METADATA[evidence_id] = metadata


def consume_interpretation_metadata(evidence_id: str) -> dict[str, Any] | None:
    with _METADATA_LOCK:
        return _INTERPRETATION_METADATA.pop(evidence_id, None)


def strip_internal_provider_metadata(payload: Mapping[str, Any]) -> dict[str, Any]:
    clean = copy.deepcopy(dict(payload))
    for rec in clean.get("review_recommendations") or []:
        for proposal in rec.get("proposed_changes") or []:
            proposal.pop("proposed_area_name", None)
            proposal.pop("proposed_topic", None)
    return clean


def extend_provider_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    extended = copy.deepcopy(dict(schema))
    proposal_props = (
        extended["properties"]["review_recommendations"]["items"]["properties"]
        ["proposed_changes"]["items"]["properties"]
    )
    proposal_props["proposed_area_name"] = {"type": "string", "maxLength": 80}
    proposal_props["proposed_topic"] = {"type": "string", "maxLength": 120}
    return extended


def _baseline_provider_classes() -> tuple[type, type]:
    global _BASELINE_PROVIDER_CLASSES
    if _BASELINE_PROVIDER_CLASSES is not None:
        return _BASELINE_PROVIDER_CLASSES

    import anthropic_provider as anthropic_module
    import openai_provider as openai_module

    anthropic_module.PROVIDER_OUTPUT_SCHEMA = extend_provider_schema(
        anthropic_module.PROVIDER_OUTPUT_SCHEMA
    )

    class BaselineAnthropicProvider(anthropic_module.AnthropicProvider):
        def _build_prompt(self, context, evidence, connection) -> str:
            prompt = super()._build_prompt(context, evidence, connection)
            extra = baseline_prompt_guidance(connection, evidence)
            return prompt if not extra else f"{prompt}\n\n{extra}\n"

        def interpret(self, *, context, evidence, connection=None):
            chunks = split_evidence_text(str(evidence.get("content") or ""))
            payloads = []
            for index, chunk in enumerate(chunks, start=1):
                chunk_evidence = dict(evidence)
                chunk_evidence["content"] = chunk
                if len(chunks) > 1:
                    chunk_evidence["_state_chunk_index"] = index
                    chunk_evidence["_state_chunk_count"] = len(chunks)
                payloads.append(
                    anthropic_module.AnthropicProvider.interpret(
                        self,
                        context=context,
                        evidence=chunk_evidence,
                        connection=connection,
                    )
                )
            merged = merge_interpretation_payloads(payloads)
            record_interpretation_metadata(str(evidence.get("id") or ""), merged, payloads)
            return strip_internal_provider_metadata(merged)

    class BaselineOpenAIProvider(openai_module.OpenAIProvider):
        def _build_prompt(self, context, evidence, connection) -> str:
            prompt = super()._build_prompt(context, evidence, connection)
            extra = baseline_prompt_guidance(connection, evidence)
            return prompt if not extra else f"{prompt}\n\n{extra}\n"

        def interpret(self, *, context, evidence, connection=None):
            chunks = split_evidence_text(str(evidence.get("content") or ""))
            payloads = []
            for index, chunk in enumerate(chunks, start=1):
                chunk_evidence = dict(evidence)
                chunk_evidence["content"] = chunk
                if len(chunks) > 1:
                    chunk_evidence["_state_chunk_index"] = index
                    chunk_evidence["_state_chunk_count"] = len(chunks)
                payloads.append(
                    openai_module.OpenAIProvider.interpret(
                        self,
                        context=context,
                        evidence=chunk_evidence,
                        connection=connection,
                    )
                )
            merged = merge_interpretation_payloads(payloads)
            record_interpretation_metadata(str(evidence.get("id") or ""), merged, payloads)
            return strip_internal_provider_metadata(merged)

    _BASELINE_PROVIDER_CLASSES = (BaselineAnthropicProvider, BaselineOpenAIProvider)
    return _BASELINE_PROVIDER_CLASSES


def _provider_from_env(settings: Any):
    AnthropicProvider, OpenAIProvider = _baseline_provider_classes()
    if settings.provider == "anthropic":
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is required when STATE_PROVIDER=anthropic")
        model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
        return AnthropicProvider(model_identifier=model, api_key=os.environ["ANTHROPIC_API_KEY"])
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required when STATE_PROVIDER=openai")
    return OpenAIProvider(api_key=os.environ["OPENAI_API_KEY"])


def _persist_interpretation_metadata(connection: Any, evidence_id: str, metadata: Mapping[str, Any]) -> None:
    proposals = connection.execute(
        "SELECT p.id, p.proposed_statement FROM proposed_state_changes p "
        "JOIN review_evidence re ON re.review_id=p.review_id "
        "JOIN review_issues r ON r.id=p.review_id "
        "WHERE re.evidence_id=? AND r.project_id=? ORDER BY p.created_at, p.id",
        (evidence_id, project_id_of(connection)),
    ).fetchall()
    by_statement: dict[str, list[Mapping[str, Any]]] = {}
    for item in metadata.get("proposals", []):
        key = item.get("statement_norm") or ""
        if key:
            by_statement.setdefault(key, []).append(item)
    for proposal in proposals:
        options = by_statement.get(_norm(proposal["proposed_statement"])) or []
        if not options:
            continue
        hint = options.pop(0)
        connection.execute(
            "UPDATE proposed_state_changes SET proposed_area_name=?, proposed_topic=? WHERE id=?",
            (hint.get("area_name") or None, hint.get("topic") or None, proposal["id"]),
        )
    connection.execute(
        "INSERT INTO baseline_evidence_coverage(evidence_id, chunk_count, represented_chunks, unrepresented_chunks, updated_at) "
        "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(evidence_id) DO UPDATE SET chunk_count=excluded.chunk_count, "
        "represented_chunks=excluded.represented_chunks, unrepresented_chunks=excluded.unrepresented_chunks, "
        "updated_at=CURRENT_TIMESTAMP",
        (
            evidence_id,
            int(metadata.get("chunk_count") or 1),
            int(metadata.get("represented_chunks") or 0),
            int(metadata.get("unrepresented_chunks") or 0),
        ),
    )
    connection.commit()


def _ensure_baseline_area(connection: Any, name: str | None) -> str | None:
    clean = " ".join((name or "").split()).strip()
    if not clean or clean.casefold() == "general":
        return None
    existing = connection.execute(
        "SELECT id FROM project_areas WHERE project_id=? AND lower(trim(name))=lower(trim(?)) "
        "ORDER BY sort_order, id LIMIT 1",
        (project_id_of(connection), clean),
    ).fetchone()
    if existing:
        return existing["id"]
    row = connection.execute(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_areas WHERE project_id=?",
        (project_id_of(connection),),
    ).fetchone()
    area_id = f"area_{uuid.uuid4().hex[:12]}"
    connection.execute(
        "INSERT INTO project_areas(id, name, description, sort_order, project_id) VALUES (?, ?, ?, ?, ?)",
        (
            area_id,
            clean[:80],
            "Baseline section created from human-authorized project material.",
            int(row["max_order"] or 0) + 10,
            project_id_of(connection),
        ),
    )
    return area_id


def _organize_accepted_baseline_proposals(
    connection: Any,
    accepted_hints: list[dict[str, Any]],
) -> None:
    """Apply organizational metadata only after the human accept committed."""
    if not accepted_hints or not is_baseline_setup(connection):
        return
    for hint in accepted_hints:
        history = connection.execute(
            "SELECT state_item_id FROM history_transitions WHERE proposed_change_id=? "
            "ORDER BY changed_at DESC, id DESC LIMIT 1",
            (hint["proposal_id"],),
        ).fetchone()
        if history is None:
            continue
        state_id = history["state_item_id"]
        area_id = _ensure_baseline_area(connection, hint.get("area_name"))
        topic = " ".join((hint.get("topic") or "").split()).strip()
        if area_id:
            connection.execute(
                "UPDATE current_state_items SET area_id=? WHERE id=? AND project_id=? AND status='active'",
                (area_id, state_id, project_id_of(connection)),
            )
        if topic:
            connection.execute(
                "UPDATE current_state_items SET topic=? WHERE id=? AND project_id=? AND status='active'",
                (topic[:120], state_id, project_id_of(connection)),
            )
    connection.commit()


def install_baseline_extensions(api_module: Any) -> None:
    """Install Baseline Setup composition hooks before creating the live app."""
    global _INSTALLED
    with _INSTALL_LOCK:
        if _INSTALLED:
            return

        import database_migration_backed as migrations

        baseline_migration = "015_baseline_setup.sql"
        if baseline_migration not in migrations._EXPECTED_MIGRATIONS:
            migrations._EXPECTED_MIGRATIONS = (*migrations._EXPECTED_MIGRATIONS, baseline_migration)

        original_process_evidence = api_module.process_evidence
        original_resolve_review = api_module.resolve_review

        def process_evidence_with_baseline_metadata(
            connection,
            evidence_id,
            provider,
            *,
            user_requested_maintenance=False,
        ):
            result = original_process_evidence(
                connection,
                evidence_id,
                provider,
                user_requested_maintenance=user_requested_maintenance,
            )
            metadata = consume_interpretation_metadata(evidence_id)
            if result.processing_status != "succeeded" or not metadata:
                return result
            try:
                _persist_interpretation_metadata(connection, evidence_id, metadata)
            except Exception:
                connection.rollback()
                logger.exception("Could not persist Baseline Setup metadata for evidence %s", evidence_id)
            return result

        def resolve_review_with_baseline_organization(
            connection,
            review_id,
            decision,
            note=None,
            *,
            expected_question_proposal_id=None,
            expected_existing_question_id=None,
            adjustments=None,
        ):
            hints: list[dict[str, Any]] = []
            if decision == "accept" and is_baseline_setup(connection):
                rows = connection.execute(
                    "SELECT id, operation, proposed_area_name, proposed_topic FROM proposed_state_changes "
                    "WHERE review_id=? AND status='pending' ORDER BY created_at, id",
                    (review_id,),
                ).fetchall()
                hints = [
                    {
                        "proposal_id": row["id"],
                        "area_name": row["proposed_area_name"],
                        "topic": row["proposed_topic"],
                    }
                    for row in rows if row["operation"] == "create"
                ]
            outcome = original_resolve_review(
                connection,
                review_id,
                decision,
                note,
                expected_question_proposal_id=expected_question_proposal_id,
                expected_existing_question_id=expected_existing_question_id,
                adjustments=adjustments,
            )
            if decision == "accept" and hints:
                try:
                    _organize_accepted_baseline_proposals(connection, hints)
                except Exception:
                    connection.rollback()
                    logger.exception("Could not organize accepted Baseline Setup Review %s", review_id)
            return outcome

        api_module.process_evidence = process_evidence_with_baseline_metadata
        api_module.resolve_review = resolve_review_with_baseline_organization
        api_module._provider_from_env = _provider_from_env
        _INSTALLED = True


def baseline_coverage(connection: Any) -> dict[str, Any]:
    """Structural coverage summary used before a person finishes setup.

    It detects failed/unprocessed source material and chunks that produced no
    Review. It deliberately does not claim to solve semantic partial omissions;
    that deeper safeguard remains Issue #144.
    """
    project_id = project_id_of(connection)
    evidence_rows = connection.execute(
        "SELECT id, source_type, source_name, processing_status, submitted_at FROM evidence "
        "WHERE project_id=? ORDER BY submitted_at, id",
        (project_id,),
    ).fetchall()
    items: list[dict[str, Any]] = []
    pending_review_ids: set[str] = set()
    failed = 0
    processing = 0
    suspected = 0

    for evidence in evidence_rows:
        evidence_id = evidence["id"]
        reviews = connection.execute(
            "SELECT r.id, r.status, r.review_type, r.resolution FROM review_issues r "
            "JOIN review_evidence re ON re.review_id=r.id "
            "WHERE re.evidence_id=? AND r.project_id=? ORDER BY r.created_at, r.id",
            (evidence_id, project_id),
        ).fetchall()
        open_reviews = [r for r in reviews if r["status"] == "open"]
        pending_review_ids.update(r["id"] for r in open_reviews)
        accepted_state = connection.execute(
            "SELECT COUNT(*) AS n FROM proposed_state_changes p "
            "JOIN review_evidence re ON re.review_id=p.review_id "
            "JOIN review_issues r ON r.id=p.review_id "
            "WHERE re.evidence_id=? AND r.project_id=? AND p.status='accepted'",
            (evidence_id, project_id),
        ).fetchone()["n"]
        question_links = connection.execute(
            "SELECT COUNT(*) AS n FROM review_questions rq "
            "JOIN review_evidence re ON re.review_id=rq.review_id "
            "JOIN review_issues r ON r.id=rq.review_id "
            "WHERE re.evidence_id=? AND r.project_id=?",
            (evidence_id, project_id),
        ).fetchone()["n"]
        created_questions = sum(
            1 for r in reviews
            if r["review_type"] == "open_question" and r["resolution"] in {"question_created", "question_linked"}
        )
        coverage_row = connection.execute(
            "SELECT chunk_count, represented_chunks, unrepresented_chunks FROM baseline_evidence_coverage "
            "WHERE evidence_id=?", (evidence_id,)
        ).fetchone()

        representations: list[str] = []
        if accepted_state:
            representations.append("maintained_state")
        if question_links or created_questions:
            representations.append("question")
        if open_reviews:
            representations.append("pending_review")
        if reviews and not accepted_state and not (question_links or created_questions) and not open_reviews:
            representations.append("reviewed_evidence_only")
        if not reviews and evidence["processing_status"] == "processed":
            representations.append("evidence_only")
        if evidence["processing_status"] == "failed":
            representations.append("failed")
            failed += 1
        elif evidence["processing_status"] not in {"processed"}:
            representations.append("processing")
            processing += 1

        unrepresented_chunks = int(coverage_row["unrepresented_chunks"]) if coverage_row else 0
        may_be_omitted = bool(unrepresented_chunks) or (
            evidence["processing_status"] == "processed" and not reviews
        )
        if may_be_omitted:
            suspected += 1
        items.append({
            "evidence_id": evidence_id,
            "source_type": evidence["source_type"],
            "source_name": evidence["source_name"],
            "processing_status": evidence["processing_status"],
            "representations": representations,
            "chunk_count": int(coverage_row["chunk_count"]) if coverage_row else 1,
            "represented_chunks": int(coverage_row["represented_chunks"]) if coverage_row else (1 if reviews else 0),
            "unrepresented_chunks": unrepresented_chunks,
            "may_need_another_look": may_be_omitted,
        })

    counts = {
        "evidence": len(evidence_rows),
        "current_state": connection.execute(
            "SELECT COUNT(*) AS n FROM current_state_items WHERE project_id=? AND status='active'", (project_id,)
        ).fetchone()["n"],
        "questions": connection.execute(
            "SELECT COUNT(*) AS n FROM questions WHERE project_id=? AND status='open'", (project_id,)
        ).fetchone()["n"],
        "project_areas": connection.execute(
            "SELECT COUNT(*) AS n FROM project_areas WHERE project_id=?", (project_id,)
        ).fetchone()["n"],
        "pending_reviews": len(pending_review_ids),
        "suspected_omissions": suspected,
        "failed_evidence": failed,
        "processing_evidence": processing,
    }
    return {
        "project_id": project_id,
        "status": "baseline_setup" if is_baseline_setup(connection) else "established",
        "counts": counts,
        "coverage": items,
        "coverage_scope": "structural",
        "can_finish": is_baseline_setup(connection) and not pending_review_ids and failed == 0 and processing == 0,
    }


@contextmanager
def _request_connection(settings: Any, request: Request):
    connection = connect(settings.connection_url())
    try:
        row = connection.execute("SELECT project_id FROM active_project WHERE id=1").fetchone()
        if row:
            connection.project_id = row["project_id"]
        requested = request.headers.get("X-State-Project-Id")
        if requested:
            exists = connection.execute("SELECT id FROM projects WHERE id=?", (requested,)).fetchone()
            if exists:
                connection.project_id = requested
        yield connection
    finally:
        connection.close()


def register_baseline_routes(app: Any, settings: Any) -> None:
    """Attach Baseline Setup endpoints to a composed State FastAPI app."""

    @app.get("/api/baseline")
    def get_baseline(request: Request) -> dict[str, Any]:
        with _request_connection(settings, request) as connection:
            return baseline_coverage(connection)

    @app.post("/api/baseline/finish")
    def finish_baseline(request: Request) -> dict[str, Any]:
        with _request_connection(settings, request) as connection:
            summary = baseline_coverage(connection)
            if summary["status"] != "baseline_setup":
                return summary
            if not summary["can_finish"]:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "baseline_not_ready",
                        "error_details": {
                            "error_message": "Resolve pending Reviews and retry failed or unfinished Evidence before finishing Baseline Setup."
                        },
                        "coverage": summary,
                    },
                )
            connection.execute(
                "UPDATE projects SET baseline_completed_at=CURRENT_TIMESTAMP WHERE id=?",
                (project_id_of(connection),),
            )
            connection.commit()
            return baseline_coverage(connection)
