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
import inspect
import uuid
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from db import Connection

# Import Phase 2's validation logic unchanged
import sys
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

        # For each recommendation, create or link a Review and create Proposals
        for rec in payload["review_recommendations"]:
            if rec["review_action"] == "create":
                review_id = new_id("review")
                connection.execute(
                    "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (review_id, rec["review_type"], rec["decision_question"], rec["why_consequential"], "open"),
                )
            else:  # update_existing
                review_id = rec["existing_review_id"]

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

            # Create Proposals. When new Evidence updates an existing Review, a
            # newer proposal for the same State target supersedes the older
            # pending proposal instead of leaving two mutually-stale changes.
            for proposal in rec["proposed_changes"]:
                supersedes_proposal_id = None
                target_state_id = proposal.get("state_item_id")
                if rec["review_action"] == "update_existing" and target_state_id is not None:
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
        print(f"[PERSIST] Storing error details: {error_details[:200]}", flush=True)

    connection.execute("BEGIN IMMEDIATE")
    try:
        print(f"[PERSIST] Inserting interpretation record {record_id} with error_code {error_code}", flush=True)
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
        print(f"[PERSIST] Inserted interpretation record", flush=True)
        connection.execute("UPDATE evidence SET processing_status=? WHERE id=?", ("failed", evidence_id))
        print(f"[PERSIST] Updated evidence status", flush=True)
        connection.execute("COMMIT")
        print(f"[PERSIST] Committed transaction", flush=True)
    except Exception as e:
        print(f"[ERROR] Database error in _persist_failure: {type(e).__name__}: {str(e)}", flush=True)
        connection.execute("ROLLBACK")
        raise

    return ProcessResult(record_id, "failed")


def process_evidence(
    connection: Connection,
    *,
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
    # Set row factory for compatibility (Connection handles this appropriately)
    from db import Row
    connection.row_factory = Row

    evidence = connection.execute("SELECT id, content FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    if evidence is None:
        raise KeyError(evidence_id)

    context = capture_context(connection)
    payload: Mapping[str, Any] | None = None

    try:
        # Invoke provider with captured context
        print(f"[STATE] Invoking provider for evidence {evidence_id}", flush=True)
        interpret_parameters = inspect.signature(provider.interpret).parameters
        provider_kwargs = {"context": context, "evidence": dict(evidence)}
        if "connection" in interpret_parameters:
            provider_kwargs["connection"] = connection
        payload = provider.interpret(**provider_kwargs)
        print(f"[STATE] Provider returned payload", flush=True)
        payload = normalize_provider_payload(payload, context=context)
        print(f"[STATE] Provider payload normalized", flush=True)

        # Structural validation (JSON Schema)
        validate_schema(payload)
        print(f"[STATE] Schema validation passed", flush=True)

        # Semantic validation (references, versions, constraints)
        validate_semantics(payload, context=context, application_state=application_snapshot(connection))
        print(f"[STATE] Semantic validation passed", flush=True)

    except StructuredInterpretationSchemaError as exc:
        print(f"[ERROR] Schema validation failed: {exc}", flush=True)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="schema_violation",
            error_message=f"Response structure did not match required schema: {str(exc)}",
        )
    except StructuredInterpretationSemanticError as exc:
        print(f"[ERROR] Semantic validation failed: {exc.code}: {exc}", flush=True)
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
        print(f"[ERROR] Provider error: {full_error}", flush=True)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="provider_error",
            error_message=full_error,
        )

    return _persist_success(connection, evidence_id=evidence_id, provider=provider, payload=payload)
