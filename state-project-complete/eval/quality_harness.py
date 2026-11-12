"""Model-backed harnesses for Review interpretation and Ask quality evals.

These evals exercise State's real interpretation and Ask orchestration against
controlled test databases. They deliberately keep product-owner expectations
separate from model output and score outcomes rather than exact wording.
"""
from __future__ import annotations

import os
import re
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Any

from database_migration_backed import get_test_db
from interpretation_trace import TracePolicy, run_traced_interpretation
from question_review_service import matching_open_question
from ask_provider import LiveAskProvider
from ask_display import answer_lead, displayed_text
from ask_service import run_ask, stream_ask_events
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
    proposed_state_text: str = ""
    review_prose: str = ""
    rationale_text: str = ""
    error: str = ""
    proposal_rows: str = ""

    @property
    def review_needed_correct(self) -> bool:
        return self.review_recommended == self.scenario.review_needed

    @property
    def interpretation_correct(self) -> bool:
        return not self.interpretation_problems

    @property
    def interpretation_problems(self) -> list[str]:
        """Why the interpretation check failed (empty when it passed), so a report can say which part
        missed instead of showing a matching expected and observed action as a failure."""
        allowed = self.scenario.allowed_actions or (self.scenario.expected_action,)
        if self.observed_action not in allowed:
            return [f"action {self.observed_action} not in {', '.join(allowed)}"]
        if self.observed_action in {"update_state", "answer_question_and_update_state", "update_state_and_open_question"}:
            text = _normalize(self.proposed_state_text)
            missing = [
                required if isinstance(required, str) else " / ".join(required)
                for required in self.scenario.required_state_update_phrases
                if not any(
                    _normalize(option) in text
                    for option in ((required,) if isinstance(required, str) else required)
                )
            ]
            if missing:
                return [f"proposed state lacks {', '.join(missing)}"]
            forbidden = [phrase for phrase in self.scenario.forbidden_state_update_phrases if _normalize(phrase) in text]
            if forbidden:
                return [f"proposed state contains forbidden {', '.join(forbidden)}"]
        prose = _normalize(self.review_prose)
        forbidden = [phrase for phrase in self.scenario.forbidden_review_phrases if _normalize(phrase) in prose]
        if forbidden:
            return [f"review prose contains forbidden {', '.join(forbidden)}"]
        rationale = _normalize(self.rationale_text)
        missing = [
            r if isinstance(r, str) else " / ".join(r)
            for r in self.scenario.required_rationale_phrases
            if not any(_normalize(option) in rationale for option in ((r,) if isinstance(r, str) else r))
        ]
        if missing:
            return [f"rationale lacks {', '.join(missing)}"]
        return []

    @property
    def passed(self) -> bool:
        return self.processing_status != "error" and self.review_needed_correct and self.interpretation_correct


def _seed_review_scenario(connection, scenario: ReviewInterpretationScenario) -> None:
    for idx, (topic, statement) in enumerate(scenario.current_state):
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
            (f"quality-state-{idx}", topic, statement),
        )
    for idx, text in enumerate(scenario.pending_reviews):
        review_id = f"quality-pending-review-{idx}"
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) VALUES (?, 'proposed_update', ?, 'Controlled pending Review', 'open')",
            (review_id, text),
        )
        state_id = "quality-state-0" if scenario.current_state else None
        if state_id:
            connection.execute(
                "INSERT INTO proposed_state_changes(id, review_id, state_item_id, proposed_statement, rationale, expected_state_version, status, operation) "
                "VALUES (?, ?, ?, ?, 'Controlled pending Review', 1, 'pending', 'update')",
                (f"quality-pending-proposal-{idx}", review_id, state_id, text),
            )
    for idx, text in enumerate(scenario.open_questions):
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', 0)",
            (f"quality-question-{idx}", text),
        )
    connection.commit()


