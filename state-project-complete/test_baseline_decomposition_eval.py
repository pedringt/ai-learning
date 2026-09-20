"""#233: the Baseline decomposition eval harness. No model calls anywhere in this file.

The real-model run is paid and lives in `python -m eval.run_baseline_decomposition`. These tests cover
everything around it: the scenarios are well formed, the keyword matcher and scorer behave, rates are
aggregated correctly, and both submission routes work end to end with a fake provider.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

from eval.baseline_decomposition import (
    ROUTES, SCENARIOS, DecompositionScenario, _has_all, run_scenarios, score_run, summarize,
)
from test_baseline_setup_lifecycle import BaselineFixtureProvider

SERVICE = Path(__file__).resolve().parent


def test_scenarios_are_well_formed_and_their_expectations_are_grounded_in_the_source():
    ids = [s.id for s in SCENARIOS]
    assert len(ids) == len(set(ids)) >= 4
    for s in SCENARIOS:
        assert s.source.strip() and s.expected_facts and s.min_areas >= 1
        for group in (*s.expected_facts, *s.unresolved):
            assert group == tuple(w.lower() for w in group), f'{s.id}: keywords are lowercase'
            # an author's expectation must actually be present in the text it is about
            assert _has_all(s.source, group), f'{s.id}: {group} does not appear in the source'


def test_matcher_uses_whole_words_but_finds_amounts_and_dates_inside_longer_tokens():
    assert not _has_all("The association meets weekly.", ("sso",))
    assert _has_all("SSO at launch is undecided.", ("sso",))
    assert _has_all("Budget is $180,000 for the year.", ("180,000",))
    assert _has_all("The beta will be invite-only.", ("invite-only",))          # hyphen-insensitive
    assert _has_all("Morgan Lee owns launch readiness.", ("morgan lee", "launch readiness"))
    assert not _has_all("Morgan owns launch readiness.", ("morgan lee", "launch readiness"))


def _draft(facts, *, questions=(), needs=(), failed=0, can_confirm=True):
    return {
        "counts": {"failed_evidence": failed, "processing_evidence": 0},
        "can_confirm": can_confirm,
        "needs_individual_review": [{"decision_question": q} for q in needs],
        "draft": {
            "items": [{"kind": "proposed", "area_name": a, "topic": t, "statement": s} for a, t, s in facts],
            "questions": [{"text": q} for q in questions],
        },
    }


def test_score_run_measures_recall_sections_general_and_suspect_facts():
    scenario = DecompositionScenario(
        id="x", title="x", source="s", min_areas=2,
        expected_facts=(("postgres", "reporting"), ("invite-only",), ("dana",)),
        unresolved=(("sso",),), expects_open_items=True,
    )
    draft = _draft(
        [("General", "Store", "We will use Postgres for the reporting store."),
         ("General", "Beta", "The beta will be invite-only."),
         ("General", "Auth", "Whether to support SSO at launch is undecided.")],
        questions=["Should we support SSO at launch?"],
    )
    scored = score_run(scenario, draft)
    assert scored["facts"] == 3 and scored["areas"] == 1 and scored["general_used"] and not scored["enough_areas"]
    assert scored["recall"] == pytest.approx(2 / 3) and scored["missed"] == ["dana"]
    assert scored["suspect"] == 1 and "SSO" in scored["suspect_statements"][0]     # flagged, and the text is kept to judge it
    assert scored["open_items"] == 1 and scored["expected_open_items_ok"] is True
    assert [f["area"] for f in scored["facts_detail"]] == ["General"] * 3


def test_score_run_records_failure_and_a_blocked_confirm():
    scenario = SCENARIOS[0]
    failed = score_run(scenario, _draft([], failed=1, can_confirm=False))
    assert failed["failed"] and failed["facts"] == 0 and not failed["blocked_confirm"]
    blocked = score_run(scenario, _draft([("Purpose", "x", "Atlas replaces the spreadsheet.")], needs=["A real question"], can_confirm=False))
    assert not blocked["failed"] and blocked["blocked_confirm"] and blocked["open_items"] == 1


def test_summarize_reports_rates_and_keeps_failed_runs_out_of_the_quality_means():
    scenario = DecompositionScenario(id="x", title="x", source="s", min_areas=2, expected_facts=(("a",),), unresolved=(("b",),))
    good = score_run(scenario, _draft([("One", "t", "a fact"), ("Two", "t", "other")]))
    generic = score_run(scenario, _draft([("General", "t", "a b together")]))
    failed = score_run(scenario, _draft([], failed=1))
    summary = summarize([good, generic, failed, failed])
    assert summary["runs"] == 4 and summary["failed_rate"] == 0.5
    assert summary["areas_mean"] == 1.5 and summary["enough_areas_rate"] == 0.5     # only the two non-failed runs
    assert summary["general_used_rate"] == 0.5 and summary["suspect_rate"] == 0.5
    assert summarize([failed])["areas_mean"] is None                                # nothing to average


@pytest.mark.parametrize("route", ROUTES)
def test_the_harness_runs_end_to_end_through_the_real_api_on_both_routes(route):
    report = run_scenarios(BaselineFixtureProvider(), SCENARIOS[:2], repeats=2, route=route)
    assert report["route"] == route and report["repeats"] == 2 and set(report["scenarios"]) == {s.id for s in SCENARIOS[:2]}
    for entry in report["scenarios"].values():
        assert len(entry["runs"]) == 2
        for run in entry["runs"]:
            assert run["submit_status"] == 202 and not run["failed"] and run["facts"] >= 1
            assert run["facts_detail"] and run["facts_detail"][0]["statement"]
    assert report["overall"]["failed_rate"] == 0.0


def test_a_provider_that_fails_shows_up_as_a_failure_rate_not_a_crash():
    class Down:
        name = "down"
        model_identifier = "down-v1"

        def interpret(self, **kwargs):
            raise RuntimeError("provider unavailable")

    report = run_scenarios(Down(), SCENARIOS[:1], repeats=2)
    assert report["overall"]["failed_rate"] == 1.0 and report["overall"]["recall_mean"] is None


def test_unknown_route_is_rejected():
    with pytest.raises(ValueError):
        run_scenarios(BaselineFixtureProvider(), SCENARIOS[:1], repeats=1, route="carrier-pigeon")


def _cli(*args, key=""):
    # ANTHROPIC_API_KEY is set to EMPTY (not removed): the script loads state-project-complete/.env but never
    # overrides a variable that is already set, so no key can leak in and no model call can be made.
    env = {**os.environ, "ANTHROPIC_API_KEY": key, "OPENAI_API_KEY": ""}
    return subprocess.run([sys.executable, "-m", "eval.run_baseline_decomposition", *args], cwd=SERVICE,
                          env=env, capture_output=True, text=True, timeout=120)


def test_cli_dry_run_states_the_number_of_paid_calls_and_makes_none():
    result = _cli("--dry-run", "--repeats", "2", "--route", "upload")
    assert result.returncode == 0
    assert f"{len(SCENARIOS) * 2} paid model call(s)" in result.stdout and "upload" in result.stdout
    assert "provider_start" not in result.stdout + result.stderr


def test_cli_skips_without_a_key():
    result = _cli()
    assert result.returncode == 0 and "SKIPPED" in result.stdout
    assert "provider_start" not in result.stdout + result.stderr
