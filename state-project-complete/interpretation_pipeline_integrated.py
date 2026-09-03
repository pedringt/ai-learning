"""Interpretation pipeline using Phase 1 migration-backed schema.

This module adapts Phase 2's proven pipeline logic to work with Phase 1's
migration-backed tables. The validation logic (structural, semantic, orchestration)
is identical to Phase 2; only the database queries are adapted.

Key differences from Phase 2's inline schema:
  - Queries Phase 1's tables (created by migrations 001 + 002)
  - Handles Phase 1's foreign key constraints
  - Uses Phase 1's Interpretation Record model (structured_result as JSON, not individual review_ids)
  - Preserves atomic transaction semantics (BEGIN IMMEDIATE)
"""

from __future__ import annotations

import json
import logging
import sqlite3
import inspect
import uuid
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from db import Connection

logger = logging.getLogger("state.interpretation")

# Import Phase 2's validation logic unchanged
sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.interpretation_validation import StructuredInterpretationSchemaError, validate_schema
from state_spike.provider_normalization import normalize_provider_payload
from state_spike.semantic_validation import (
    ApplicationStateSnapshot,
    InterpretationContextSnapshot,
    ReviewContextItem,
    StateContextItem,
    StructuredInterpretationSemanticError,
    validate_semantics,
)


class InterpretationProvider(Protocol):
    name: str
    model_identifier: str

    def interpret(self, *, context: InterpretationContextSnapshot, evidence: Mapping[str, Any]) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class ProcessResult:
    interpretation_record_id: str
    processing_status: str
    review_ids: tuple[str, ...] = ()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _normalize_review_text(value: str) -> str:
    """Stable identity normalization for exact duplicate open Reviews."""
    return " ".join((value or "").split()).casefold()