def _observed_review_outcome(connection, review_ids: list[str]) -> tuple[str, str]:
    if not review_ids:
        return "preserve_evidence_only", ""
    placeholders = ",".join("?" for _ in review_ids)
    state_rows = connection.execute(
        f"SELECT proposed_statement FROM proposed_state_changes WHERE review_id IN ({placeholders}) AND status='pending'",
        tuple(review_ids),
    ).fetchall()
    state_changes = len(state_rows)
    proposed_state_text = " ".join(str(row["proposed_statement"] or "") for row in state_rows)
    proposed_questions = connection.execute(
        f"SELECT COUNT(*) AS n FROM proposed_questions WHERE review_id IN ({placeholders}) AND status='pending'",
        tuple(review_ids),
    ).fetchone()["n"]
    linked_questions = connection.execute(
        f"SELECT COUNT(*) AS n FROM review_questions WHERE review_id IN ({placeholders})",
        tuple(review_ids),
    ).fetchone()["n"]
    risk_reviews = connection.execute(
        f"SELECT COUNT(*) AS n FROM review_issues WHERE id IN ({placeholders}) AND review_type='state_at_risk'",
        tuple(review_ids),
    ).fetchone()["n"]

    if state_changes and linked_questions:
        return "answer_question_and_update_state", proposed_state_text
    if state_changes and proposed_questions:
        return "update_state_and_open_question", proposed_state_text
    if state_changes:
        return "update_state", proposed_state_text
    if proposed_questions:
        # #477: a suggested Question whose text matches an open one is offered as "Link existing Question".
        texts = connection.execute(
            f"SELECT text FROM proposed_questions WHERE review_id IN ({placeholders}) AND status='pending'",
            tuple(review_ids),
        ).fetchall()
        if any(matching_open_question(connection, row["text"]) for row in texts):
            return "link_existing_question", ""
        return "open_question", ""
    if linked_questions:
        return "answer_question", ""
    if risk_reviews:
        return "state_at_risk", ""
    return "preserve_evidence_only", ""


def _review_prose(connection, review_ids: list[str]) -> str:
    if not review_ids:
        return ""
    placeholders = ",".join("?" for _ in review_ids)
    # Read columns by name: the test database returns mapping rows, and iterating one yields the
    # column NAMES (the first version of this did that, so every prose check compared against
    # "decision_question why_consequential" and could never match).
    parts = []
    for row in connection.execute(
            f"SELECT decision_question, why_consequential FROM review_issues WHERE id IN ({placeholders})", tuple(review_ids)).fetchall():
        parts += [str(row["decision_question"] or ""), str(row["why_consequential"] or "")]
    for row in connection.execute(
            f"SELECT proposed_statement, rationale FROM proposed_state_changes WHERE review_id IN ({placeholders})", tuple(review_ids)).fetchall():
        parts += [str(row["proposed_statement"] or ""), str(row["rationale"] or "")]
    return " ".join(p for p in parts if p)


