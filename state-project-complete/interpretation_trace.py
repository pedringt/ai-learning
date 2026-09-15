"""Lightweight structured tracing for State interpretation runs.

The trace wrapper is intentionally vendor-neutral. It records enough of one real
``process_evidence`` run to separate input/context, model behavior,
normalization/validation, and deterministic product action.

Content capture is policy-controlled because prompts and model outputs may echo
project information. Eval/debug runs can opt into full content; a production
caller can keep only hashes, lengths, IDs, timing, and outcome metadata.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, is_dataclass
import hashlib
import json
import logging
from pathlib import Path
import time
from typing import Any, Mapping
import uuid

logger = logging.getLogger("state.interpretation_trace")

TRACE_SCHEMA_VERSION = "state-interpretation-trace-v1"
PROMPT_FAMILY = "structured-interpretation-v1"


@dataclass(frozen=True)
class TracePolicy:
    """Controls which potentially sensitive text is persisted in a trace."""

    include_evidence_content: bool = False
    include_prompt: bool = False
    include_model_output: bool = False

    @classmethod
    def eval_debug(cls) -> "TracePolicy":
        """Local/eval policy: preserve the exact material needed to diagnose."""
        return cls(
            include_evidence_content=True,
            include_prompt=True,
            include_model_output=True,
        )


@dataclass(frozen=True)
class TracedProcessResult:
    process_result: Any
    trace_id: str
    trace: Mapping[str, Any]
    trace_path: str | None = None


def _sha256_text(value: str) -> str:
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()


def _jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return {key: _jsonable(item) for key, item in asdict(value).items()}
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "__dict__"):
        return {
            str(key): _jsonable(item)
            for key, item in vars(value).items()
            if not str(key).startswith("_")
        }
    return str(value)


def _parse_json_object(value: Any) -> Mapping[str, Any] | None:
    if isinstance(value, Mapping):
        return value
    if value is None:
        return None
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, Mapping) else None


def _text_snapshot(value: str, *, include: bool) -> Mapping[str, Any]:
    text = value or ""
    result: dict[str, Any] = {
        "sha256": _sha256_text(text),
        "characters": len(text),
    }
    if include:
        result["content"] = text
    return result


def _payload_snapshot(payload: Mapping[str, Any] | None, *, include: bool) -> Mapping[str, Any] | None:
    if payload is None:
        return None
    encoded = json.dumps(_jsonable(payload), sort_keys=True, separators=(",", ":"))
    result: dict[str, Any] = {
        "sha256": _sha256_text(encoded),
        "characters": len(encoded),
    }
    if include:
        result["payload"] = _jsonable(payload)
    else:
        result["outcome"] = payload.get("outcome")
        result["recommendation_count"] = len(payload.get("review_recommendations") or [])
        result["topics"] = list(payload.get("topics") or [])
    return result


def _context_snapshot(context: Any) -> Mapping[str, Any]:
    """Serialize the exact authority snapshot passed to provider.interpret()."""
    state_items = getattr(context, "state_items", {}) or {}
    open_reviews = getattr(context, "open_reviews", {}) or {}
    return {
        "state_items": {
            str(key): _jsonable(value)
            for key, value in state_items.items()
        },
        "open_reviews": {
            str(key): _jsonable(value)
            for key, value in open_reviews.items()
        },
    }


class TracingProvider:
    """Transparent provider proxy that captures the provider boundary."""

    def __init__(self, provider: Any, *, policy: TracePolicy):
        self._provider = provider
        self._policy = policy
        self.name = getattr(provider, "name", provider.__class__.__name__)
        self.model_identifier = getattr(provider, "model_identifier", "unknown")
        self.context: Mapping[str, Any] | None = None
        self.evidence: Mapping[str, Any] | None = None
        self.prompt: str | None = None
        self.prompt_capture_kind: str = "unavailable"
        self.raw_output: Mapping[str, Any] | None = None
        self.provider_elapsed_ms: float | None = None
        self.provider_error: str | None = None

    def _capture_prompt(self, *, context: Any, evidence: Mapping[str, Any], connection: Any) -> None:
        builder = getattr(self._provider, "_build_prompt", None)
        if builder is None or connection is None:
            return
        # State's Anthropic/OpenAI providers call this same deterministic builder
        # immediately inside interpret(). Rebuilding it from the exact same
        # context/evidence/connection gives the concrete prompt supplied without
        # changing the provider adapter itself.
        try:
            self.prompt = builder(context, evidence, connection)
            self.prompt_capture_kind = "same-input provider prompt builder"
        except Exception as exc:  # tracing must never break interpretation
            self.prompt_capture_kind = f"prompt capture unavailable: {type(exc).__name__}"
            logger.warning("Trace prompt capture failed: %s", exc)

    def interpret(self, *, context: Any, evidence: Mapping[str, Any], connection: Any = None) -> Mapping[str, Any]:
        self.context = _context_snapshot(context)
        self.evidence = deepcopy(dict(evidence))
        self._capture_prompt(context=context, evidence=evidence, connection=connection)

        started = time.perf_counter()
        try:
            kwargs = {"context": context, "evidence": evidence}
            # The real State providers accept the connection so they can build
            # full prompt context. Scripted test providers often do not.
            import inspect
            if "connection" in inspect.signature(self._provider.interpret).parameters:
                kwargs["connection"] = connection
            output = self._provider.interpret(**kwargs)
            self.raw_output = deepcopy(dict(output))
            return output
        except Exception as exc:
            self.provider_error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            self.provider_elapsed_ms = (time.perf_counter() - started) * 1000


def _fetch_interpretation_record(connection: Any, interpretation_record_id: str) -> Mapping[str, Any] | None:
    return connection.execute(
        "SELECT id, evidence_id, provider, model_identifier, contract_version, processing_status, "
        "structured_result, error_code, created_at FROM interpretation_records WHERE id=?",
        (interpretation_record_id,),
    ).fetchone()


def _state_versions(connection: Any) -> Mapping[str, int]:
    from db import project_id_of

    rows = connection.execute(
        "SELECT id, version FROM current_state_items WHERE status='active' AND project_id=? ORDER BY id",
        (project_id_of(connection),),
    ).fetchall()
    return {row["id"]: int(row["version"]) for row in rows}


def _review_actions(connection: Any, review_ids: tuple[str, ...] | list[str]) -> list[Mapping[str, Any]]:
    actions: list[Mapping[str, Any]] = []
    for review_id in review_ids:
        review = connection.execute(
            "SELECT id, review_type, decision_question, why_consequential, status FROM review_issues WHERE id=?",
            (review_id,),
        ).fetchone()
        if review is None:
            continue
        proposals = connection.execute(
            "SELECT id, operation, state_item_id, proposed_statement, status FROM proposed_state_changes "
            "WHERE review_id=? ORDER BY created_at, id",
            (review_id,),
        ).fetchall()
        question_links: list[str] = []
        try:
            question_links = [
                row["question_id"]
                for row in connection.execute(
                    "SELECT question_id FROM review_questions WHERE review_id=? ORDER BY question_id",
                    (review_id,),
                ).fetchall()
            ]
        except Exception:
            pass
        proposed_questions: list[Mapping[str, Any]] = []
        try:
            proposed_questions = [
                dict(row)
                for row in connection.execute(
                    "SELECT id, text, status FROM proposed_questions WHERE review_id=? ORDER BY created_at, id",
                    (review_id,),
                ).fetchall()
            ]
        except Exception:
            pass
        actions.append(
            {
                "review": dict(review),
                "proposed_state_changes": [dict(row) for row in proposals],
                "resolves_question_ids": question_links,
                "proposed_questions": proposed_questions,
            }
        )
    return actions


def _validation_summary(record: Mapping[str, Any] | None, provider_proxy: TracingProvider) -> Mapping[str, Any]:
    if provider_proxy.provider_error:
        return {
            "provider_call": "failed",
            "normalization": "not reached",
            "schema_validation": "not reached",
            "semantic_validation": "not reached",
            "error": provider_proxy.provider_error,
        }
    if record is None:
        return {"record": "missing"}
    error_code = record["error_code"]
    if record["processing_status"] == "succeeded":
        return {
            "provider_call": "succeeded",
            "normalization": "completed",
            "schema_validation": "passed",
            "semantic_validation": "passed",
        }
    if error_code == "schema_violation":
        return {
            "provider_call": "succeeded",
            "normalization": "completed",
            "schema_validation": "failed",
            "semantic_validation": "not reached",
            "error_code": error_code,
        }
    return {
        "provider_call": "succeeded",
        "normalization": "completed",
        "schema_validation": "passed or not independently distinguishable",
        "semantic_validation": "failed or persistence lifecycle check failed",
        "error_code": error_code,
    }


def _write_trace(trace: Mapping[str, Any], trace_dir: str | Path) -> str:
    directory = Path(trace_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{trace['trace_id']}.json"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(trace, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(path)
    return str(path)


def run_traced_interpretation(
    connection: Any,
    evidence_id: str,
    provider: Any,
    *,
    policy: TracePolicy | None = None,
    trace_id: str | None = None,
    trace_dir: str | Path | None = None,
    user_requested_maintenance: bool = False,
) -> TracedProcessResult:
    """Run the real State pipeline and return a structured diagnostic trace."""
    from db import project_id_of
    from interpretation_pipeline_integrated import process_evidence

    policy = policy or TracePolicy()
    trace_id = trace_id or f"trace_{uuid.uuid4().hex[:16]}"
    evidence_row = connection.execute(
        "SELECT id, content, source_type, processing_status FROM evidence WHERE id=? AND project_id=?",
        (evidence_id, project_id_of(connection)),
    ).fetchone()
    if evidence_row is None:
        raise KeyError(evidence_id)

    state_before = _state_versions(connection)
    proxy = TracingProvider(provider, policy=policy)
    started = time.perf_counter()
    logger.info("interpretation_trace_start trace_id=%s evidence_id=%s", trace_id, evidence_id)
    process_result = process_evidence(
        connection,
        evidence_id=evidence_id,
        provider=proxy,
        user_requested_maintenance=user_requested_maintenance,
    )
    total_elapsed_ms = (time.perf_counter() - started) * 1000

    record = _fetch_interpretation_record(connection, process_result.interpretation_record_id)
    normalized_payload = _parse_json_object(record["structured_result"]) if record else None
    raw_output = proxy.raw_output
    state_after = _state_versions(connection)

    prompt_snapshot = None
    if proxy.prompt is not None:
        prompt_snapshot = _text_snapshot(proxy.prompt, include=policy.include_prompt)
        prompt_snapshot = {
            **prompt_snapshot,
            "capture_kind": proxy.prompt_capture_kind,
        }

    evidence_content = str(evidence_row["content"] or "")
    evidence_snapshot: dict[str, Any] = {
        "id": evidence_row["id"],
        "source_type": evidence_row["source_type"],
        **_text_snapshot(evidence_content, include=policy.include_evidence_content),
    }

    raw_snapshot = _payload_snapshot(raw_output, include=policy.include_model_output)
    normalized_snapshot = _payload_snapshot(normalized_payload, include=policy.include_model_output)
    raw_encoded = json.dumps(_jsonable(raw_output), sort_keys=True, separators=(",", ":")) if raw_output is not None else None
    normalized_encoded = json.dumps(_jsonable(normalized_payload), sort_keys=True, separators=(",", ":")) if normalized_payload is not None else None

    trace: dict[str, Any] = {
        "schema_version": TRACE_SCHEMA_VERSION,
        "trace_id": trace_id,
        "interpretation_record_id": process_result.interpretation_record_id,
        "project_id": project_id_of(connection),
        "input": {
            "evidence": evidence_snapshot,
            "user_requested_maintenance": bool(user_requested_maintenance),
        },
        "context_supplied": proxy.context,
        "prompt": {
            "family": PROMPT_FAMILY,
            "snapshot": prompt_snapshot,
        },
        "provider": {
            "name": getattr(provider, "name", provider.__class__.__name__),
            "model_identifier": getattr(provider, "model_identifier", "unknown"),
            "provider_elapsed_ms": round(proxy.provider_elapsed_ms or 0.0, 3),
        },
        "model_interpretation": {
            "raw": raw_snapshot,
            "normalized": normalized_snapshot,
            "normalization_changed": (
                raw_encoded != normalized_encoded
                if raw_encoded is not None and normalized_encoded is not None
                else None
            ),
        },
        "validation": _validation_summary(record, proxy),
        "classification": {
            "outcome": normalized_payload.get("outcome") if normalized_payload else None,
            "review_recommendation_count": len(normalized_payload.get("review_recommendations") or []) if normalized_payload else 0,
            "no_review_explanation": (
                normalized_payload.get("no_review_explanation")
                if policy.include_model_output and normalized_payload
                else None
            ),
        },
        "final_product_action": {
            "processing_status": process_result.processing_status,
            "review_ids": list(process_result.review_ids),
            "reviews": _review_actions(connection, process_result.review_ids),
            "current_state_versions_before": state_before,
            "current_state_versions_after": state_after,
            "current_state_changed_by_interpretation": state_before != state_after,
        },
        "timing": {
            "total_elapsed_ms": round(total_elapsed_ms, 3),
            "provider_elapsed_ms": round(proxy.provider_elapsed_ms or 0.0, 3),
        },
        "error": {
            "error_code": record["error_code"] if record else None,
            "provider_error": proxy.provider_error,
        },
        "redaction": {
            "evidence_content_included": policy.include_evidence_content,
            "prompt_included": policy.include_prompt,
            "model_output_included": policy.include_model_output,
            "note": "API keys and provider credentials are never copied into traces.",
        },
    }

    trace_path = _write_trace(trace, trace_dir) if trace_dir else None
    logger.info(
        "interpretation_trace_done trace_id=%s interpretation_record_id=%s status=%s reviews=%s elapsed_ms=%.0f",
        trace_id,
        process_result.interpretation_record_id,
        process_result.processing_status,
        len(process_result.review_ids),
        total_elapsed_ms,
    )
    return TracedProcessResult(
        process_result=process_result,
        trace_id=trace_id,
        trace=trace,
        trace_path=trace_path,
    )
