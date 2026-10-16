"""Eval matrix: call planning, budget refusal, model-id validation, per-repeat files and the aggregator.

No model calls: runs use a scripted runner, and the call-counter test replaces the SDK's create with a
local fake before the counter wraps it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from eval import aggregate_matrix as agg
from eval import matrix
from eval.ask_quality_scenarios import SCENARIOS as ASK
from eval.baseline_decomposition import SCENARIOS as BASELINE
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW
from eval.scenarios import SCENARIOS as CONSEQUENTIALITY


# ---------------------------------------------------------------- model ids

@pytest.mark.parametrize("model", ["claude-haiku-5-5", "claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"])
def test_priced_model_ids_are_accepted(model):
    assert matrix.validate_model(model) == model


@pytest.mark.parametrize("model", [
    "", "gpt-4o", "Claude-haiku-5-5", "claude-haiku-5-5; rm -rf /", "claude-haiku-5-5\n", "claude_haiku",
    "claude-haiku-5-5 --x", "claude-$(whoami)", "../claude-haiku-5-5",
])
def test_model_ids_outside_the_pattern_are_refused(model):
    with pytest.raises(matrix.PlanError):
        matrix.validate_model(model)


def test_a_well_formed_but_unpriced_model_is_refused():
    assert matrix.MODEL_ID_PATTERN.fullmatch("claude-unknown-9")
    with pytest.raises(matrix.PlanError, match="no price"):
        matrix.validate_model("claude-unknown-9")


def test_pricing_table_matches_the_documented_prices():
    assert matrix.PRICING["claude-haiku-5-5"]["input"] == 0.10 and matrix.PRICING["claude-haiku-5-5"]["output"] == 0.50
    assert matrix.PRICING["claude-sonnet-5-5"] == {"input": 2.00, "output": 10.00}
    assert matrix.PRICING["claude-opus-5-5"] == {"input": 4.00, "output": 20.00}
    assert matrix.PRICING["claude-haiku-4-5"] == {"input": 1.00, "output": 5.00}
    assert matrix.call_cost("claude-haiku-5-5", 100_000, 0) == pytest.approx(0.01)
    assert matrix.call_cost("claude-haiku-5-5", 200_000, 0) == pytest.approx(0.10)  # long-prompt rate: 200K x $0.50/M
    assert matrix.call_cost("claude-opus-5-5", 1_000, 1_000) == pytest.approx(0.024)


# ---------------------------------------------------------------- planning

def test_calls_per_repeat_is_one_per_scenario():
    assert matrix.calls_per_repeat("review") == len(REVIEW)
    assert matrix.calls_per_repeat("ask") == len(ASK)
    assert matrix.calls_per_repeat("consequentiality") == len(CONSEQUENTIALITY)
    assert matrix.calls_per_repeat("baseline") == len(BASELINE)


def test_parse_suites_validates_and_dedupes():
    assert matrix.parse_suites("review, ask,review") == ["review", "ask"]
    with pytest.raises(matrix.PlanError):
        matrix.parse_suites("review,bogus")
    with pytest.raises(matrix.PlanError):
        matrix.parse_suites(" , ")


def test_plan_counts_calls_per_suite_times_repeats():
    p = matrix.plan(["review", "ask"], "claude-haiku-5-5", 7, 10_000)
    assert p["refusal"] is None
    assert [e["calls"] for e in p["suites"]] == [len(REVIEW) * 7, len(ASK) * 7]
    assert p["total_calls"] == (len(REVIEW) + len(ASK)) * 7
    assert p["estimated_cost_usd"] > 0 and p["ceiling_cost_usd"] >= p["estimated_cost_usd"]


def test_plan_refuses_above_max_calls():
    total = len(CONSEQUENTIALITY) * 3
    assert matrix.plan(["consequentiality"], "claude-haiku-5-5", 3, total)["refusal"] is None
    refused = matrix.plan(["consequentiality"], "claude-haiku-5-5", 3, total - 1)
    assert refused["refusal"] and "max_calls" in refused["refusal"]
    assert "REFUSED" in matrix.format_plan(refused)


def test_plan_refuses_bad_inputs():
    with pytest.raises(matrix.PlanError):
        matrix.plan(["review"], "not-a-model", 1, 100)
    with pytest.raises(matrix.PlanError):
        matrix.plan(["review"], "claude-haiku-5-5", 0, 100)
    with pytest.raises(matrix.PlanError):
        matrix.plan(["review"], "claude-haiku-5-5", 1, 0)


def test_plan_accepts_sonnet_and_opus_5_5():
    for model in ("claude-sonnet-5-5", "claude-opus-5-5"):
        assert not matrix.plan(["review"], model, 1, 1000).get("refusal"), model


def test_shards_cover_every_repeat_and_caps_never_exceed_max_calls():
    max_calls = 20_000
    p = matrix.plan(list(matrix.SUITES), "claude-haiku-5-5", 120, max_calls)
    assert p["refusal"] is None
    for suite in matrix.SUITES:
        shards = [s for s in p["shards"] if s["suite"] == suite]
        covered = [r for s in shards for r in range(s["repeat_start"], s["repeat_start"] + s["repeat_count"])]
        assert covered == list(range(120))
        assert all(s["repeat_count"] <= matrix.repeats_per_shard(suite, "claude-haiku-5-5") for s in shards)
    assert sum(s["call_cap"] for s in p["shards"]) <= max_calls
    assert all(s["call_cap"] >= s["planned_calls"] for s in p["shards"])
    # Each job's planned work fits well inside the job timeout.
    for s in p["shards"]:
        minutes = s["repeat_count"] * matrix.SECONDS_PER_REPEAT[s["suite"]] / 60
        assert minutes <= matrix.SHARD_WORK_MINUTES < matrix.JOB_TIMEOUT_MINUTES


def test_slower_models_get_smaller_shards():
    assert matrix.repeats_per_shard("consequentiality", "claude-haiku-4-5") < matrix.repeats_per_shard("consequentiality", "claude-haiku-5-5")


# ---------------------------------------------------------------- call counter

def test_call_counter_counts_records_usage_and_refuses_past_the_cap(monkeypatch):
    from anthropic.resources.messages import Messages

    def fake_create(self, **kwargs):
        return SimpleNamespace(usage=SimpleNamespace(input_tokens=100, output_tokens=20))

    monkeypatch.setattr(Messages, "create", fake_create)
    with matrix.CallCounter(2) as counter:
        Messages.create(None, model="x")
        Messages.create(None, model="x")
        with pytest.raises(matrix.CallBudgetExceeded):
            Messages.create(None, model="x")
    assert counter.calls == 2
    assert [(u["input_tokens"], u["output_tokens"]) for u in counter.usage] == [(100, 20), (100, 20)]
    assert Messages.create is fake_create  # restored on exit


def test_call_budget_exceeded_is_not_swallowed_by_except_exception():
    with pytest.raises(matrix.CallBudgetExceeded):
        try:
            raise matrix.CallBudgetExceeded("cap")
        except Exception:  # what the harnesses do per scenario
            pytest.fail("caught as an ordinary error")


# ---------------------------------------------------------------- records from harness results

def test_review_record_failure_mode_names_the_wrong_action():
    from eval.quality_harness import ReviewQualityResult

    scenario = REVIEW[0]
    wrong = next(a for a in ("open_question", "preserve_evidence_only", "update_state")
                 if a not in (scenario.allowed_actions or (scenario.expected_action,)))
    rec = matrix.review_record(ReviewQualityResult(scenario=scenario, review_recommended=scenario.review_needed,
                                                   observed_action=wrong, processing_status="succeeded"))
    assert rec["outcome"] == "fail" and rec["passed"] is False
    assert f"expected {scenario.expected_action} -> observed {wrong}" in rec["failure_mode"]
    assert "interpretation" in rec["failed_checks"]


def test_review_record_says_which_part_failed_when_the_action_matched():
    # Oct 16 Haiku x30: "expected update_state -> observed update_state" was reported as a failure
    # without saying the proposed state lacked a required phrase.
    from eval.quality_harness import ReviewQualityResult

    scenario = next(s for s in REVIEW if s.id == "review_new_evidence_over_pending_review")
    rec = matrix.review_record(ReviewQualityResult(scenario=scenario, review_recommended=scenario.review_needed,
                                                   observed_action="update_state", processing_status="succeeded",
                                                   proposed_state_text="The budget is $50,000."))
    assert rec["outcome"] == "fail"
    assert "but proposed state lacks" in rec["failure_mode"] and "35,000" in rec["failure_mode"]
    assert "$50,000" in rec["model_output_excerpt"]


def test_interpretation_problems_empty_exactly_when_interpretation_correct():
    from eval.quality_harness import ReviewQualityResult

    for scenario in REVIEW:
        for action in {scenario.expected_action, "open_question", "update_state"}:
            r = ReviewQualityResult(scenario=scenario, review_recommended=True, observed_action=action,
                                    processing_status="succeeded")
            assert r.interpretation_correct == (r.interpretation_problems == [])


def test_review_record_marks_timeouts_and_errors_apart_from_failures():
    from eval.quality_harness import ReviewQualityResult

    s = REVIEW[0]
    timeout = matrix.review_record(ReviewQualityResult(s, False, "error", "error", error="Request timed out."))
    error = matrix.review_record(ReviewQualityResult(s, False, "error", "error", error="schema violation"))
    assert (timeout["outcome"], timeout["passed"]) == ("timeout", None)
    assert (error["outcome"], error["passed"]) == ("error", None)


def test_ask_and_consequentiality_records():
    from eval.harness import ScenarioResult
    from eval.quality_harness import AskQualityResult

    ask_fail = matrix.ask_record(AskQualityResult(ASK[0], {}, True, True, False, True, False))
    assert ask_fail["outcome"] == "fail" and ask_fail["failed_checks"] == ["uncertainty", "authority"]
    with_answer = matrix.ask_record(AskQualityResult(ASK[0], {"answer": "Not yet: Security approval is blocking."},
                                                     True, True, False, True, True))
    assert with_answer["model_output_excerpt"] == "Not yet: Security approval is blocking."
    assert "model_output_excerpt" not in matrix.ask_record(AskQualityResult(ASK[0], {"answer": "ok"}, True, True, True, True, True))
    assert matrix.ask_record(AskQualityResult(ASK[0], None, False, False, False, False, False, error="boom"))["outcome"] == "error"

    must = next(s for s in CONSEQUENTIALITY if s.expected == "must_review")
    missed = matrix.consequentiality_record(ScenarioResult(must, review_recommended=False, processing_status="succeeded"))
    assert missed["outcome"] == "fail" and missed["failure_mode"].startswith("missed review")
    ambiguous = [s for s in CONSEQUENTIALITY if s.expected == "ambiguous"]
    if ambiguous:
        rec = matrix.consequentiality_record(ScenarioResult(ambiguous[0], True, "succeeded"))
        assert rec["outcome"] == "unscored" and rec["passed"] is None


def test_baseline_record_has_checks_but_no_overall_verdict():
    run = {"failed": False, "facts": 3, "areas": 2, "recall": 2 / 3, "missed": ["october 15"], "suspect": 0,
           "invented": ["2026"], "invented_in_draft": [], "enough_areas": True, "expected_open_items_ok": None}
    rec = matrix.baseline_record(run, "atlas_short", latency_ms=4000, timeout_seconds=180)
    assert rec["outcome"] == "checked" and rec["passed"] is None
    assert rec["checks"]["all_expected_facts"] is False and rec["checks"]["no_invented_specifics"] is False
    assert "open_items_as_expected" not in rec["checks"]
    failed = matrix.baseline_record({"failed": True, "failure_code": "schema_violation", "failure_message": "bad"},
                                    "atlas_short", latency_ms=1, timeout_seconds=180)
    assert failed["outcome"] == "error"


# ---------------------------------------------------------------- run_shard with a scripted runner

@dataclass(frozen=True)
class _S:
    id: str


def _scripted(outcomes):
    """A runner that returns the next scripted outcome and makes one counted 'call' through the SDK class."""
    from anthropic.resources.messages import Messages

    it = iter(outcomes)

    def run(scenario):
        Messages.create(None, model="claude-haiku-5-5")
        outcome = next(it)
        return {"scenario_id": scenario.id, "outcome": outcome, "passed": outcome == "pass" if outcome in ("pass", "fail") else None,
                "failure_mode": "expected a -> observed b" if outcome == "fail" else None,
                "failed_checks": [], "checks": {}, "error": "Request timed out." if outcome == "timeout" else None}
    return run


@pytest.fixture
def fake_sdk(monkeypatch):
    from anthropic.resources.messages import Messages

    monkeypatch.setattr(Messages, "create", lambda self, **kw: SimpleNamespace(usage=SimpleNamespace(input_tokens=1000, output_tokens=100)))


def test_run_shard_writes_each_repeat_immediately(tmp_path, fake_sdk):
    scenarios = [_S("a"), _S("b")]
    seen = []

    def log(line):
        seen.append(sorted(p.name for p in tmp_path.glob("*.json")))

    summary = matrix.run_shard("review", "claude-haiku-5-5", 3, 2, 100, tmp_path,
                               runner=_scripted(["pass", "fail", "pass", "timeout"]), scenarios=scenarios, log=log)
    # After the first repeat finished, its file was already on disk.
    assert seen[0] == ["review-r0003.json"]
    assert summary["calls"] == 4 and summary["stopped_reason"] is None
    data = json.loads((tmp_path / "review-r0004.json").read_text())
    assert data["schema"] == matrix.SCHEMA and data["complete"] is True and data["repeat"] == 4
    assert [r["outcome"] for r in data["results"]] == ["pass", "timeout"]
    assert data["results"][0]["input_tokens"] == 1000 and data["results"][0]["calls"] == 1


def test_run_shard_stops_before_passing_the_call_cap(tmp_path, fake_sdk):
    summary = matrix.run_shard("ask", "claude-haiku-5-5", 0, 5, 5, tmp_path,
                               runner=_scripted(["pass"] * 20), scenarios=[_S("a"), _S("b")], log=lambda _: None)
    assert summary["calls"] == 4 and summary["stopped_reason"] == "call_cap"
    assert sorted(p.name for p in tmp_path.glob("*.json")) == ["ask-r0000.json", "ask-r0001.json"]


def test_run_shard_refuses_a_mismatched_claude_model(tmp_path, monkeypatch):
    # Sonnet 5.5 and Opus 5.5 run since Oct 16 (model_request_options), so only the CLAUDE_MODEL check refuses.
    assert matrix.INCOMPATIBLE_MODELS == {}
    monkeypatch.setenv("CLAUDE_MODEL", "claude-haiku-4-5")
    with pytest.raises(matrix.PlanError, match="CLAUDE_MODEL"):
        matrix.run_shard("review", "claude-haiku-5-5", 0, 1, 10, tmp_path, scenarios=[_S("a")])


# ---------------------------------------------------------------- aggregator

def test_wilson_interval_known_values():
    assert agg.wilson_interval(0, 0) is None
    low, high = agg.wilson_interval(8, 10)
    assert low == pytest.approx(0.4902, abs=1e-3) and high == pytest.approx(0.9433, abs=1e-3)
    low, high = agg.wilson_interval(10, 10)
    assert high == pytest.approx(1.0) and low == pytest.approx(0.7225, abs=1e-3)
    low, high = agg.wilson_interval(0, 5)
    assert low == 0.0 and high == pytest.approx(0.4345, abs=1e-3)


def test_percentile_nearest_rank():
    assert agg.percentile([], 50) is None
    assert agg.percentile([5, 1, 3, 2, 4], 50) == 3
    assert agg.percentile(list(range(1, 101)), 95) == 95


def _repeat(suite, repeat, rows, model="claude-haiku-5-5", complete=True):
    return {"schema": matrix.SCHEMA, "suite": suite, "model": model, "repeat": repeat, "complete": complete,
            "calls": sum(r.get("calls", 1) for r in rows), "results": rows}


def _row(sid, outcome, failure=None, latency=1000, tokens=(1000, 100), checks=None, observed=None):
    return {"scenario_id": sid, "outcome": outcome, "passed": outcome == "pass" if outcome in ("pass", "fail") else None,
            "failure_mode": failure, "checks": checks or {}, "observed": observed, "latency_ms": latency, "calls": 1,
            "call_usage": [{"input_tokens": tokens[0], "output_tokens": tokens[1]}], "error": None}


def test_aggregate_rates_failure_modes_errors_latency_and_cost(tmp_path):
    repeats = [
        _repeat("review", 0, [_row("s1", "pass", latency=100), _row("s2", "fail", "expected update_state -> observed open_question", latency=200)]),
        _repeat("review", 1, [_row("s1", "pass", latency=300), _row("s2", "timeout", latency=400)]),
        _repeat("review", 2, [_row("s1", "fail", "expected update_state -> observed preserve_evidence_only", latency=500),
                              _row("s2", "fail", "expected update_state -> observed open_question", latency=600)], complete=False),
    ]
    for rep in repeats:
        (tmp_path / f"review-r{rep['repeat']:04d}.json").write_text(json.dumps(rep))
    (tmp_path / "unrelated.json").write_text(json.dumps({"hello": 1}))
    summary = agg.aggregate(agg.load_dir(tmp_path))
    suite = summary["suites"][0]
    assert suite["suite"] == "review" and suite["repeats"] == 3 and suite["incomplete_repeats"] == 1
    assert (suite["n"], suite["passes"], suite["timeouts"], suite["errors"]) == (5, 2, 1, 0)
    s1, s2 = suite["scenarios"]
    assert (s1["n"], s1["passes"]) == (3, 2) and s1["pass_rate"] == pytest.approx(2 / 3)
    assert s1["ci95"][0] < 2 / 3 < s1["ci95"][1]
    assert (s2["n"], s2["passes"], s2["timeouts"]) == (2, 0, 1)
    assert s2["failure_modes"] == {"expected update_state -> observed open_question": 2}
    assert suite["latency_ms_p50"] == 300 and suite["latency_ms_p95"] == 600
    assert suite["input_tokens"] == 6000 and suite["output_tokens"] == 600
    assert suite["cost_usd"] == pytest.approx(6 * matrix.call_cost("claude-haiku-5-5", 1000, 100))
    md = agg.to_markdown(summary)
    assert "### review" in md and "| s2 | 2 | 0 | 0% |" in md and "observed open_question x2" in md
    assert "Errors 0, timeouts 1" in md


def test_aggregate_baseline_checks_and_unscored_scenarios():
    repeats = [
        _repeat("baseline", 0, [_row("atlas", "checked", checks={"all_expected_facts": True, "no_invented_specifics": False})]),
        _repeat("baseline", 1, [_row("atlas", "checked", checks={"all_expected_facts": True, "no_invented_specifics": True})]),
        _repeat("consequentiality", 0, [_row("amb", "unscored", observed="must_review"), _row("c1", "pass")]),
    ]
    summary = agg.aggregate(agg.load_repeats([]) + repeats)
    by = {s["suite"]: s for s in summary["suites"]}
    base = by["baseline"]
    assert base["n"] == 0 and base["checks"]["no_invented_specifics"] == {"passes": 1, "n": 2, "rate": 0.5}
    cons = by["consequentiality"]
    assert cons["n"] == 1 and cons["outcomes"]["unscored"] == 1
    md = agg.to_markdown(summary)
    assert "No overall pass/fail" in md and "unscored (ambiguous): must_review x1" in md


def test_aggregate_cli_writes_markdown_json_and_step_summary(tmp_path, monkeypatch):
    results = tmp_path / "results" / "matrix-review-0"
    results.mkdir(parents=True)
    (results / "review-r0000.json").write_text(json.dumps(_repeat("review", 0, [_row("s1", "pass")])))
    step = tmp_path / "step.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(step))
    assert agg.main([str(tmp_path / "results"), "--out", str(tmp_path / "s.md"), "--json", str(tmp_path / "s.json")]) == 0
    assert "## State eval matrix" in step.read_text() and (tmp_path / "s.md").read_text() == step.read_text()
    assert json.loads((tmp_path / "s.json").read_text())["suites"][0]["passes"] == 1
    empty = tmp_path / "empty"
    empty.mkdir()
    assert agg.main([str(empty)]) == 1


# ---------------------------------------------------------------- wiring through the real harnesses (SDK faked, no network)

def _sdk_times_out(monkeypatch):
    from anthropic.resources.messages import Messages

    def timed_out(self, **kwargs):
        raise RuntimeError("Request timed out.")

    monkeypatch.setattr(Messages, "create", timed_out)
    monkeypatch.setattr(Messages, "stream", timed_out)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-used")
    monkeypatch.setenv("CLAUDE_MODEL", "claude-haiku-5-5")


@pytest.mark.parametrize("suite, scenarios", [("review", REVIEW[:2]), ("ask", ASK[:2]), ("consequentiality", CONSEQUENTIALITY[:2])])
def test_run_shard_through_the_real_harness_counts_calls_and_marks_timeouts(tmp_path, monkeypatch, suite, scenarios):
    _sdk_times_out(monkeypatch)
    monkeypatch.setenv("STATE_EVAL_TRACE_DIR", str(tmp_path / "traces"))
    summary = matrix.run_shard(suite, "claude-haiku-5-5", 0, 1, 10, tmp_path / "out", scenarios=scenarios, log=lambda _: None)
    assert summary["calls"] == len(scenarios)
    data = json.loads((tmp_path / "out" / f"{suite}-r0000.json").read_text())
    assert [r["outcome"] for r in data["results"]] == ["timeout"] * len(scenarios)
    assert all(r["calls"] == 1 and r["passed"] is None for r in data["results"])


def test_run_shard_baseline_through_the_real_api_path(tmp_path, monkeypatch):
    _sdk_times_out(monkeypatch)
    summary = matrix.run_shard("baseline", "claude-haiku-5-5", 0, 1, 10, tmp_path / "out",
                               scenarios=BASELINE[:1], baseline_timeout=20, log=lambda _: None)
    data = json.loads((tmp_path / "out" / "baseline-r0000.json").read_text())
    (row,) = data["results"]
    assert summary["calls"] >= 1 and row["calls"] >= 1
    assert row["outcome"] == "timeout" and row["passed"] is None and "timed out" in row["error"]


def test_reconcile_keeps_plain_provider_errors_as_errors():
    rec = {"outcome": "error", "error": "processing failed"}
    matrix.reconcile_call_errors(rec, [{"error": "BadRequestError: 400 thinking disabled not supported"}])
    assert rec["outcome"] == "error" and rec["error"].startswith("BadRequestError")
    judged = {"outcome": "fail", "error": None}
    matrix.reconcile_call_errors(judged, [{"error": None}])
    assert judged["outcome"] == "fail" and judged["call_errors"] == []


def test_dry_run_summary_for_the_single_run_scripts(monkeypatch):
    monkeypatch.delenv("CLAUDE_MODEL", raising=False)
    line = matrix.dry_run_summary(["review", "ask"])
    assert line.startswith("DRY RUN (no model calls)") and f"{len(REVIEW) + len(ASK)} paid model call(s) on claude-haiku-5-5" in line
    assert "NOTE" not in matrix.dry_run_summary(["ask"], "claude-opus-5-5")  # Opus 5.5 is callable since Oct 16


def test_adversarial_suite_plans_one_call_per_scenario_and_runs_as_ask():
    from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL

    assert matrix.calls_per_repeat("adversarial") == len(ADVERSARIAL) == 20
    assert all(s.id.startswith("adv_") for s in ADVERSARIAL)
    assert matrix.parse_suites("adversarial") == ["adversarial"]


# ---------------------------------------------------------------- graded suite (LLM grader, no model calls)

def _ask_result(scenario, answer=None, error=""):
    from eval.quality_harness import AskQualityResult
    return AskQualityResult(scenario, answer if answer is not None else {"headline": "x"}, True, True, True, True, True, error=error)


def _grades(**scores):
    from eval.ask_grader import DIMENSIONS
    return {name: {"score": scores.get(name, 4), "reason": "r"} for name in DIMENSIONS}


def test_graded_suite_plans_two_calls_per_scenario_and_prices_the_grader_as_opus():
    assert matrix.calls_per_repeat("graded") == 2 * len(ASK)
    p = matrix.plan(["graded"], "claude-haiku-5-5", 1, 1000)
    ask_only = matrix.plan(["ask"], "claude-haiku-5-5", 1, 1000)
    assert p["estimated_cost_usd"] > 10 * ask_only["estimated_cost_usd"]  # the Opus grading call dominates


def test_graded_record_gates_on_faithfulness_and_authority_only():
    scenario = next(s for s in ASK if s.severity != "high")
    passed = matrix.graded_record(_ask_result(scenario), lambda s, a: _grades(directness=1, concision=1))
    assert passed["outcome"] == "pass" and passed["scores"]["directness"] == 1
    failed = matrix.graded_record(_ask_result(scenario), lambda s, a: _grades(authority_calibration=1))
    assert failed["outcome"] == "fail" and failed["failed_checks"] == ["authority_calibration"]
    two = matrix.graded_record(_ask_result(scenario), lambda s, a: _grades(faithfulness=2))
    assert two["outcome"] == "pass"  # a 2 is counted toward a rate, not failed


def test_graded_record_gates_completeness_only_on_high_severity():
    high = next(s for s in ASK if s.severity == "high")
    low = next(s for s in ASK if s.severity != "high")
    grade = lambda s, a: _grades(consequential_completeness=1)
    assert matrix.graded_record(_ask_result(high), grade)["outcome"] == "fail"
    assert matrix.graded_record(_ask_result(low), grade)["outcome"] == "pass"


def test_graded_record_keeps_answer_and_keyword_result_and_marks_grader_errors():
    scenario = ASK[0]
    rec = matrix.graded_record(_ask_result(scenario, {"headline": "h"}), lambda s, a: _grades())
    assert rec["answer"] == {"headline": "h"} and rec["keyword_outcome"] == "pass"

    def broken(s, a):
        raise ValueError("bad json")
    err = matrix.graded_record(_ask_result(scenario), broken)
    assert err["outcome"] == "error" and err["passed"] is None and "grader" in err["error"]


def test_aggregate_prices_each_call_by_its_own_model_and_reports_grader_scores():
    row = {"scenario_id": "s", "outcome": "pass", "passed": True, "checks": {}, "scores": {"faithfulness": 4},
           "call_usage": [{"model": "claude-haiku-5-5", "input_tokens": 100_000, "output_tokens": 0},
                          {"model": "claude-opus-5-5", "input_tokens": 100_000, "output_tokens": 0}]}
    summary = agg.aggregate([{"schema": matrix.SCHEMA, "suite": "graded", "model": "claude-haiku-5-5", "repeat": 0,
                              "calls": 2, "complete": True, "results": [row]}])
    assert round(summary["totals"]["cost_usd"], 3) == 0.41  # $0.01 Haiku + $0.40 Opus
    assert summary["suites"][0]["grader_scores"]["faithfulness"]["mean"] == 4
    assert "LLM grader" in agg.to_markdown(summary)


def test_grader_prompt_carries_records_and_rationale_but_not_keyword_lists():
    from eval.ask_grader import GRADE_SCHEMA, user_message
    scenario = next(s for s in ASK if s.forbidden_claims)
    text = user_message(scenario, {"headline": "h", "source_ids": ["secret-id"]})
    assert scenario.question in text and scenario.rationale in text
    assert "secret-id" not in text
    assert not any(claim in text for claim in scenario.forbidden_claims)
    assert GRADE_SCHEMA["additionalProperties"] is False
