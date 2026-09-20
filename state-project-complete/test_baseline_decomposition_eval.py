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
    ROUTES, SCENARIOS, DecompositionScenario, _has_all, real_provider, run_scenarios, score_run, summarize,
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
         ("General", "Auth", "SSO will be supported at launch.")],
        questions=["Should we support SSO at launch?"],
    )
    scored = score_run(scenario, draft)
    assert scored["facts"] == 3 and scored["areas"] == 1 and scored["general_used"] and not scored["enough_areas"]
    assert scored["recall"] == pytest.approx(2 / 3) and scored["missed"] == ["dana"]
    assert scored["suspect"] == 1 and "SSO" in scored["suspect_statements"][0]     # flagged, and the text is kept to judge it
    assert scored["open_items"] == 1 and scored["expected_open_items_ok"] is True
    assert [f["area"] for f in scored["facts_detail"]] == ["General"] * 3


KESTREL = next(s for s in SCENARIOS if s.id == "hedged_change")


def test_a_hedged_mention_of_an_unresolved_item_is_not_suspect_but_an_unhedged_one_is():
    # Wording modeled on what the real model wrote in the first paid run (#233).
    hedged = score_run(KESTREL, _draft([
        ("Schedule", "Migration", "Migration to the new billing system is scheduled for September 30; moving it to October 14 is under consideration but has not been decided."),
        ("Schedule", "Fallback", "The date may be deferred to October 14 if testing slips, pending decision."),
        ("People", "Lead", "Tomas Reyes is the migration lead.")]))
    assert hedged["suspect"] == 0 and hedged["hedged_mentions"] == 2 and not hedged["suspect_statements"]
    assert hedged["recall"] == 1.0

    asserted = score_run(KESTREL, _draft([
        ("Schedule", "Migration", "The migration was moved to October 14."),
        ("People", "Lead", "Tomas Reyes is the migration lead."),
        ("Schedule", "Baseline", "Migration is scheduled for September 30.")]))
    assert asserted["suspect"] == 1 and "moved to October 14" in asserted["suspect_statements"][0]
    assert asserted["hedged_mentions"] == 0

    # A bare condition is not a hedge: it presents the considered date as a contingency plan and drops "not decided".
    contingency = score_run(KESTREL, _draft([("General", "", "Migration is scheduled for September 30, with a contingency to move to October 14 if testing slips.")]))
    assert contingency["suspect"] == 1 and contingency["hedged_mentions"] == 0

    plain_no = score_run(KESTREL, _draft([("General", "", "October 14 is being considered as a contingency date, but no decision has been made.")]))
    assert plain_no["suspect"] == 0 and plain_no["hedged_mentions"] == 1

    mixed = score_run(KESTREL, _draft([
        ("Schedule", "A", "Moving to October 14 is under consideration."),
        ("Schedule", "B", "The migration is on October 14.")]))
    assert mixed["suspect"] == 1 and mixed["hedged_mentions"] == 1      # one hedged, one asserted: still flagged


def test_a_year_or_amount_that_the_source_never_states_is_flagged_as_invented():
    # The first paid run wrote "September 30, 2024" for a source that gives no year.
    invented = score_run(KESTREL, _draft([("Schedule", "Migration", "The migration is scheduled for September 30, 2024.")]))
    assert invented["invented"] == ["2024"]

    # A year the source does state is grounded, as is an amount written differently.
    atlas = SCENARIOS[0]
    grounded = score_run(atlas, _draft([("Delivery", "Launch", "The target launch date is October 15, 2026.")]))
    assert grounded["invented"] == []
    plan = next(s for s in SCENARIOS if s.id == "structured_plan")
    money = score_run(plan, _draft([("Budget", "Total", "The approved budget is $ 180,000."), ("Budget", "Extra", "A reserve of $25,000 is set.")]))
    assert money["invented"] == ["$25000"]


def test_summarize_reports_hedged_mention_and_invented_rates():
    clean = score_run(KESTREL, _draft([("Schedule", "M", "Scheduled for September 30, but October 14 is being considered.")]))
    bad = score_run(KESTREL, _draft([("Schedule", "M", "Scheduled for September 30, 2024.")]))
    summary = summarize([clean, bad])
    assert summary["hedged_mention_rate"] == 0.5 and summary["invented_rate"] == 0.5 and summary["suspect_rate"] == 0.0


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


def test_a_plain_interpretation_provider_is_rejected_because_it_would_measure_the_harness_not_the_model(monkeypatch):
    # #233: injecting the plain AnthropicProvider drops the area schema, the Baseline prompt guidance and the
    # metadata that stores areas, so every fact comes back in "General". The first real run measured exactly that.
    import anthropic_provider
    import openai_provider

    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-not-a-key")     # construction only; nothing is ever called
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-not-a-key")
    for plain in (anthropic_provider.AnthropicProvider(), openai_provider.OpenAIProvider()):
        with pytest.raises(ValueError, match="real_provider"):
            run_scenarios(plain, SCENARIOS[:1], repeats=1)


def test_real_provider_is_the_baseline_provider_the_deployed_app_uses(monkeypatch):
    import socket

    import anthropic_provider
    from baseline_setup import _provider_from_env

    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-not-a-key")
    monkeypatch.setattr(socket.socket, "connect", lambda *a, **k: (_ for _ in ()).throw(AssertionError("network attempted")))
    provider = real_provider()
    assert isinstance(provider, anthropic_provider.AnthropicProvider)
    assert type(provider) is not anthropic_provider.AnthropicProvider                          # the Baseline subclass
    assert type(provider).__name__ == type(_provider_from_env(type("S", (), {"provider": "anthropic"})())).__name__ == "BaselineAnthropicProvider"
    assert "proposed_area_name" in str(anthropic_provider.PROVIDER_OUTPUT_SCHEMA)               # area hints are in the schema


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