def _rationale_text(connection, review_ids: list[str]) -> str:
    if not review_ids:
        return ""
    placeholders = ",".join("?" for _ in review_ids)
    rows = connection.execute(
        f"SELECT rationale FROM proposed_state_changes WHERE review_id IN ({placeholders})", tuple(review_ids)).fetchall()
    return " ".join(str(row["rationale"] or "") for row in rows if row["rationale"])


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
        observed_action, proposed_state_text = _observed_review_outcome(connection, review_ids)
        review_prose = _review_prose(connection, review_ids)
        rationale_text = _rationale_text(connection, review_ids)
        proposal_rows = ""
        if review_ids:
            placeholders = ",".join("?" for _ in review_ids)
            proposal_rows = "; ".join(
                f"{row['operation']} target={row['state_item_id']} status={row['status']}"
                f" supersedes={row['supersedes_proposal_id']}"
                for row in connection.execute(
                    f"SELECT operation, state_item_id, status, supersedes_proposal_id FROM proposed_state_changes "
                    f"WHERE review_id IN ({placeholders}) ORDER BY created_at, id", tuple(review_ids)).fetchall())
            proposal_rows += " | affected: " + ",".join(
                row["state_item_id"] for row in connection.execute(
                    f"SELECT state_item_id FROM review_state_items WHERE review_id IN ({placeholders})",
                    tuple(review_ids)).fetchall())
        error = ""
        if process_result.processing_status == "failed":
            # The pipeline stores why it failed on the interpretation record; keep it so the report
            # can tell a provider error from a schema or semantic validation failure.
            row = connection.execute(
                "SELECT error_code FROM interpretation_records WHERE evidence_id=? AND processing_status='failed' "
                "ORDER BY rowid DESC LIMIT 1", (evidence_id,)).fetchone()
            error = f"processing failed ({row['error_code']})" if row and row["error_code"] else ""
        return ReviewQualityResult(
            scenario=scenario,
            review_recommended=bool(review_ids),
            observed_action=observed_action,
            processing_status=process_result.processing_status,
            trace_id=traced.trace_id,
            trace_path=traced.trace_path or "",
            proposed_state_text=proposed_state_text,
            review_prose=review_prose,
            rationale_text=rationale_text,
            error=error,
            proposal_rows=proposal_rows,
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
    # Which items failed (#639/#643), so a report can say what the answer got wrong instead of which check fired.
    missing_facts: tuple[str, ...] = ()
    asserted_claims: tuple[str, ...] = ()
    unsupported_numbers: tuple[str, ...] = ()
    headline_opening: str = ""
    headline_missing: tuple[str, ...] = ()
    # #567: with ASK_EVAL_TRANSPORT=stream, how long a person waits: until the first content the browser would draw
    # (a raw text delta on the older code, a checked claim or section after #567) and until the finished answer.
    latency: dict[str, Any] = field(default_factory=dict)

    @property
    def number_ok(self) -> bool:
        return not self.unsupported_numbers

    @property
    def failed_items(self) -> list[str]:
        return ([f"missing required fact: {fact}" for fact in self.missing_facts]
                + [f"asserted forbidden claim: {claim}" for claim in self.asserted_claims]
                + [f"number not in any record: {number}" for number in self.unsupported_numbers]
                + ([f"headline opens with forbidden: {self.headline_opening}"] if self.headline_opening else [])
                + [f"headline lacks: {fact}" for fact in self.headline_missing])

    @property
    def grounding_ok(self) -> bool:
        return (self.required_facts_ok and self.forbidden_claims_ok and self.number_ok
                and not self.headline_opening and not self.headline_missing)

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
            # Oct 20: no placeholder: the grader read "Controlled Ask quality scenario" as filler on every card.
            (f"ask-review-{idx}", text, ""),
        )
    for idx, text in enumerate(scenario.evidence):
        connection.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (f"ask-evidence-{idx}", text))
        if scenario.pending_reviews:
            connection.execute("INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)", ("ask-review-0", f"ask-evidence-{idx}"))
    for idx, text in enumerate(scenario.open_questions):
        blocking = 1 if text.upper().startswith("BLOCKING:") else 0
        clean = re.sub(r"^BLOCKING:\s*", "", text, flags=re.IGNORECASE)
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking, blocks) VALUES (?, ?, 'open', ?, ?)",
            (f"ask-question-{idx}", clean, blocking, "Launch readiness" if blocking else None),
        )
    # The way State closes a Question (review_service.resolve_review): an accepted Review links it, the Question is
    # marked resolved, and its answer is the Evidence the Review accepted (#640).
    for idx, (text, answer) in enumerate(scenario.closed_questions):
        question_id, evidence_id, review_id = f"ask-closed-question-{idx}", f"ask-answer-evidence-{idx}", f"ask-answer-review-{idx}"
        connection.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (evidence_id, answer))
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, resolution, resolved_at) "
            "VALUES (?, 'proposed_update', ?, '', 'resolved', 'question_linked', CURRENT_TIMESTAMP)", (review_id, text))
        connection.execute("INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)", (review_id, evidence_id))
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking, resolution, resolved_at, source_evidence_id) "
            "VALUES (?, ?, 'resolved', 0, 'Resolved by reviewed evidence', CURRENT_TIMESTAMP, ?)", (question_id, text, evidence_id))
        connection.execute("INSERT INTO review_questions(review_id, question_id, evidence_id) VALUES (?, ?, ?)", (review_id, question_id, evidence_id))

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


