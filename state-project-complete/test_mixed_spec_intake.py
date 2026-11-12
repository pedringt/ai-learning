"""#649: the mixed-spec intake measurement. No model calls anywhere in this file.

The paid run is `python -m eval.run_mixed_spec_intake`; these tests cover the outcome classifier, the
summary, and the CLI's dry run and keyless skip.
"""
import os
import subprocess
import sys
from pathlib import Path

from eval.baseline_decomposition import MIXED_SPEC_SOURCE, SCENARIOS
from eval.mixed_spec_intake import INTAKE_SOURCES, OPEN_ITEM, SOURCE, RecordingProvider, classify, raw_view, run_once, summarize

SERVICE = Path(__file__).resolve().parent
FACT = "State supports a bootstrap/backfill workflow when a project is first adopted."


def test_the_intake_measurement_and_the_baseline_scenario_use_the_same_source():
    assert SOURCE == MIXED_SPEC_SOURCE == next(s for s in SCENARIOS if s.id == "mixed_spec").source
    assert "grouping UX" in SOURCE and OPEN_ITEM == (("group*",),)
    assert {"mixed_spec", "decisions_and_open_questions", "hedged_change"} <= set(INTAKE_SOURCES)


def test_a_source_s_own_open_item_keywords_are_used():
    sso = INTAKE_SOURCES["decisions_and_open_questions"].unresolved
    assert classify(["The beta is invite-only."], ["Should we support SSO at launch?"], [], sso)["outcome"] == "raised"
    assert classify(["SSO is supported at launch."], [], [], sso)["outcome"] == "stated_as_fact"
    assert classify(["The beta is invite-only."], [], [], sso)["outcome"] == "dropped"


def test_each_outcome_is_classified_apart():
    assert classify([FACT], ["What grouping UX should a large backfill import use?"], [])["outcome"] == "raised"
    assert classify([FACT], [], ["How should bootstrap proposals be grouped?"])["outcome"] == "raised"
    assert classify([FACT], [], [])["outcome"] == "dropped"
    assert classify([FACT, "Large proposals are grouped by product area."], [], [])["outcome"] == "stated_as_fact"
    assert classify([FACT, "Grouping by area or source is not yet decided."], [], [])["outcome"] == "hedged_in_fact"
    # Stated as fact is the authority breach, so it wins even when a Question also raised it.
    both = classify(["Proposals are grouped by product area."], ["Which grouping UX?"], [])
    assert both["outcome"] == "stated_as_fact" and both["raised_texts"] == ["Which grouping UX?"]


def test_a_question_about_something_else_passes_the_existing_test_but_counts_as_dropped():
    run = classify([FACT], ["Who owns the backfill import?"], [])
    assert run["legacy_test_pass"] and run["outcome"] == "dropped"


def test_summarize_counts_outcomes_and_keeps_failed_runs_out():
    runs = [{"failed": False, **classify([FACT], ["Which grouping UX?"], [])},
            {"failed": False, **classify([FACT], [], [])},
            {"failed": False, **classify([], ["Which grouping UX?"], [])},
            {"failed": True, "outcome": None}]
    s = summarize(runs)
    assert s["runs"] == 4 and s["failed"] == 1
    assert s["outcomes"] == {"stated_as_fact": 0, "dropped": 1, "raised": 2, "hedged_in_fact": 0}
    assert s["no_settled_fact"] == 1 and s["legacy_test_fail"] == 2


def test_raw_view_shows_an_open_item_the_model_raised_but_software_removed():
    # A missing_understanding recommendation with no proposed change is dropped by software (#104); the
    # raw view is how a run tells that apart from the model never mentioning the item.
    raw = {"summary": "Decisions on bootstrap; grouping UX is undecided.",
           "review_recommendations": [
               {"review_type": "missing_understanding", "decision_question": "How should proposals be grouped?",
                "why_consequential": "x", "proposed_changes": []},
               {"review_type": "missing_understanding", "decision_question": "Record bootstrap?",
                "why_consequential": "y", "proposed_changes": [{"proposed_statement": "State supports bootstrap."}]}]}
    view = raw_view(raw)
    assert view["raw_mentions"] and view["raw_summary_mentions"]
    assert view["raw_open_item_recs"] == [{"review_type": "missing_understanding", "proposed_changes": 0,
                                           "decision_question": "How should proposals be grouped?", "why_consequential": "x"}]
    assert view["raw_review_types"] == ["missing_understanding", "missing_understanding"]
    assert raw_view(None) == {"raw_mentions": None}


def test_the_recording_provider_keeps_the_model_output_and_the_run_carries_it():
    from test_baseline_setup_lifecycle import BaselineFixtureProvider
    run = run_once(BaselineFixtureProvider(), keep_raw=True)
    assert not run["failed"] and isinstance(run["raw"], dict) and "review_recommendations" in run["raw"]
    assert run["raw_mentions"] is False                     # the fixture output never mentions grouping
    assert "raw" not in run_once(BaselineFixtureProvider())


def _cli(*args):
    # The key is set to EMPTY, not removed, so state-project-complete/.env cannot supply one.
    env = {**os.environ, "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""}
    return subprocess.run([sys.executable, "-m", "eval.run_mixed_spec_intake", *args], cwd=SERVICE,
                          env=env, capture_output=True, text=True, timeout=120)


def test_cli_dry_run_states_the_number_of_paid_calls_and_makes_none():
    result = _cli("--dry-run", "--repeats", "7")
    assert result.returncode == 0 and "= 7 paid model call(s)" in result.stdout
    three = _cli("--dry-run", "--repeats", "20", "--only", "mixed_spec", "hedged_change", "decisions_and_open_questions")
    assert three.returncode == 0 and "= 60 paid model call(s)" in three.stdout
    assert _cli("--dry-run", "--only", "nope").returncode == 2


def test_cli_skips_without_a_key():
    result = _cli()
    assert result.returncode == 0 and "SKIPPED" in result.stdout