def _filter_duplicate_current_state_creates(connection: Connection, payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """Treat exact restatements of active Current State as no change.

    The model may recommend a missing-understanding/create Review for wording
    that State already maintains. Software owns the invariant that exact
    maintained understanding is not duplicated or sent back for needless Review.
    """
    active_statements = {
        _normalize_review_text(row["statement"])
        for row in connection.execute(
            "SELECT statement FROM current_state_items WHERE status='active'"
        ).fetchall()
    }
    recommendations = []
    for rec in payload.get("review_recommendations", []):
        kept = []
        for proposal in rec.get("proposed_changes", []):
            is_duplicate_create = (
                proposal.get("operation") == "create"
                and _normalize_review_text(proposal.get("proposed_statement", "")) in active_statements
            )
            if not is_duplicate_create:
                kept.append(proposal)
        rec["proposed_changes"] = kept
        # A missing-understanding Review with nothing left to establish is a
        # no-op, so do not create a human decision merely because the model
        # failed to notice an exact existing fact.
        if kept or rec.get("review_type") != "missing_understanding":
            recommendations.append(rec)
    payload["review_recommendations"] = recommendations
    payload["outcome"] = "review_recommended" if recommendations else "no_review"
    if recommendations:
        payload.pop("no_review_explanation", None)
    else:
        payload["no_review_explanation"] = payload.get("summary") or "The evidence does not change maintained understanding."
    return payload


def _matching_open_review_id(connection: Connection, recommendation: Mapping[str, Any]) -> str | None:
    """Return an existing open Review for the exact same pending decision.

    Providers are instructed to use update_existing, but software owns the
    invariant that one exact pending human decision is represented once.
    """
    wanted = _normalize_review_text(recommendation["decision_question"])
    rows = connection.execute(
        "SELECT id, decision_question FROM review_issues "
        "WHERE status='open' AND review_type=? ORDER BY created_at, id",
        (recommendation["review_type"],),
    ).fetchall()
    for row in rows:
        if _normalize_review_text(row["decision_question"]) == wanted:
            return row["id"]
    return None


def capture_context(connection: Connection) -> InterpretationContextSnapshot:
    """Capture State and open Reviews from Phase 1 schema.

    This is the exact authority snapshot supplied to the provider. Semantic
    validation must use this snapshot; it must not silently replace it with
    freshly fetched State/Review context after the model returns.
    """
    connection.row_factory = sqlite3.Row

    states = {
        row["id"]: StateContextItem(row["id"], row["version"])
        for row in connection.execute("SELECT id, version FROM current_state_items WHERE status='active'")
    }
    reviews = {
        row["id"]: ReviewContextItem(row["id"], row["review_type"], row["status"])
        for row in connection.execute("SELECT id, review_type, status FROM review_issues WHERE status='open'")
    }
    return InterpretationContextSnapshot(state_items=states, open_reviews=reviews)


def application_snapshot(connection: Connection) -> ApplicationStateSnapshot:
    """Snapshot of all current application State and Reviews (for reference checks).

    Used during semantic validation to verify that proposed changes reference
    existing State items and Reviews. This includes closed Reviews (for update_existing
    validation) but only active State items (retired items are not targets).
    """
    connection.row_factory = sqlite3.Row

    states = {
        row["id"]: StateContextItem(row["id"], row["version"])
        for row in connection.execute("SELECT id, version FROM current_state_items WHERE status='active'")
    }
    reviews = {
        row["id"]: ReviewContextItem(row["id"], row["review_type"], row["status"])
        for row in connection.execute("SELECT id, review_type, status FROM review_issues")
    }
    return ApplicationStateSnapshot(state_items=states, reviews=reviews)


def _persist_success(
    connection: Connection,
    *,
    evidence_id: str,
    provider: InterpretationProvider,
    payload: Mapping[str, Any],
) -> ProcessResult:
    """Persist successful interpretation: creates Reviews and Proposals atomically.

    This function uses a single IMMEDIATE transaction to ensure all-or-nothing
    semantics: if any INSERT fails, all mutations are rolled back.

    Interpretation Records store the complete structured_result JSON. Review/Proposal
    linkage is explicit in the database.
    """
    record_id = new_id("interpretation")
    review_ids: list[str] = []

    connection.row_factory = sqlite3.Row
    connection.execute("BEGIN IMMEDIATE")
    try:
        # Serialize Review creation in PostgreSQL so two concurrent Evidence
        # submissions cannot both create the same open human decision.
        if getattr(connection, "is_postgres", False):
            connection.execute("LOCK TABLE review_issues IN SHARE ROW EXCLUSIVE MODE")

        # Persist Interpretation Record with complete structured result
        connection.execute(
            "INSERT INTO interpretation_records(id, evidence_id, review_id, provider, model_identifier, contract_version, processing_status, structured_result, error_code) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record_id,
                evidence_id,
                None,  # Phase 1 schema has review_id FK but we leave it null (Reviews are separate)
                provider.name,
                provider.model_identifier,
                "structured-interpretation-v1",
                "succeeded",
                json.dumps(payload, sort_keys=True),
                None,
            ),
        )

        # For each recommendation, create or link a Review and create Proposals.
        # A provider may mistakenly ask to create an exact duplicate of an
        # already-open decision. Reuse it instead of exposing duplicate cards.
        for rec in payload["review_recommendations"]:
            reused_existing = False
            if rec["review_action"] == "create":
                review_id = _matching_open_review_id(connection, rec)
                if review_id is None:
                    review_id = new_id("review")
                    connection.execute(
                        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (review_id, rec["review_type"], rec["decision_question"], rec["why_consequential"], "open"),
                    )
                else:
                    reused_existing = True
            else:  # update_existing
                review_id = rec["existing_review_id"]
                reused_existing = True
                # Re-check under the persistence transaction so a Review that
                # was resolved while the provider was running cannot receive
                # new Evidence or Proposals after resolution.
                review_sql = "SELECT review_type, status FROM review_issues WHERE id=?"
                if getattr(connection, "is_postgres", False):
                    review_sql += " FOR UPDATE"
                persisted_review = connection.execute(review_sql, (review_id,)).fetchone()
                if persisted_review is None:
                    raise StructuredInterpretationSemanticError(
                        "invalid_review_reference", f"Review {review_id!r} no longer exists"
                    )
                if persisted_review["status"] != "open":
                    raise StructuredInterpretationSemanticError(
                        "review_not_open", f"Review {review_id!r} was resolved while interpretation was in progress"
                    )
                if persisted_review["review_type"] != rec["review_type"]:
                    raise StructuredInterpretationSemanticError(
                        "review_type_mismatch", f"Review {review_id!r} changed type"
                    )

            if review_id not in review_ids:
                review_ids.append(review_id)

            # Link Evidence to Review
            connection.execute(
                "INSERT OR IGNORE INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
                (review_id, evidence_id),
            )

            # Link affected State items to Review
            for state_id in rec["affected_state_item_ids"]:
                connection.execute(
                    "INSERT OR IGNORE INTO review_state_items(review_id, state_item_id) VALUES (?, ?)",
                    (review_id, state_id),
                )

            # Link Questions that this Review would resolve if accepted. Questions
            # are application-owned objects: the model may reference only exact
            # open IDs that software can verify at persistence time.
            for question_id in rec.get("resolves_question_ids", []):
                question_sql = "SELECT id, status FROM questions WHERE id=?"
                if getattr(connection, "is_postgres", False):
                    question_sql += " FOR UPDATE"
                question = connection.execute(question_sql, (question_id,)).fetchone()
                if question is None:
                    raise StructuredInterpretationSemanticError(
                        "invalid_question_reference", f"Question {question_id!r} does not exist"
                    )
                if question["status"] != "open":
                    raise StructuredInterpretationSemanticError(
                        "question_not_open", f"Question {question_id!r} is not open"
                    )
                connection.execute(
                    "INSERT OR IGNORE INTO review_questions(review_id, question_id) VALUES (?, ?)",
                    (review_id, question_id),
                )

            # Create Proposals. When new Evidence updates an existing Review, a
            # newer proposal for the same State target supersedes the older
            # pending proposal instead of leaving two mutually-stale changes.
            for proposal in rec["proposed_changes"]:
                supersedes_proposal_id = None
                target_state_id = proposal.get("state_item_id")
                if reused_existing and target_state_id is not None:
                    prior_pending = connection.execute(
                        "SELECT id FROM proposed_state_changes "
                        "WHERE review_id=? AND state_item_id=? AND status='pending' "
                        "ORDER BY created_at DESC, id DESC",
                        (review_id, target_state_id),
                    ).fetchall()
                    if prior_pending:
                        supersedes_proposal_id = prior_pending[0]["id"]
                        connection.execute(
                            "UPDATE proposed_state_changes SET status='superseded', decided_at=CURRENT_TIMESTAMP "
                            "WHERE review_id=? AND state_item_id=? AND status='pending'",
                            (review_id, target_state_id),
                        )
                elif reused_existing and target_state_id is None and proposal["operation"] == "create":
                    # Repeated Evidence can refine the same missing-understanding
                    # Review. Supersede an exact duplicate create proposal so an
                    # acceptance cannot create the same State item twice.
                    wanted_statement = " ".join((proposal.get("proposed_statement") or "").split()).casefold()
                    create_rows = connection.execute(
                        "SELECT id, proposed_statement FROM proposed_state_changes "
                        "WHERE review_id=? AND state_item_id IS NULL AND operation='create' AND status='pending' "
                        "ORDER BY created_at DESC, id DESC",
                        (review_id,),
                    ).fetchall()
                    matching = [row for row in create_rows if " ".join(row["proposed_statement"].split()).casefold() == wanted_statement]
                    if matching:
                        supersedes_proposal_id = matching[0]["id"]
                        connection.execute(
                            "UPDATE proposed_state_changes SET status='superseded', decided_at=CURRENT_TIMESTAMP "
                            "WHERE id=?",
                            (supersedes_proposal_id,),
                        )

                connection.execute(
                    "INSERT INTO proposed_state_changes("
                    "id, review_id, operation, state_item_id, expected_state_version, "
                    "proposed_statement, rationale, effective_date, status, supersedes_proposal_id"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        new_id("proposal"),
                        review_id,
                        proposal["operation"],
                        target_state_id,
                        proposal.get("expected_version"),
                        (
                            proposal.get("proposed_statement")
                            if proposal["operation"] != "retire"
                            else connection.execute(
                                "SELECT statement FROM current_state_items WHERE id=?",
                                (proposal["state_item_id"],),
                            ).fetchone()["statement"]
                        ),
                        proposal["rationale"],
                        proposal.get("effective_date"),
                        "pending",
                        supersedes_proposal_id,
                    ),
                )

        # Mark Evidence as processed
        connection.execute("UPDATE evidence SET processing_status=? WHERE id=?", ("processed", evidence_id))
        connection.execute("COMMIT")

    except Exception:
        connection.execute("ROLLBACK")
        raise

    return ProcessResult(record_id, "succeeded", tuple(review_ids))


