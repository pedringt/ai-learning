"""#640 diagnostic (Nov 7): why Ask's headline denies a resolved Question while its body reports the answer.

Three variants of `ask_question_answer_no_state_mutation`, run with the prompt and scorer unchanged, to separate
possible causes. None is a fix:

- `clear_wording` (fixture correction): the user's question names what the Question is about, instead of
  "vendor-retention", which can also mean keeping the vendor. Same records as the scenario.
- `no_duplicate_evidence` (product diagnostic): the same clear question, with the answer's Evidence record left out
  of Ask's candidates, so the answer reaches the model only as the answered Question's recorded answer.
- `resolved_question_only` (product diagnostic): the same clear question, with only the resolved Question and its
  recorded answer (no Current State, no duplicate Evidence).

The expected answer is not changed to fit a failure. The one difference is that `resolved_question_only` has no
Current State record, so the scenario's "under review" fact and contract claims cannot apply there; that variant is
scored on the answer alone. Every answer is saved in full, for reading headline/body agreement.

A library module: the run script (eval/run_ask_diagnostic.py) loads .env; tests import only this (#224).
"""
from __future__ import annotations

import contextlib
import dataclasses
from dataclasses import dataclass
from typing import Any, Iterator

from eval.ask_quality_scenarios import SCENARIOS, AskQualityScenario

BASE_ID = "ask_question_answer_no_state_mutation"
CLEAR_QUESTION = "Has Legal answered how long the vendor retains customer content?"


@dataclass(frozen=True)
class Variant:
    id: str
    kind: str  # "fixture correction" or "product diagnostic"
    tests: str
    scenario: AskQualityScenario
    drop_duplicate_evidence: bool = False


def _base() -> AskQualityScenario:
    return next(s for s in SCENARIOS if s.id == BASE_ID)


def variants() -> tuple[Variant, ...]:
    base = _base()
    clear = dataclasses.replace(base, question=CLEAR_QUESTION)
    isolated = dataclasses.replace(
        clear, current_state=(),
        # No Current State record in this variant, so its contract fact and claims cannot apply. The answer facts and
        # the headline checks are unchanged.
        required_facts=tuple(f for f in base.required_facts if f != "under review"),
        forbidden_claims=(),
    )
    return (
        Variant("clear_wording", "fixture correction", "whether clearer wording fixes it", clear),
        Variant("no_duplicate_evidence", "product diagnostic", "whether competing record types cause confusion", clear,
                drop_duplicate_evidence=True),
        Variant("resolved_question_only", "product diagnostic", "whether Ask can communicate resolution in isolation",
                isolated, drop_duplicate_evidence=True),
    )


@contextlib.contextmanager
def without_duplicate_evidence(enabled: bool) -> Iterator[None]:
    """Leave out of Ask's candidates any Evidence record that is an answered Question's recorded answer. Patched for
    the diagnostic only; State's own retrieval is unchanged."""
    if not enabled:
        yield
        return
    import ask_service

    original = ask_service._trim_candidates_for_query

    def trimmed(query, candidates):
        out = original(query, candidates)
        answer_ids = {x.get("answer_evidence_id") for x in out.get("answered_questions", [])}
        out["evidence"] = [x for x in out.get("evidence", []) if x.get("id") not in answer_ids]
        return out

    ask_service._trim_candidates_for_query = trimmed
    try:
        yield
    finally:
        ask_service._trim_candidates_for_query = original


def run_variant(variant: Variant, provider: Any) -> dict[str, Any]:
    from eval.quality_harness import run_ask_quality_scenario

    with without_duplicate_evidence(variant.drop_duplicate_evidence):
        result = run_ask_quality_scenario(variant.scenario, provider)
    answer = result.answer or {}
    inner = answer.get("answer") if isinstance(answer.get("answer"), dict) else answer
    return {
        "variant": variant.id, "kind": variant.kind, "question": variant.scenario.question,
        "passed": result.passed, "failed_items": result.failed_items, "error": result.error,
        "headline": inner.get("headline") if isinstance(inner, dict) else None,
        "summary": inner.get("summary") if isinstance(inner, dict) else None,
        "answer": answer,
    }


# Nov 7 (Paige): Step 1 of the headline proposal replaces the status-question rule, with no new examples. These cases
# check whether a headline answers the status the question asks about, in its own polarity, and agrees with the body.
# The three approval scenarios and #640 itself are the suite's own, unchanged. The two new cases set their own
# expectations; neither requires a Current State mention (Paige: include it only when it helps).
NEGATIVE_QUESTION = "Is the vendor-retention question still unanswered?"


def step1_cases() -> tuple[Variant, ...]:
    base = _base()
    by_id = {s.id: s for s in SCENARIOS}
    open_twin = dataclasses.replace(
        base, id="diag_open_question_twin", closed_questions=(), open_questions=(base.closed_questions[0][0],),
        required_facts=(("not yet", "not been answered", "unanswered", "still open", "remains open", "is open"),),
        forbid_unsupported_numbers=True,
        headline_required_facts=(("not yet", "no", "open", "unanswered"),),
        forbidden_headline_openings=("yes", "answered", "resolved"),
    )
    negative = dataclasses.replace(
        base, id="diag_negative_polarity", question=NEGATIVE_QUESTION,
        required_facts=(("answered", "resolved"), "30 days"),
        headline_required_facts=(("no",), ("answered", "resolved", "closed")),
        forbidden_headline_openings=("yes", "not yet", "still unanswered"),
    )
    return (
        Variant("resolved_question", "suite scenario", "a resolved Question: the headline says it was answered", base),
        Variant("open_question_twin", "new case", "the same Question still open: the headline must not say it was answered", open_twin),
        Variant("negative_polarity", "new case", "'still unanswered?' about a resolved Question: the headline says no", negative),
        *(Variant(sid, "suite scenario", "adjacent approval case", by_id[sid])
          for sid in ("ask_pending_review_not_truth", "ask_source_words_not_demoted", "ask_evidence_backed_approval_qualified")),
    )
