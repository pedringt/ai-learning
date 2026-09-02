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
import sqlite3
import uuid
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

# Import Phase 2's validation logic unchanged
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.interpretation_validation import StructuredInterpretationSchemaError, validate_schema
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


def capture_context(connection: sqlite3.Connection) -> InterpretationContextSnapshot:
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


def application_snapshot(connection: sqlite3.Connection) -> ApplicationStateSnapshot:
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
    connection: sqlite3.Connection,
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

            # Create Proposals
            for proposal in rec["proposed_changes"]:
                connection.execute(
                    "INSERT INTO proposed_state_changes("
                    "id, review_id, operation, state_item_id, expected_state_version, "
                    "proposed_statement, rationale, effective_date, status"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        new_id("proposal"),
                        review_id,
                        proposal["operation"],
                        proposal.get("state_item_id"),
                        proposal.get("expected_version"),
                        proposal.get("proposed_statement"),
                        proposal["rationale"],
                        proposal.get("effective_date"),
                        "pending",
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
    connection: sqlite3.Connection,
    *,
    evidence_id: str,
    provider: InterpretationProvider,
    payload: Mapping[str, Any] | None,
    error_code: str,
) -> ProcessResult:
    """Persist failed interpretation: no Reviews or Proposals created.

    Only the Interpretation Record and Evidence status are updated.
    """
    record_id = new_id("interpretation")

    connection.execute("BEGIN IMMEDIATE")
    try:
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
                json.dumps(payload, sort_keys=True) if payload is not None else None,
                error_code,
            ),
        )
        connection.execute("UPDATE evidence SET processing_status=? WHERE id=?", ("failed", evidence_id))
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise

    return ProcessResult(record_id, "failed")


def process_evidence(
    connection: sqlite3.Connection,
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
    connection.row_factory = sqlite3.Row

    evidence = connection.execute("SELECT id, content FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    if evidence is None:
        raise KeyError(evidence_id)

    context = capture_context(connection)
    payload: Mapping[str, Any] | None = None

    try:
        # Invoke provider with captured context
        interpret_parameters = inspect.signature(provider.interpret).parameters
        provider_kwargs = {"context": context, "evidence": dict(evidence)}
        if "connection" in interpret_parameters:
            provider_kwargs["connection"] = connection
        payload = provider.interpret(**provider_kwargs)

        # Structural validation (JSON Schema)
        validate_schema(payload)

        # Semantic validation (references, versions, constraints)
        validate_semantics(payload, context=context, application_state=application_snapshot(connection))

    except StructuredInterpretationSchemaError:
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="schema_violation",
        )
    except StructuredInterpretationSemanticError as exc:
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code=exc.code,
        )
    except Exception as exc:
        # Log the actual error so we can debug
        error_msg = f"{type(exc).__name__}: {str(exc)}"
        print(f"[ERROR] Provider error during evidence interpretation: {error_msg}", file=sys.stderr)
        print(f"[TRACEBACK]\n{traceback.format_exc()}", file=sys.stderr)
        return _persist_failure(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            payload=payload,
            error_code="provider_error",
        )

    return _persist_success(connection, evidence_id=evidence_id, provider=provider, payload=payload)