def _persist_failure(
    connection: Connection,
    *,
    evidence_id: str,
    provider: InterpretationProvider,
    payload: Mapping[str, Any] | None,
    error_code: str,
    error_message: str | None = None,
) -> ProcessResult:
    """Persist failed interpretation: no Reviews or Proposals created.

    Only the Interpretation Record and Evidence status are updated.
    """
    record_id = new_id("interpretation")
    
    # Store detailed error info in structured_result for debugging
    error_details = None
    if error_message:
        error_details = json.dumps({
            "error_code": error_code,
            "error_message": error_message,
            "payload_preview": str(payload)[:500] if payload else None,
        }, sort_keys=True)
        logger.info("Storing interpretation failure details: %s", error_details[:200])

    connection.execute("BEGIN IMMEDIATE")
    try:
        logger.info("Inserting failed interpretation record %s code=%s", record_id, error_code)
        connection.execute(
            "INSERT INTO interpretation_records(id, evidence_id, review_id, provider, model_identifier, contract_version, processing_status, structured_result, error_code) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record_id,
                evidence_id,
                None,
                provider.name,
                provider.model_identifier,
                "structured-interpretation-v1",
                "failed",
                error_details if error_details is not None else (
                    json.dumps(payload, sort_keys=True) if payload is not None else None
                ),
                error_code,
            ),
        )
        logger.debug("Inserted failed interpretation record")
        connection.execute("UPDATE evidence SET processing_status=? WHERE id=?", ("failed", evidence_id))
        logger.debug("Updated evidence processing status")
        connection.execute("COMMIT")
        logger.debug("Committed interpretation failure transaction")
    except Exception as e:
        logger.exception("Database error while persisting interpretation failure")
        connection.execute("ROLLBACK")
        raise

    return ProcessResult(record_id, "failed")


