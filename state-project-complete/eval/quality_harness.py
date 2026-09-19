"""Model-backed harnesses for Review interpretation and Ask quality evals.

These evals exercise State's real interpretation and Ask orchestration against
controlled test databases. They deliberately keep product-owner expectations
separate from model output and score outcomes rather than exact wording.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from typing import Any

from database_migration_backed import get_test_db
from interpretation_trace import TracePolicy, run_traced_interpretation
from ask_provider import LiveAskProvider
from ask_service import run_ask
from eval.review_interpretation_scenarios import ReviewInterpretationScenario
from eval.ask_quality_scenarios import AskQualityScenario


class _DBContext:
    def __init__(self, db_context, connection):
        self.db_context = db_context
        self._connection = connection

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __setattr__(self, name, value):
        if name in {"db_context", "_connection"}:
            super().__setattr__(name, value)
        else:
            setattr(self._connection, name, value)


def _new_test_connection():
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    return _DBContext(db_context, connection)


def _close(connection) -> None:
    connection.db_context.__exit__(None, None, None)


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def _flatten_strings(value: Any) -> str:
    parts: list[str] = []
    if isinstance(value, str):
        parts.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            parts.append(_flatten_strings(item))
    elif isinstance(value, (list, tuple)):
        for item in value:
            parts.append(_flatten_strings(item))
    return " ".join(part for part in parts if part)


@dataclass
class ReviewQualityResult:
    scenario: ReviewInterpretationScenario
    review_recommended: bool
    observed_action: str
    processing_status: str
    trace_id: str = ""
    trace_path: str = ""
    error: str = ""

    @property
    def review_needed_correct(self) -> bool:
        return self.review_recommended == self.scenario.review_needed

    @property
    def interpretation_correct(self) -> bool:
        return self.observed_action == self.scenario.expected_action

    @property
    def passed(self) -> bool:
        return self.processing_status != "error" and self.review_needed_correct and self.interpretation_correct


def _seed_review_scenario(connection, scenario: ReviewInterpretationScenario) -> None:
    for idx, (topic, statement) in enumerate(scenario.current_state):
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
            (f"quality-state-{idx}", topic, statement),
        )
    for idx, text in enumerate(scenario.open_questions):
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', 0)",
            (f"quality-question-{idx}", text),
        )
    connection.commit()


def _observed_review_action(connection, review_ids: list[str]) -> str:
    if not review_ids:
        return "preserve_evidence_only"
    placeholders = ",".join("?" for _ in review_ids)
    state_changes = connection.execute(
        f"SELECT COUNT(*) AS n FROM proposed_state_changes WHERE review_id IN ({placeholders}) AND status='pending'",
        tuple(review_ids),
    ).fetchone()["n"]
    proposed_questions = connection.execute(
        f"SELECT COUNT(*) AS n FROM proposed_questions WHERE review_id IN ({placeholders}) AND status='pending'",
        tuple(review_ids),
    ).fetchone()["n"]
    linked_questions = connection.execute(
        f"SELECT COUNT(*) AS n FROM review_questions WHERE review_id IN ({placeholders})",
        tuple(review_ids),
    ).fetchone()["n"]

    if state_changes and linked_questions:
        return "answer_question_and_update_state"
    if state_changes:
        return "update_state"
    if proposed_questions:
        return "open_question"
    if linked_questions:
        return "answer_question"
    return "preserve_evidence_only"


def run_review_quality_scenario(scenario: ReviewInterpretationScenario, provider) -> ReviewQualityResult:
    connection = _new_test_connection()
    try:
        _seed_review_scenario(connection, scenario)
        evidence_id = f"quality-evidence-{scenario.id}"
        connection.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (evidence_id, scenario.evidence))
        connection.commit()
        traced = run_traced_interpretation(
            connection,
            evidence_id=evidence_id,
            provider=provider,
            policy=TracePolicy.eval_debug(),
        )
        process_result = traced.process_result
        review_ids = list(process_result.review_ids)
        return ReviewQualityResult(
            scenario=scenario,
            review_recommended=bool(review_ids),
            observed_action=_observed_review_action(connection, review_ids),
            processing_status=process_result.processing_status,
            trace_id=traced.trace_id,
            trace_path=traced.trace_path or "",
        )
    except Exception as exc:
        return ReviewQualityResult(
            scenario=scenario,
            review_recommended=False,
            observed_action="error",
            processing_status="error",
            error=str(exc),
        )
    finally:
        _close(connection)


@dataclass
class AskQualityResult:
    scenario: AskQualityScenario
    answer: dict[str, Any] | None
    required_facts_ok: bool
    forbidden_claims_ok: bool
    uncertainty_ok: bool
    open_item_ok: bool
    authority_ok: bool
    error: str = ""

    @property
    def grounding_ok(self) -> bool:
        return self.required_facts_ok and self.forbidden_claims_ok

    @property
    def passed(self) -> bool:
        return not self.error and self.grounding_ok and self.uncertainty_ok and self.open_item_ok and self.authority_ok


def _seed_ask_scenario(connection, scenario: AskQualityScenario) -> None:
    for idx, (topic, statement) in enumerate(scenario.current_state):
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
            (f"ask-state-{idx}", topic, statement),
        )
    for idx, text in enumerate(scenario.pending_reviews):
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) VALUES (?, 'state_at_risk', ?, ?, 'open')",
            (f"ask-review-{idx}", text, "Controlled Ask quality scenario"),
        )
    for idx, text in enumerate(scenario.open_questions):
        blocking = 1 if text.upper().startswith("BLOCKING:") else 0
        clean = re.sub(r"^BLOCKING:\s*", "", text, flags=re.IGNORECASE)
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking, blocks) VALUES (?, ?, 'open', ?, ?)",
            (f"ask-question-{idx}", clean, blocking, "Launch readiness" if blocking else None),
        )

    for idx, (old_statement, new_statement, changed_at) in enumerate(scenario.history):
        state_id = f"ask-history-state-{idx}"
        proposal_id = f"ask-history-proposal-{idx}"
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, 'history', ?, 2)",
            (state_id, new_statement),
        )
        connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, state_item_id, proposed_statement, rationale, expected_state_version, status, operation) "
            "VALUES (?, ?, ?, ?, 'Controlled Ask quality scenario', 1, 'accepted', 'update')",
            (proposal_id, _ensure_history_review(connection, idx), state_id, new_statement),
        )
        connection.execute(
            "INSERT INTO history_transitions(id, state_item_id, proposed_change_id, transition_type, old_statement, new_statement, from_version, to_version, changed_at) "
            "VALUES (?, ?, ?, 'updated', ?, ?, 1, 2, ?)",
            (f"ask-history-{idx}", state_id, proposal_id, old_statement, new_statement, changed_at),
        )
    connection.commit()


def _ensure_history_review(connection, idx: int) -> str:
    review_id = f"ask-history-review-{idx}"
    connection.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, resolution, resolved_at) "
        "VALUES (?, 'proposed_update', 'Historical controlled change', 'Controlled Ask quality scenario', 'resolved', 'updated', CURRENT_TIMESTAMP)",
        (review_id,),
    )
    return review_id


def _has_uncertainty_language(text: str) -> bool:
    signals = (
        "unknown", "not established", "not decided", "pending", "open question",
        "unresolved", "uncertain", "awaiting review", "not enough", "has not been approved",
        "cannot be confirmed", "cannot be determined", "remains open", "unanswered",
    )
    return any(signal in text for signal in signals)


def _has_open_item_language(text: str) -> bool:
    signals = ("review", "question", "blocking", "pending", "open", "unresolved", "awaiting")
    return any(signal in text for signal in signals)


def _distinguishes_proposal(text: str) -> bool:
    signals = ("pending", "proposed", "awaiting review", "not decided", "not approved", "has not been accepted")
    return any(signal in text for signal in signals)


def score_ask_answer(scenario: AskQualityScenario, answer: dict[str, Any]) -> AskQualityResult:
    text = _normalize(_flatten_strings(answer))
    required_ok = all(
        any(_normalize(phrase) in text for phrase in ((fact,) if isinstance(fact, str) else fact))
        for fact in scenario.required_facts
    )
    forbidden_ok = all(_normalize(claim) not in text for claim in scenario.forbidden_claims)
    uncertainty_ok = (not scenario.should_express_uncertainty) or _has_uncertainty_language(text)
    open_item_ok = (not scenario.should_reference_open_item) or _has_open_item_language(text)
    authority_ok = (not scenario.should_distinguish_proposal_from_truth) or _distinguishes_proposal(text)
    return AskQualityResult(
        scenario=scenario,
        answer=answer,
        required_facts_ok=required_ok,
        forbidden_claims_ok=forbidden_ok,
        uncertainty_ok=uncertainty_ok,
        open_item_ok=open_item_ok,
        authority_ok=authority_ok,
    )


def run_ask_quality_scenario(scenario: AskQualityScenario, provider) -> AskQualityResult:
    connection = _new_test_connection()
    try:
        _seed_ask_scenario(connection, scenario)
        answer = run_ask(connection, LiveAskProvider(provider), scenario.question)
        return score_ask_answer(scenario, answer)
    except Exception as exc:
        return AskQualityResult(
            scenario=scenario,
            answer=None,
            required_facts_ok=False,
            forbidden_claims_ok=False,
            uncertainty_ok=False,
            open_item_ok=False,
            authority_ok=False,
            error=str(exc),
        )
    finally:
        _close(connection)


def review_quality_metrics(results: list[ReviewQualityResult]) -> dict[str, Any]:
    actual_review = [r for r in results if r.review_recommended]
    expected_review = [r for r in results if r.scenario.review_needed]
    true_positive = [r for r in results if r.scenario.review_needed and r.review_recommended]
    false_positive = [r for r in results if not r.scenario.review_needed and r.review_recommended]
    false_negative = [r for r in results if r.scenario.review_needed and not r.review_recommended]
    scored = [r for r in results if r.processing_status != "error"]
    interpretation_correct = [r for r in scored if r.interpretation_correct]
    # Errored scenarios are left out of the rates (they could not be scored) but
    # still count as high-severity failures: a high-severity case that never ran
    # cannot be assumed to pass, so this fails closed. The separate `errors`
    # count keeps harness/software faults distinguishable from model misses (#222).
    high_severity_failures = [r for r in results if r.scenario.severity == "high" and not r.passed]
    return {
        "total": len(results),
        "precision": len(true_positive) / len(actual_review) if actual_review else None,
        "recall": len(true_positive) / len(expected_review) if expected_review else None,
        "false_positives": len(false_positive),
        "false_negatives": len(false_negative),
        "errors": sum(1 for r in results if r.processing_status == "error"),
        "interpretation_accuracy": len(interpretation_correct) / len(scored) if scored else None,
        "high_severity_failures": len(high_severity_failures),
    }


def ask_quality_metrics(results: list[AskQualityResult]) -> dict[str, Any]:
    # Same error policy as review_quality_metrics: excluded from rates, counted as
    # high-severity failures, and reported separately in `errors` (#222).
    completed = [r for r in results if not r.error]
    def rate(predicate):
        return sum(1 for r in completed if predicate(r)) / len(completed) if completed else None
    return {
        "total": len(results),
        "errors": sum(1 for r in results if r.error),
        "ask_grounding": rate(lambda r: r.grounding_ok),
        "uncertainty_accuracy": rate(lambda r: r.uncertainty_ok),
        "open_item_accuracy": rate(lambda r: r.open_item_ok),
        "authority_accuracy": rate(lambda r: r.authority_ok),
        "overall_pass_rate": rate(lambda r: r.passed),
        "high_severity_failures": sum(1 for r in results if r.scenario.severity == "high" and not r.passed),
    }
