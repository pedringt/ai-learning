"""Repeated-run eval matrix: plan, budget-check and run State's AI suites many times on one model.

Library for ``eval/run_matrix.py`` (the thin script) and ``.github/workflows/state-eval-matrix.yml``.
Nothing here loads ``.env`` or calls a model at import time (#224); only ``run_shard`` calls the
model, and only through the existing eval harnesses, whose scorers and scenarios are used as-is.

Each repeat of a suite is written to its own JSON file as soon as it finishes, so a job that is
cancelled or times out keeps every completed repeat. Results go to files only: this module never
posts to State's Product Analytics (no ``--record-url``).

Suites and model calls per repeat (one call per scenario; see ``calls_per_repeat``):
- review: Review-interpretation scenarios (``eval.review_interpretation_scenarios``)
- ask: Ask-quality scenarios (``eval.ask_quality_scenarios``); Ask runs the one-call pipeline
- adversarial: adversarial Ask scenarios for the pending-vs-confirmed boundary (``eval.ask_adversarial_scenarios``), scored like ask
- consequentiality: the release-gate scenarios (``eval.scenarios``, what ``run_eval`` runs)
- baseline: Baseline decomposition sources (``eval.baseline_decomposition``), paste route by default.
  Baseline can make extra calls (chunking, a max_tokens retry split), so its count is a floor; the
  runtime call cap still holds.
"""
from __future__ import annotations

import json
import math
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

SCHEMA = "state-eval-matrix/v1"
SUITES = ("review", "ask", "consequentiality", "baseline", "adversarial", "graded")
MODEL_ID_PATTERN = re.compile(r"^claude-[a-z0-9.-]+$")

# USD per million tokens, Anthropic first-party API. Source: the claude-api skill's model table
# ("Current Models", cached 2026-10-06), checked 2026-10-16. Haiku 5.5's rate is for prompts up to
# 100K tokens; above that it is $0.50 / $2.50 (State's eval prompts are about 3-8K tokens).
PRICING_SOURCE = "claude-api skill model table (cached 2026-10-06), checked 2026-10-16"
PRICING: dict[str, dict[str, float]] = {
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50, "long_input": 0.50, "long_output": 2.50, "long_above": 100_000},
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
}

# Sonnet 5.5 and Opus 5.5 reject thinking={"type": "disabled"}; since Oct 16 every State provider call goes
# through model_request_options.request_options, which sends each model's accepted form (Haiku 5.5 is
# unchanged). Opus 5.5 keeps adaptive thinking at effort "low", and its thinking tokens bill as output.
INCOMPATIBLE_MODELS: dict[str, str] = {}

# Tokens per call, for the cost ESTIMATE only (the aggregator prices actual usage).
# baseline: measured, run 38187113539 (Oct 12, Haiku 5.5, 60 calls): mean 7,311 input / 871 output.
# review/ask/consequentiality: prompt size measured offline (mean 10,976 / 13,467 / 12,061 characters,
# no model call) at about 3.5 characters per token, rounded up; output is a guess well under max_tokens.
TOKENS_PER_CALL: dict[str, dict[str, int]] = {
    "review": {"input": 3_500, "output": 700, "max_output": 2_000},
    "ask": {"input": 4_000, "output": 900, "max_output": 2_400},
    "adversarial": {"input": 4_000, "output": 900, "max_output": 2_400},
    # graded: the grading call only (claude-opus-5-5); its Ask call is priced as "ask" on the run's model.
    # About 1,600 tokens of rubric plus records and the answer; output includes low-effort thinking.
    "graded": {"input": 3_500, "output": 1_000, "max_output": 9_500},
    "consequentiality": {"input": 3_500, "output": 700, "max_output": 2_000},
    "baseline": {"input": 7_500, "output": 900, "max_output": 2_000},
}