def process_evidence(
    connection: Connection,
    evidence_id: str,
    provider: InterpretationProvider,
) -> ProcessResult:
    """Orchestrate full interpretation pipeline: validation → persistence.

    1. Capture authority context (State, open Reviews)
    2. Invoke provider
    3. Validate structural JSON Schema
    4. Validate semantic constraints (references, versions)
    5. Persist atomically (success) or fail safely (failure only)

    All-or-nothing semantics: one invalid Review/Proposal rejects entire interpretation.
    """
    # Evidence is immutable input and must exist as a committed record before
    # interpretation starts its own atomic persistence transaction. This also
    # keeps direct/test callers consistent with the API submission path.
    if not getattr(connection, "is_postgres", False) and getattr(connection, "in_transaction", False):
        connection.commit()
    evidence = connection.execute(
        "SELECT id, content, source_type FROM evidence WHERE id=?",
        (evidence_id,),
    ).fetchone()
    if evidence is None:
        raise KeyError(evidence_id)

    # Convert to mutable dict and load Question context if this is a question_response
    evidence_dict = dict(evidence)
    source_type = evidence_dict.get("source_type") or ""
    if source_type.startswith("question_response:"):
        question_id = source_type.split(":", 1)[1]
        question = connection.execute(
            "SELECT id, text, blocking, blocks FROM questions WHERE id=?",
            (question_id,),
        ).fetchone()
        if question:
            evidence_dict["response_to_question"] = {
                "question_id": question["id"],
                "question_text": question["text"],
                "is_blocking": bool(question["blocking"]),
                "blocks": question["blocks"],
            }
            logger.info(
                "Loaded Question context for response evidence %s: Q=%s",
                evidence_id,
                question_id,
            )

    context = capture_context(connection)
    # Do not hold a PostgreSQL transaction open while waiting on the model.
    # The exact authority snapshot is already captured in memory, and all
    # mutable lifecycle/version facts are rechecked before persistence.
    if getattr(connection, "is_postgres", False):
        connection.commit()
    payload: Mapping[str, Any] | None = None

    try:
        # Invoke provider with captured context
        logger.info("Invoking provider for evidence %s", evidence_id)
        interpret_parameters = inspect.signature(provider.interpret).parameters
        provider_kwargs = {"context": context, "evidence": evidence_dict}
        if "connection" in interpret_parameters:
            provider_kwargs["connection"] = connection
        payload = provider.interpret(**provider_kwargs)
        logger.debug("Provider returned payload")
        payload = normalize_provider_payload(payload, context=context)
        payload = _filter_duplicate_current_state_creates(connection, payload)
        logger.debug("Provider payload normalized")

        # Structural validation (JSON Schema)
        validate_schema(payload)
        logger.debug("Schema validation passed")

        # Semantic validation (references, versions, constraints)
        validate_semantics(payload, context=context, application_state=application_snapshot(connection))
        if getattr(connection, "is_postgres", False):
            connection.commit()
        logger.debug("Semantic validation passed")

    except StructuredInterpretationSchemaError as exc:
        logger.warning("Schema validation failed: %s", exc)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="schema_violation",
            error_message=f"Response structure did not match required schema: {str(exc)}",
        )
    except StructuredInterpretationSemanticError as exc:
        logger.warning("Semantic validation failed code=%s: %s", exc.code, exc)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code=exc.code,
            error_message=str(exc),
        )
    except Exception as exc:
        # Capture full error details
        error_msg = f"{type(exc).__name__}: {str(exc)}"
        tb = traceback.format_exc()
        full_error = f"{error_msg}\n\n{tb}"
        logger.exception("Provider error while interpreting evidence %s", evidence_id)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="provider_error",
            error_message=full_error,
        )

    try:
        return _persist_success(connection, evidence_id=evidence_id, provider=provider, payload=payload)
    except StructuredInterpretationSemanticError as exc:
        # A lifecycle fact can change between validation and persistence. Treat
        # that as a safe interpretation failure, not as a server crash.
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code=exc.code,
            error_message=str(exc),
        )