# Oct 16 (approved by Paige): wordings from correct Haiku 5.5 answers that the list above missed, e.g.
# "Not confirmed: launch readiness is blocked by an open Security question", "has not been established",
# "State cannot confirm", "is still open", "does not have enough confirmed information". Used only for
# the uncertainty check; the authority check keeps the original list.
_ANSWER_UNCERTAINTY_SIGNALS = (
    "not confirmed", "cannot confirm", "can't confirm", "unable to confirm",
    "not been established", "still open", "does not have enough",
)


def _expresses_uncertainty(text: str) -> bool:
    return _has_uncertainty_language(text) or any(signal in text for signal in _ANSWER_UNCERTAINTY_SIGNALS)


def _has_open_item_language(text: str) -> bool:
    signals = ("review", "question", "blocking", "pending", "open", "unresolved", "awaiting")
    return any(signal in text for signal in signals)


def _distinguishes_proposal(text: str) -> bool:
    signals = ("pending", "proposed", "awaiting review", "under review", "in review", "not decided", "not approved", "has not been accepted")
    if any(signal in text for signal in signals):
        return True
    # A grounded answer can also distinguish maintained truth from a conflicting
    # Review by naming the review and explicitly preserving uncertainty, without
    # using one of the exact proposal words above.
    return "review" in text and _has_uncertainty_language(text)


_NEGATION_BEFORE = re.compile(r"(?:\bnot|\bno longer|n't|\bnever)\s+(?:\w+\s+){0,1}$")
# Oct 16 (approved by Paige): a negated reporting frame puts the claim further from the negation,
# e.g. "State does not show that leadership approved removing human review" and "State does not have
# enough confirmed information to say we decided to fully automate support" (correct answers that
# failed). Only a frame ending in a reporting verb counts, so "the record says we decided" still asserts.
# Oct 16 (adversarial suite): "whether SSO is on the Q1 roadmap remains unresolved" asks about the claim
# rather than making it. A "whether" with no comma or sentence end between it and the claim covers it,
# the same rule as the Ask backstop (ask_authority_text._soften_match).
_INSIDE_WHETHER = re.compile(r"\bwhether\b[^,.;:!?]*$")
# Oct 19 (adversarial suite): "the premise that the Zendesk integration was approved is not confirmed"
# names the user's premise to correct it; it is not the claim.
_NAMES_PREMISE = re.compile(r"\bpremise\s+that\s+(?:the\s+|a\s+|an\s+)?$")
_NEGATED_REPORT_BEFORE = re.compile(
    r"(?:(?:\bnot|n't|\bcannot|\bno)\s+(?:\w+\s+){0,6}?"
    # Nov 7 (Paige): "Nothing in the project record shows leadership approved removing human review" is a correct
    # answer that failed ask_pending_review_not_truth (staging run 42407853204). Nov 9 (Paige): "nothing" counts only
    # when it introduces the record directly; "Nothing else matters because the record shows …" and "Nothing is
    # pending and State records …" still assert the claim.
    r"|\bnothing\s+(?:in|on|from|within)\s+(?:(?:the|this|its|any|project|current|maintained)\s+){0,2}"
    r"(?:record|records|history|evidence|state|review|reviews)\s+)"
    r"(?:show|shows|showing|say|says|indicate|indicates|establish|establishes|establishing|confirm|confirms|"
    r"confirming|record|records|support|supports"
    # Oct 27 (approved by Paige): "State does not have confirmed information that leadership approved
    # removing human review" (a correct answer, ask_pending_review_not_truth, eval matrix run 40583243572).
    r"|confirmed\s+information)"
    r"\s+(?:that\s+)?(?:the\s+|a\s+|an\s+)?$"
)