# Wall-clock seconds per repeat on Haiku 5.5, from past runs of the existing workflows:
# review 35-40s (16 cases; State AI quality check runs 38195077931, 38199551242, 38299891763, 38411808397),
# ask 27.6-28.3s (10 cases; same workflow), consequentiality 67-77s (36 cases; State QA Release runs
# 38078551511, 38079304500, 38271757236), baseline 119-126s per 6 repeats of 5 sources per route (run 38187113539).
SECONDS_PER_REPEAT: dict[str, float] = {"review": 40, "ask": 30, "adversarial": 30, "graded": 60, "consequentiality": 80, "baseline": 22}
# Other models are unmeasured here; plan shards as if they were this much slower.
MODEL_SLOWDOWN: dict[str, float] = {"claude-haiku-5-5": 1.0, "claude-haiku-4-5": 2.0}
DEFAULT_SLOWDOWN = 3.0

JOB_TIMEOUT_MINUTES = 150      # the workflow's timeout-minutes (GitHub's maximum is 360)
SHARD_WORK_MINUTES = 90        # planned work per job: leaves room for setup, a slow model, and upload
RUN_DEADLINE_MINUTES = 120     # a shard starts no new repeat after this, so its upload always runs
MAX_SHARDS = 256               # GitHub's limit on jobs in one matrix
MAX_REPEATS = 1000
CAP_HEADROOM = 2               # a job may make at most this many times its planned calls


class PlanError(ValueError):
    """The requested matrix is not allowed (bad model id, budget, size)."""


class CallBudgetExceeded(BaseException):
    """Raised by the call counter before a call that would exceed the cap.

    A BaseException on purpose: the eval harnesses catch Exception per scenario and would otherwise
    record it as an ordinary error and carry on to the next (also refused) scenario.
    """


# ---------------------------------------------------------------- validation and planning

def validate_model(model: str) -> str:
    model = model if isinstance(model, str) else ""
    if not MODEL_ID_PATTERN.fullmatch(model):
        raise PlanError(f"Model id {model!r} is not allowed: it must match {MODEL_ID_PATTERN.pattern}")
    if model not in PRICING:
        raise PlanError(f"Model {model!r} has no price in the table; allowed: {', '.join(PRICING)}")
    return model


def parse_suites(text: str) -> list[str]:
    suites = [s.strip() for s in (text or "").split(",") if s.strip()]
    if not suites:
        raise PlanError(f"No suites given; choose from {', '.join(SUITES)}")
    unknown = [s for s in suites if s not in SUITES]
    if unknown:
        raise PlanError(f"Unknown suite(s) {unknown}; choose from {', '.join(SUITES)}")
    return list(dict.fromkeys(suites))


def scenario_ids(suite: str) -> list[str]:
    if suite == "review":
        from eval.review_interpretation_scenarios import SCENARIOS
    elif suite == "ask":
        from eval.ask_quality_scenarios import SCENARIOS
    elif suite == "adversarial":
        from eval.ask_adversarial_scenarios import SCENARIOS
    elif suite == "graded":
        from eval.ask_quality_scenarios import SCENARIOS
    elif suite == "consequentiality":
        from eval.scenarios import SCENARIOS
    elif suite == "baseline":
        from eval.baseline_decomposition import SCENARIOS
    else:
        raise PlanError(f"Unknown suite {suite!r}")
    return [s.id for s in SCENARIOS]


def calls_per_repeat(suite: str) -> int:
    """Planned model calls for one repeat of a suite: one per scenario (graded: an Ask call plus a grading call)."""
    return len(scenario_ids(suite)) * (2 if suite == "graded" else 1)


def estimated_call_cost(suite: str, model: str, output_key: str = "output") -> float:
    """Mean estimated cost of one planned call. A graded scenario is one Ask call on `model` and one
    grading call on the grader model, so its two calls average those two prices."""
    if suite == "graded":
        from eval.ask_grader import GRADER_MODEL

        ask, grade = TOKENS_PER_CALL["ask"], TOKENS_PER_CALL["graded"]
        return (call_cost(model, ask["input"], ask[output_key]) + call_cost(GRADER_MODEL, grade["input"], grade[output_key])) / 2
    tokens = TOKENS_PER_CALL[suite]
    return call_cost(model, tokens["input"], tokens[output_key])


def call_cost(model: str, input_tokens: int | None, output_tokens: int | None) -> float:
    price = PRICING[model]
    inp, out = int(input_tokens or 0), int(output_tokens or 0)
    if "long_above" in price and inp > price["long_above"]:
        return (inp * price["long_input"] + out * price["long_output"]) / 1_000_000
    return (inp * price["input"] + out * price["output"]) / 1_000_000


