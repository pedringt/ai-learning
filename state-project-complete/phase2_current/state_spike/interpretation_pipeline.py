from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from .interpretation_validation import StructuredInterpretationSchemaError, validate_schema
from .semantic_validation import (
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


def create_pipeline_schema(connection: sqlite3.Connection) -> None:
    connection.executescript("""
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY, content TEXT NOT NULL CHECK(length(trim(content)) > 0),
      processing_status TEXT NOT NULL DEFAULT 'pending' CHECK(processing_status IN ('pending','processed','failed'))
    );
    CREATE TABLE IF NOT EXISTS current_state_items (
      id TEXT PRIMARY KEY, statement TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1)
    );
    CREATE TABLE IF NOT EXISTS review_issues (
      id TEXT PRIMARY KEY,
      review_type TEXT NOT NULL CHECK(review_type IN ('proposed_update','state_at_risk','missing_understanding')),
      decision_question TEXT NOT NULL,
      why_consequential TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved'))
    );
    CREATE TABLE IF NOT EXISTS review_evidence (
      review_id TEXT NOT NULL REFERENCES review_issues(id),
      evidence_id TEXT NOT NULL REFERENCES evidence(id),
      PRIMARY KEY(review_id,evidence_id)
    );
    CREATE TABLE IF NOT EXISTS review_state_items (
      review_id TEXT NOT NULL REFERENCES review_issues(id),
      state_item_id TEXT NOT NULL REFERENCES current_state_items(id),
      PRIMARY KEY(review_id,state_item_id)
    );
    CREATE TABLE IF NOT EXISTS proposed_state_changes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_issues(id),
      operation TEXT NOT NULL CHECK(operation IN ('create','update','retire')),
      state_item_id TEXT REFERENCES current_state_items(id),
      expected_state_version INTEGER,
      proposed_statement TEXT,
      rationale TEXT NOT NULL,
      effective_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','not_applied','superseded'))
    );
    CREATE TABLE IF NOT EXISTS interpretation_records (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence(id),
      provider TEXT NOT NULL,
      model_identifier TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      processing_status TEXT NOT NULL CHECK(processing_status IN ('succeeded','failed')),
      structured_result TEXT,
      error_code TEXT,
      CHECK(
        (processing_status='succeeded' AND structured_result IS NOT NULL AND error_code IS NULL)
        OR (processing_status='failed' AND error_code IS NOT NULL)
      )
    );
    """)


def capture_context(connection: sqlite3.Connection) -> InterpretationContextSnapshot:
    states = {
        row["id"]: StateContextItem(row["id"], row["version"])
        for row in connection.execute("SELECT id, version FROM current_state_items")
    }
    reviews = {
        row["id"]: ReviewContextItem(row["id"], row["review_type"], row["status"])
        for row in connection.execute("SELECT id, review_type, status FROM review_issues WHERE status='open'")
    }
    return InterpretationContextSnapshot(state_items=states, open_reviews=reviews)


def application_snapshot(connection: sqlite3.Connection) -> ApplicationStateSnapshot:
    states = {
        row["id"]: StateContextItem(row["id"], row["version"])
        for row in connection.execute("SELECT id, version FROM current_state_items")
    }
    reviews = {
        row["id"]: ReviewContextItem(row["id"], row["review_type"], row["status"])
        for row in connection.execute("SELECT id, review_type, status FROM review_issues")
    }
    return ApplicationStateSnapshot(state_items=states, reviews=reviews)


def _persist_success(connection: sqlite3.Connection, *, evidence_id: str, provider: InterpretationProvider,
                     payload: Mapping[str, Any]) -> ProcessResult:
    record_id = new_id("interpretation")
    review_ids: list[str] = []
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute(
            "INSERT INTO interpretation_records VALUES (?,?,?,?,?,?,?,?)",
            (record_id, evidence_id, provider.name, provider.model_identifier, "structured-interpretation-v1",
             "succeeded", json.dumps(payload, sort_keys=True), None),
        )
        for rec in payload["review_recommendations"]:
            if rec["review_action"] == "create":
                review_id = new_id("review")
                connection.execute(
                    "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES (?,?,?,?, 'open')",
                    (review_id, rec["review_type"], rec["decision_question"], rec["why_consequential"]),
                )
            else:
                review_id = rec["existing_review_id"]
            review_ids.append(review_id)
            connection.execute("INSERT OR IGNORE INTO review_evidence VALUES (?,?)", (review_id, evidence_id))
            for state_id in rec["affected_state_item_ids"]:
                connection.execute("INSERT OR IGNORE INTO review_state_items VALUES (?,?)", (review_id, state_id))
            for proposal in rec["proposed_changes"]:
                connection.execute(
                    "INSERT INTO proposed_state_changes(id,review_id,operation,state_item_id,expected_state_version,proposed_statement,rationale,effective_date,status) VALUES (?,?,?,?,?,?,?,?, 'pending')",
                    (new_id("proposal"), review_id, proposal["operation"], proposal.get("state_item_id"),
                     proposal.get("expected_version"), proposal.get("proposed_statement"), proposal["rationale"],
                     proposal.get("effective_date")),
                )
        connection.execute("UPDATE evidence SET processing_status='processed' WHERE id=?", (evidence_id,))
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    return ProcessResult(record_id, "succeeded", tuple(review_ids))


def _persist_failure(connection: sqlite3.Connection, *, evidence_id: str, provider: InterpretationProvider,
                     payload: Mapping[str, Any] | None, error_code: str) -> ProcessResult:
    record_id = new_id("interpretation")
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute(
            "INSERT INTO interpretation_records VALUES (?,?,?,?,?,?,?,?)",
            (record_id, evidence_id, provider.name, provider.model_identifier, "structured-interpretation-v1",
             "failed", json.dumps(payload, sort_keys=True) if payload is not None else None, error_code),
        )
        connection.execute("UPDATE evidence SET processing_status='failed' WHERE id=?", (evidence_id,))
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    return ProcessResult(record_id, "failed")


def process_evidence(connection: sqlite3.Connection, *, evidence_id: str, provider: InterpretationProvider) -> ProcessResult:
    evidence = connection.execute("SELECT id, content FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    if evidence is None:
        raise KeyError(evidence_id)
    context = capture_context(connection)
    payload: Mapping[str, Any] | None = None
    try:
        payload = provider.interpret(context=context, evidence=dict(evidence))
        validate_schema(payload)
        validate_semantics(payload, context=context, application_state=application_snapshot(connection))
    except StructuredInterpretationSchemaError:
        return _persist_failure(connection, evidence_id=evidence_id, provider=provider, payload=payload, error_code="schema_violation")
    except StructuredInterpretationSemanticError as exc:
        return _persist_failure(connection, evidence_id=evidence_id, provider=provider, payload=payload, error_code=exc.code)
    except Exception:
        return _persist_failure(connection, evidence_id=evidence_id, provider=provider, payload=payload, error_code="provider_error")
    return _persist_success(connection, evidence_id=evidence_id, provider=provider, payload=payload)