def _asserts(text: str, claim: str) -> bool:
    """True if `claim` appears in `text` other than directly negated.

    A plain substring check counted "it is not currently approved" as the forbidden claim
    "currently approved" (Oct 10, Haiku 5.5's correct answer to ask_current_over_stale)."""
    start = text.find(claim)
    while start != -1:
        # #639 (Nov 7): a claim that starts with a digit is a number, so "0%" is not inside "100%".
        if claim[:1].isdigit() and start and (text[start - 1].isdigit() or text[start - 1] in ".,"):
            start = text.find(claim, start + 1)
            continue
        if not (_NEGATION_BEFORE.search(text[:start]) or _NEGATED_REPORT_BEFORE.search(text[:start])
                or _INSIDE_WHETHER.search(text[:start]) or _NAMES_PREMISE.search(text[:start])):
            return True
        start = text.find(claim, start + 1)
    return False


# Not part of a word or identifier: record ids such as "ask-state-0" appear on answer cards.
_NUMBER = re.compile(r"(?<![\w-])\d[\d,]*(?:\.\d+)?")


def _number_key(token: str) -> str:
    token = token.replace(",", "").rstrip(".")
    whole, _, fraction = token.partition(".")
    whole = whole.lstrip("0") or "0"
    fraction = fraction.rstrip("0")
    return whole + ("." + fraction if fraction else "")


def scenario_record_text(scenario: AskQualityScenario) -> str:
    """Every string the Ask call was seeded with, plus the question: what an answer may take numbers from."""
    return _flatten_strings([scenario.question, scenario.current_state, scenario.pending_reviews, scenario.open_questions,
                             scenario.closed_questions, scenario.history, scenario.evidence])


def unsupported_numbers(text: str, supplied: str) -> list[str]:
    """Numbers `text` asserts that appear nowhere in `supplied` (#639). "Not 100% automated" names a number to deny it,
    so a number under the same negation rules as a forbidden claim is not counted."""
    known = {_number_key(match.group()) for match in _NUMBER.finditer(supplied)}
    found: list[str] = []
    for match in _NUMBER.finditer(text):
        before = text[:match.start()]
        if (_NEGATION_BEFORE.search(before) or _NEGATED_REPORT_BEFORE.search(before)
                or _INSIDE_WHETHER.search(before) or _NAMES_PREMISE.search(before)):
            continue
        key = _number_key(match.group())
        if key not in known and match.group() not in found:
            found.append(match.group().rstrip(".,"))
    return found


def answer_excerpt(answer: Any, needles: list[str] | tuple[str, ...] = (), limit: int = 240) -> str:
    """A short excerpt of what the answer said (#643): the sentence holding the first failed item when there is one,
    otherwise the headline (or the start of the answer). Recorded text only; nothing is reworded."""
    flat = " ".join(displayed_text(answer).split())
    if not flat:
        return ""
    lowered = flat.lower()
    for needle in needles:
        at = lowered.find(_normalize(needle))
        if at != -1:
            start = max(flat.rfind(". ", 0, at) + 2, 0) if flat.rfind(". ", 0, at) != -1 else 0
            end = flat.find(". ", at)
            sentence = flat[start:(end + 1) if end != -1 else len(flat)]
            return sentence if len(sentence) <= limit else sentence[:limit - 1].rstrip() + "…"
    lead = " ".join(answer_lead(answer).split()) or flat
    return lead if len(lead) <= limit else lead[:limit - 1].rstrip() + "…"


def headline_opening(answer: Any, openings: tuple[str, ...]) -> str:
    """The forbidden opening the answer's lead starts with, if any (#640): "No: ..." answers a yes question with a
    denial even when the body is right. Longest match first, so "not yet confirmed" is reported rather than "not yet".
    The lead is the headline, or the first displayed claim when the headline is fixed by software (#567)."""
    headline = _normalize(answer_lead(answer))
    words = re.sub(r"[^\w\s]", " ", headline).split()
    for opening in sorted(openings, key=len, reverse=True):
        target = _normalize(opening).split()
        if target and words[:len(target)] == target:
            return opening
    return ""


def _headline_missing(answer: Any, facts) -> tuple[str, ...]:
    headline = _normalize(answer_lead(answer))
    words = set(re.sub(r"[^\w\s]", " ", headline).split())
    def present(phrase: str) -> bool:
        norm = _normalize(phrase)
        return norm in words if " " not in norm else norm in headline
    return tuple(fact if isinstance(fact, str) else " / ".join(fact) for fact in facts
                 if not any(present(p) for p in ((fact,) if isinstance(fact, str) else fact)))