@dataclass(frozen=True)
class Shard:
    suite: str
    repeat_start: int
    repeat_count: int
    planned_calls: int
    call_cap: int

    def as_dict(self) -> dict[str, Any]:
        return {"suite": self.suite, "repeat_start": self.repeat_start, "repeat_count": self.repeat_count,
                "planned_calls": self.planned_calls, "call_cap": self.call_cap,
                "name": f"{self.suite}-r{self.repeat_start:04d}-{self.repeat_start + self.repeat_count - 1:04d}"}


def repeats_per_shard(suite: str, model: str) -> int:
    seconds = SECONDS_PER_REPEAT[suite] * MODEL_SLOWDOWN.get(model, DEFAULT_SLOWDOWN)
    return max(1, int(SHARD_WORK_MINUTES * 60 // seconds))


def plan(suites: Iterable[str], model: str, repeats: int, max_calls: int) -> dict[str, Any]:
    """The whole run, with no model calls. Raises PlanError when it must be refused."""
    model = validate_model(model)
    suites = list(suites)
    if not isinstance(repeats, int) or repeats < 1 or repeats > MAX_REPEATS:
        raise PlanError(f"repeats must be a whole number from 1 to {MAX_REPEATS}")
    if not isinstance(max_calls, int) or max_calls < 1:
        raise PlanError("max_calls must be a positive whole number")
    per_suite = []
    total = 0
    for suite in suites:
        per_repeat = calls_per_repeat(suite)
        calls = per_repeat * repeats
        total += calls
        per_suite.append({
            "suite": suite,
            "scenarios": per_repeat,
            "calls_per_repeat": per_repeat,
            "repeats": repeats,
            "calls": calls,
            "estimated_cost_usd": calls * estimated_call_cost(suite, model),
            "estimated_minutes": round(calls / per_repeat * SECONDS_PER_REPEAT[suite]
                                       * MODEL_SLOWDOWN.get(model, DEFAULT_SLOWDOWN) / 60, 1),
        })
    shards: list[Shard] = []
    for entry in per_suite:
        size = repeats_per_shard(entry["suite"], model)
        start = 0
        while start < repeats:
            count = min(size, repeats - start)
            planned = count * entry["calls_per_repeat"]
            shards.append(Shard(entry["suite"], start, count, planned, 0))
            start += count
    # Each job's hard cap: its share of max_calls (rounded down, so the jobs together never exceed it),
    # and never more than CAP_HEADROOM x its planned calls (Baseline can add chunk/retry calls).
    if total:
        shards = [Shard(s.suite, s.repeat_start, s.repeat_count, s.planned_calls,
                        min(max_calls * s.planned_calls // total, CAP_HEADROOM * s.planned_calls) if total <= max_calls else 0)
                  for s in shards]
    # Ceiling: every call the caps allow, each with the largest output the provider permits.
    ceiling = sum(s.call_cap * estimated_call_cost(s.suite, model, "max_output") for s in shards)
    result = {
        "model": model,
        "repeats": repeats,
        "max_calls": max_calls,
        "total_calls": total,
        "estimated_cost_usd": sum(e["estimated_cost_usd"] for e in per_suite),
        "ceiling_cost_usd": ceiling,
        "pricing": PRICING[model],
        "pricing_source": PRICING_SOURCE,
        "suites": per_suite,
        "shards": [s.as_dict() for s in shards],
        "refusal": None,
    }
    if model in INCOMPATIBLE_MODELS:
        result["refusal"] = f"{model} cannot run State's suites today: {INCOMPATIBLE_MODELS[model]}"
    elif total > max_calls:
        result["refusal"] = f"{total} planned calls is above max_calls={max_calls}"
    elif len(shards) > MAX_SHARDS:
        result["refusal"] = f"{len(shards)} jobs is above GitHub's {MAX_SHARDS}-job matrix limit; lower repeats"
    return result


def format_plan(p: dict[str, Any]) -> str:
    lines = [f"DRY RUN (no model calls): model {p['model']}, {p['repeats']} repeat(s)"]
    price = p["pricing"]
    lines.append(f"Pricing: ${price['input']:.2f} input / ${price['output']:.2f} output per million tokens ({p['pricing_source']})")
    for e in p["suites"]:
        lines.append(f"  {e['suite']}: {e['calls_per_repeat']} call(s) per repeat x {e['repeats']} = {e['calls']} call(s), "
                     f"about ${e['estimated_cost_usd']:.4f}, about {e['estimated_minutes']} min of model time")
    lines.append(f"Planned calls: {p['total_calls']} (max_calls {p['max_calls']})")
    lines.append(f"Estimated cost: ${p['estimated_cost_usd']:.4f}; ceiling (every capped call at max output): ${p['ceiling_cost_usd']:.4f}")
    lines.append(f"Jobs: {len(p['shards'])} (each at most {SHARD_WORK_MINUTES} min planned, {JOB_TIMEOUT_MINUTES} min timeout)")
    for s in p["shards"]:
        lines.append(f"    {s['name']}: {s['repeat_count']} repeat(s), {s['planned_calls']} call(s), cap {s['call_cap']}")
    if p["refusal"]:
        lines.append(f"REFUSED: {p['refusal']}")
    return "\n".join(lines)


def dry_run_summary(suites: Iterable[str], model: str | None = None) -> str:
    """One-run plan for the single-run scripts' --dry-run (run_eval, run_quality_evals). No model calls."""
    model = model or (os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5")
    suites = list(suites)
    calls = {suite: calls_per_repeat(suite) for suite in suites}
    total = sum(calls.values())
    parts = ", ".join(f"{suite} {n}" for suite, n in calls.items())
    if model in PRICING:
        cost = sum(n * call_cost(model, TOKENS_PER_CALL[s]["input"], TOKENS_PER_CALL[s]["output"]) for s, n in calls.items())
        estimate = f", about ${cost:.4f} ({PRICING_SOURCE})"
    else:
        estimate = " (no price on file for this model)"
    note = f" NOTE: {INCOMPATIBLE_MODELS[model]}" if model in INCOMPATIBLE_MODELS else ""
    return f"DRY RUN (no model calls): would make {total} paid model call(s) on {model} ({parts}){estimate}.{note}"


# ---------------------------------------------------------------- call counting and usage

class CallCounter:
    """Counts every Messages.create/stream call made in-process and keeps each call's token usage.

    Patched on the SDK class, so it sees the providers' calls without any change to them. Calls are
    counted before they are sent; a call that would exceed `cap` raises CallBudgetExceeded instead.
    """

    def __init__(self, cap: int):
        self.cap = cap
        self.calls = 0
        self.usage: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._saved: tuple[Any, Any] | None = None

    def _admit(self) -> None:
        with self._lock:
            if self.calls >= self.cap:
                raise CallBudgetExceeded(f"call cap {self.cap} reached")
            self.calls += 1

    def _record(self, message: Any, started: float, error: BaseException | None = None, model: str | None = None) -> None:
        usage = getattr(message, "usage", None)
        with self._lock:
            self.usage.append({
                "model": model,
                "input_tokens": getattr(usage, "input_tokens", None),
                "output_tokens": getattr(usage, "output_tokens", None),
                "latency_ms": int(round((time.perf_counter() - started) * 1000)),
                "error": f"{type(error).__name__}: {error}"[:300] if error is not None else None,
            })

    def snapshot(self) -> tuple[int, int]:
        with self._lock:
            return self.calls, len(self.usage)

    def since(self, mark: tuple[int, int]) -> tuple[int, list[dict[str, Any]]]:
        with self._lock:
            return self.calls - mark[0], list(self.usage[mark[1]:])

    def __enter__(self) -> "CallCounter":
        from anthropic.resources.messages import Messages

        counter = self
        original_create, original_stream = Messages.create, Messages.stream

        def create(self, *args, **kwargs):
            counter._admit()
            started = time.perf_counter()
            try:
                message = original_create(self, *args, **kwargs)
            except Exception as exc:  # recorded so a provider timeout/error is not mistaken for a model judgment
                counter._record(None, started, exc, kwargs.get("model"))
                raise
            counter._record(message, started, model=kwargs.get("model"))
            return message

        def stream(self, *args, **kwargs):
            counter._admit()
            return original_stream(self, *args, **kwargs)

        self._saved = (original_create, original_stream)
        Messages.create, Messages.stream = create, stream
        return self

    def __exit__(self, *exc) -> None:
        from anthropic.resources.messages import Messages

        if self._saved:
            Messages.create, Messages.stream = self._saved
            self._saved = None


# ---------------------------------------------------------------- per-scenario records

def _is_timeout(text: str) -> bool:
    low = (text or "").lower()
    return "timed out" in low or "timeout" in low


def _error_outcome(error: str) -> str:
    return "timeout" if _is_timeout(error) else "error"


# The interpretation pipeline catches a provider exception and reports processing_status "failed"
# (the harness itself reports "error"). Either way the scenario was not judged, so the matrix counts
# it as an error, not a behaviour failure. Schema/semantic validation failures also land here.
_NOT_JUDGED = ("error", "failed")


def reconcile_call_errors(record: dict[str, Any], usage: list[dict[str, Any]]) -> dict[str, Any]:
    """Use the provider exceptions seen during this scenario to label an error as a timeout and say why."""
    call_errors = [u["error"] for u in usage if u.get("error")]
    if record.get("outcome") in ("error", "timeout") and call_errors:
        if any(_is_timeout(e) for e in call_errors):
            record["outcome"] = "timeout"
        if not record.get("error") or record["error"].startswith(("processing error", "processing failed")):
            record["error"] = call_errors[-1]
    record["call_errors"] = call_errors
    return record


def review_record(r) -> dict[str, Any]:
    """One Review-interpretation result, scored by the existing ReviewQualityResult properties."""
    error = r.error or ("" if r.processing_status not in _NOT_JUDGED else f"processing {r.processing_status}")
    checks = {"review_needed": r.review_needed_correct, "interpretation": r.interpretation_correct}
    failed = [name for name, ok in checks.items() if ok is False]
    if r.processing_status in _NOT_JUDGED or r.error:
        outcome, failure = _error_outcome(error), None
        checks = {}
    elif r.passed:
        outcome, failure = "pass", None
    else:
        outcome = "fail"
        failure = f"expected {r.scenario.expected_action} -> observed {r.observed_action}"
        problems = r.interpretation_problems
        if problems and not problems[0].startswith("action "):
            failure += f" but {'; '.join(problems)}"
        if r.review_recommended != r.scenario.review_needed:
            failure += " (review " + ("raised, not needed" if r.review_recommended else "missed") + ")"
    return {"scenario_id": r.scenario.id, "category": r.scenario.category, "severity": r.scenario.severity,
            "outcome": outcome, "passed": outcome == "pass" if outcome in ("pass", "fail") else None,
            "failure_mode": failure, "failed_checks": failed if outcome == "fail" else [], "checks": checks,
            "expected": r.scenario.expected_action, "observed": r.observed_action,
            "processing_status": r.processing_status, "error": error or None,
            **({"model_output_excerpt": _excerpt(f"proposed: {r.proposed_state_text} | rationale: {r.rationale_text} | proposals: {r.proposal_rows}")}
               if outcome == "fail" else {})}


# Failed scenarios keep a short excerpt of what the model said, so a failure can be read instead of
# guessed at. Every matrix scenario is synthetic, so this records no user content.
MODEL_OUTPUT_EXCERPT_CHARS = 1500


def _excerpt(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= MODEL_OUTPUT_EXCERPT_CHARS else text[:MODEL_OUTPUT_EXCERPT_CHARS] + "…"


def _answer_text(answer: Any) -> str:
    from eval.quality_harness import _flatten_strings
    return _flatten_strings(answer)


_ASK_CHECKS = ("grounding", "required_facts", "forbidden_claims", "uncertainty", "open_item", "authority")


def ask_record(r) -> dict[str, Any]:
    """One Ask-quality result, scored by the existing AskQualityResult properties."""
    if r.error:
        outcome, checks, failed = _error_outcome(r.error), {}, []
    else:
        checks = {
            "grounding": r.grounding_ok, "required_facts": r.required_facts_ok,
            "forbidden_claims": r.forbidden_claims_ok, "uncertainty": r.uncertainty_ok,
            "open_item": r.open_item_ok, "authority": r.authority_ok,
        }
        failed = [name for name in _ASK_CHECKS if checks[name] is False]
        outcome = "pass" if r.passed else "fail"
    return {"scenario_id": r.scenario.id, "category": r.scenario.category, "severity": r.scenario.severity,
            "outcome": outcome, "passed": outcome == "pass" if outcome in ("pass", "fail") else None,
            "failure_mode": ("failed " + ", ".join(failed)) if outcome == "fail" else None,
            "failed_checks": failed if outcome == "fail" else [], "checks": checks,
            "expected": None, "observed": None, "error": r.error or None,
            **({"model_output_excerpt": _excerpt(_answer_text(r.answer))} if outcome == "fail" else {})}


def graded_record(r, grade) -> dict[str, Any]:
    """An Ask result graded by the LLM grader (eval/ask_grader.py). Observed only (DEC-008): outcome is
    the grader's gates (a 1 on faithfulness or authority_calibration, or on consequential_completeness
    for a high-severity scenario, fails); the keyword checks are kept beside it. The full answer is kept
    for Paige's blind calibration (every scenario is synthetic)."""
    from eval.ask_grader import GRADER_VERSION, gates

    record = ask_record(r)
    record["keyword_outcome"] = record["outcome"]
    record["keyword_failed_checks"] = record["failed_checks"]
    record["grader_version"] = GRADER_VERSION
    if r.error:
        return record
    record["answer"] = r.answer
    try:
        grades = grade(r.scenario, r.answer)
    except Exception as exc:  # the grading call failed or returned bad JSON: not judged
        record.update(outcome=_error_outcome(str(exc)), passed=None, failure_mode=None, failed_checks=[], checks={},
                      error=f"grader: {type(exc).__name__}: {exc}"[:300])
        return record
    scores = {name: grade_["score"] for name, grade_ in grades.items()}
    gate = gates(scores, r.scenario.severity)
    failed = [name for name, ok in gate.items() if not ok]
    record.update(outcome="fail" if failed else "pass", passed=not failed, checks=gate, failed_checks=failed,
                  failure_mode=("grader scored 1: " + ", ".join(failed)) if failed else None,
                  grades=grades, scores=scores)
    return record


def consequentiality_record(r) -> dict[str, Any]:
    """One consequentiality result. Ambiguous scenarios have no ground truth and stay unscored."""
    expected = r.scenario.expected
    observed = "must_review" if r.review_recommended else "no_review"
    if r.processing_status in _NOT_JUDGED:
        outcome, failure, checks = _error_outcome(r.error), None, {}
    elif expected not in ("must_review", "no_review"):
        outcome, failure, checks = "unscored", None, {}
    else:
        checks = {"review_decision": r.matches_expected}
        outcome = "pass" if r.matches_expected else "fail"
        failure = None if r.matches_expected else (
            "missed review (expected must_review, got no_review)" if expected == "must_review"
            else "unnecessary review (expected no_review, got must_review)")
    return {"scenario_id": r.scenario.id, "category": r.scenario.category, "severity": None,
            "outcome": outcome, "passed": outcome == "pass" if outcome in ("pass", "fail") else None,
            "failure_mode": failure, "failed_checks": ["review_decision"] if outcome == "fail" else [],
            "checks": checks, "expected": expected, "observed": observed,
            "processing_status": r.processing_status,
            "error": r.error or (f"processing {r.processing_status}" if r.processing_status in _NOT_JUDGED else None)}


def baseline_record(run: dict[str, Any], scenario_id: str, *, latency_ms: int, timeout_seconds: float) -> dict[str, Any]:
    """One Baseline decomposition run. That eval reports rates and has no overall pass/fail, so this
    records each existing measure as a check and leaves `passed` unset (outcome "checked")."""
    if run.get("failed"):
        code = run.get("failure_code") or "unknown"
        message = run.get("failure_message") or ""
        return {"scenario_id": scenario_id, "category": None, "severity": None,
                "outcome": _error_outcome(message) if code == "provider_error" else "error",
                "passed": None, "failure_mode": f"analysis failed: {code}", "failed_checks": [], "checks": {},
                "expected": None, "observed": None, "error": f"{code}: {message}".strip(": ") or None}
    if run.get("facts", 0) == 0 and latency_ms >= timeout_seconds * 1000:
        return {"scenario_id": scenario_id, "category": None, "severity": None, "outcome": "timeout",
                "passed": None, "failure_mode": None, "failed_checks": [], "checks": {},
                "expected": None, "observed": None, "error": f"draft still processing after {timeout_seconds:.0f}s"}
    checks = {
        "all_expected_facts": run.get("recall") == 1.0,
        "no_unresolved_as_fact": run.get("suspect", 0) == 0,
        "no_invented_specifics": not run.get("invented"),
        "no_invented_in_draft": not run.get("invented_in_draft"),
        "enough_areas": bool(run.get("enough_areas")),
    }
    if run.get("expected_open_items_ok") is not None:
        checks["open_items_as_expected"] = bool(run["expected_open_items_ok"])
    failed = [name for name, ok in checks.items() if ok is False]
    detail = []
    if run.get("missed"):
        detail.append("missed " + "; ".join(run["missed"]))
    if run.get("suspect_groups"):
        detail.append("unresolved as fact: " + "; ".join(run["suspect_groups"]))
    if run.get("invented"):
        detail.append("invented " + ", ".join(run["invented"]))
    return {"scenario_id": scenario_id, "category": None, "severity": None, "outcome": "checked",
            "passed": None, "failure_mode": " | ".join(detail) or None, "failed_checks": failed, "checks": checks,
            "expected": None, "observed": f"{run.get('facts')} facts in {run.get('areas')} area(s), recall {run.get('recall')}",
            "error": None}


# ---------------------------------------------------------------- running

def _scenarios(suite: str) -> list[Any]:
    if suite == "review":
        from eval.review_interpretation_scenarios import SCENARIOS
    elif suite == "ask":
        from eval.ask_quality_scenarios import SCENARIOS
    elif suite == "adversarial":
        from eval.ask_adversarial_scenarios import SCENARIOS
    elif suite == "graded":
        from eval.ask_quality_scenarios import SCENARIOS
    elif suite == "consequentiality":
        from eval.scenarios import SCENARIOS
    else:
        from eval.baseline_decomposition import SCENARIOS
    return list(SCENARIOS)


def _runner(suite: str, model: str, *, baseline_route: str, baseline_timeout: float) -> Callable[[Any], dict[str, Any]]:
    """A function that runs one scenario once and returns its record (without usage/latency)."""
    if suite in ("review", "ask", "adversarial", "graded", "consequentiality"):
        from anthropic_provider import AnthropicProvider

        provider = AnthropicProvider(model_identifier=model)
        if suite == "review":
            from eval.quality_harness import run_review_quality_scenario
            return lambda s: review_record(run_review_quality_scenario(s, provider))
        if suite in ("ask", "adversarial"):
            from eval.quality_harness import run_ask_quality_scenario
            return lambda s: ask_record(run_ask_quality_scenario(s, provider))
        if suite == "graded":
            from eval.ask_grader import grade_answer
            from eval.quality_harness import run_ask_quality_scenario
            return lambda s: graded_record(run_ask_quality_scenario(s, provider), grade_answer)
        from eval.harness import run_scenario
        return lambda s: consequentiality_record(run_scenario(s, provider=provider))

    from eval.baseline_decomposition import real_provider, run_scenarios

    provider = real_provider()  # reads CLAUDE_MODEL, which run_shard has checked equals `model`

    def one(s):
        started = time.perf_counter()
        report = run_scenarios(provider, [s], repeats=1, route=baseline_route, timeout_seconds=baseline_timeout)
        latency = int(round((time.perf_counter() - started) * 1000))
        return baseline_record(report["scenarios"][s.id]["runs"][0], s.id, latency_ms=latency, timeout_seconds=baseline_timeout)
    return one


def repeat_path(out_dir: Path, suite: str, repeat: int) -> Path:
    return Path(out_dir) / f"{suite}-r{repeat:04d}.json"


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2))
    os.replace(tmp, path)


def run_shard(suite: str, model: str, repeat_start: int, repeat_count: int, call_cap: int, out_dir: Path, *,
              deadline_minutes: float = RUN_DEADLINE_MINUTES, baseline_route: str = "paste",
              baseline_timeout: float = 180.0, runner: Callable[[Any], dict[str, Any]] | None = None,
              scenarios: list[Any] | None = None, log: Callable[[str], None] = print) -> dict[str, Any]:
    """Run `repeat_count` repeats of `suite`, writing each repeat's JSON as soon as it finishes.

    PAID when `runner` is None: it makes real model calls. Stops early (and says why in the file) when
    the call cap or the deadline would be passed. Returns a short summary.
    """
    model = validate_model(model)
    if model in INCOMPATIBLE_MODELS:
        raise PlanError(INCOMPATIBLE_MODELS[model])
    if suite not in SUITES:
        raise PlanError(f"Unknown suite {suite!r}")
    scenarios = list(scenarios) if scenarios is not None else _scenarios(suite)
    started_all = time.time()
    deadline = started_all + deadline_minutes * 60
    written: list[str] = []
    stopped = None
    with CallCounter(call_cap) as counter:
        if runner is None:
            configured = (os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5").strip()
            if configured != model:
                raise PlanError(f"CLAUDE_MODEL is {configured!r} but this run is for {model!r}; set CLAUDE_MODEL to match")
            runner = _runner(suite, model, baseline_route=baseline_route, baseline_timeout=baseline_timeout)
        for repeat in range(repeat_start, repeat_start + repeat_count):
            if time.time() > deadline:
                stopped = "deadline"
                break
            if counter.calls + len(scenarios) > call_cap:
                stopped = "call_cap"
                break
            records = []
            repeat_started = time.time()
            for scenario in scenarios:
                mark = counter.snapshot()
                t0 = time.perf_counter()
                try:
                    record = runner(scenario)
                except CallBudgetExceeded as exc:
                    record = {"scenario_id": scenario.id, "outcome": "not_run", "passed": None, "error": str(exc),
                              "failure_mode": None, "failed_checks": [], "checks": {}}
                    stopped = "call_cap"
                record["latency_ms"] = int(round((time.perf_counter() - t0) * 1000))
                calls, usage = counter.since(mark)
                record["calls"] = calls
                record["call_usage"] = usage
                reconcile_call_errors(record, usage)
                record["input_tokens"] = sum(u["input_tokens"] or 0 for u in usage)
                record["output_tokens"] = sum(u["output_tokens"] or 0 for u in usage)
                record["suite"] = suite
                record["repeat"] = repeat
                records.append(record)
                if stopped:
                    break
            payload = {
                "schema": SCHEMA, "suite": suite, "model": model, "repeat": repeat,
                "git_sha": os.getenv("GITHUB_SHA", "local"), "baseline_route": baseline_route if suite == "baseline" else None,
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(repeat_started)),
                "elapsed_seconds": round(time.time() - repeat_started, 2),
                "calls": sum(r["calls"] for r in records), "complete": stopped is None, "stopped_reason": stopped,
                "results": records,
            }
            path = repeat_path(out_dir, suite, repeat)
            write_json_atomic(path, payload)
            written.append(str(path))
            passes = sum(1 for r in records if r.get("outcome") == "pass")
            scored = sum(1 for r in records if r.get("outcome") in ("pass", "fail"))
            errors = sum(1 for r in records if r.get("outcome") in ("error", "timeout"))
            log(f"{suite} repeat {repeat}: {passes}/{scored} passed, {errors} error(s)/timeout(s), "
                f"{payload['calls']} call(s), {payload['elapsed_seconds']}s -> {path}")
            if stopped:
                break
        total_calls = counter.calls
    if stopped:
        log(f"Stopped early: {stopped}")
    return {"suite": suite, "files": written, "calls": total_calls, "stopped_reason": stopped,
            "elapsed_seconds": round(time.time() - started_all, 2)}