HYPOTHETICAL_DRAFT_UNMARKED = "a hypothetical draft marked with its assumption line"


def _sections(answer: Any) -> list:
    inner = answer.get("answer", answer) if isinstance(answer, dict) else {}
    inner = inner if isinstance(inner, dict) else {}
    return [s for s in inner.get("sections") or [] if isinstance(s, dict)]


def marked_draft(answer: Any) -> bool:
    return any(isinstance(s.get("hypothetical"), dict) and s["hypothetical"].get("line") for s in _sections(answer))


def outside_marked_draft(answer: Any) -> Any:
    """The answer with a marked draft's body removed, for checks that apply only outside it."""
    import copy

    out = copy.deepcopy(answer)
    for section in _sections(out):
        if isinstance(section.get("hypothetical"), dict):
            section["items"] = []
            section["hypothetical"] = None
    return out


def score_ask_answer(scenario: AskQualityScenario, answer: dict[str, Any]) -> AskQualityResult:
    # #567 (Nov 10, Paige): score what the answer displays (ask_display), not every string in the JSON. The JSON also
    # holds record types, the job and selection ids, which a person never reads and which could satisfy a check.
    # The keyword checks read the answer's words only: a chip ("Answered question"), the fixed headline or the
    # withheld line must never stand in for a fact the answer has to state.
    # Nov 11 (v2 hypothetical-draft scenarios): every check reads only the text outside a marked draft, and the draft
    # must be marked (ask_drafts.py's assumption line).
    scored = outside_marked_draft(answer) if scenario.hypothetical_draft else answer
    text = _normalize(displayed_text(scored, labels=False))
    missing = tuple(
        fact if isinstance(fact, str) else " / ".join(fact)
        for fact in scenario.required_facts
        if not any(_normalize(phrase) in text for phrase in ((fact,) if isinstance(fact, str) else fact))
    )
    if scenario.hypothetical_draft and not marked_draft(answer):
        missing += (HYPOTHETICAL_DRAFT_UNMARKED,)
    asserted = tuple(claim for claim in scenario.forbidden_claims if _asserts(text, _normalize(claim)))
    numbers = tuple(unsupported_numbers(text, _normalize(scenario_record_text(scenario)))) if scenario.forbid_unsupported_numbers else ()
    required_ok = not missing
    forbidden_ok = not asserted
    uncertainty_ok = (not scenario.should_express_uncertainty) or _expresses_uncertainty(text)
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
        missing_facts=missing,
        asserted_claims=asserted,
        unsupported_numbers=numbers,
        headline_opening=headline_opening(answer, scenario.forbidden_headline_openings),
        headline_missing=_headline_missing(answer, scenario.headline_required_facts),
    )


def _streamed_ask(connection, provider, question: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """The same one-call Ask through the streaming path the browser uses, timed at the first event the browser
    would draw and at the finished answer."""
    started = time.perf_counter()
    first_content_ms = None
    final = None
    for name, payload in stream_ask_events(connection, provider, question):
        drawable = name == "delta" or (name == "claim" and payload.get("status") == "shown") or name == "section"
        if drawable and first_content_ms is None:
            first_content_ms = round((time.perf_counter() - started) * 1000)
        if name == "final":
            final = payload
    if final is None:
        raise ValueError("the stream ended without a final answer")
    return final, {"transport": "stream", "first_content_ms": first_content_ms,
                   "total_ms": round((time.perf_counter() - started) * 1000)}


def run_ask_quality_scenario(scenario: AskQualityScenario, provider) -> AskQualityResult:
    connection = _new_test_connection()
    try:
        _seed_ask_scenario(connection, scenario)
        if os.getenv("ASK_EVAL_TRANSPORT") == "stream":
            answer, latency = _streamed_ask(connection, LiveAskProvider(provider), scenario.question)
            result = score_ask_answer(scenario, answer)
            result.latency = latency
            return result
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
