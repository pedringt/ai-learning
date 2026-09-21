"""#246: the meeting-prep prompt and the backend normalizer state ONE final shape, and the shape checker measures it.

No model calls anywhere in this file. The real-model measurement is `python -m eval.run_meeting_prep_shape`.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

import ask_service
from ask_contract import (
    MEETING_PREP_ITEM_CAPS, MEETING_PREP_MAX_REFINEMENTS, MEETING_PREP_MAX_SECTIONS, MEETING_PREP_SECTION_ORDER,
    MEETING_PREP_SECTION_TITLES, AskSynthesis,
)
from ask_service import _normalize_meeting_prep, _one_call_prompt, meeting_prep_shape_guidance
from eval.meeting_prep_shape import QUERIES, shape_report, summarize

SERVICE = Path(__file__).resolve().parent


def _item(n, record_type="state"):
    return {"text": f"Item {n}", "record_type": record_type, "record_id": f"rec-{n}", "detail": None}


def _section(kind, count, title=None, start=0, record_type="state"):
    return {"kind": kind, "title": title or f"{kind} title", "items": [_item(start + i, record_type) for i in range(count)]}


def _answer(sections, job="meeting_prep", refinements=()):
    return {"job": job, "headline": "Headline", "summary": "Summary", "sections": list(sections),
            "source_ids": [], "uncertainty_ids": [], "suggested_refinements": list(refinements)}


def _normalized(raw):
    return _normalize_meeting_prep(AskSynthesis.model_validate(raw))


def test_the_constants_describe_one_consistent_shape():
    assert set(MEETING_PREP_SECTION_ORDER) == set(MEETING_PREP_ITEM_CAPS)                 # a cap for every kind, none extra
    assert len(set(MEETING_PREP_SECTION_ORDER)) == len(MEETING_PREP_SECTION_ORDER)
    assert set(MEETING_PREP_SECTION_TITLES) <= set(MEETING_PREP_SECTION_ORDER)
    assert 1 <= MEETING_PREP_MAX_SECTIONS <= len(MEETING_PREP_SECTION_ORDER)


@pytest.mark.parametrize("kind", MEETING_PREP_SECTION_ORDER)
def test_the_normalizer_caps_each_kind_at_its_constant(kind):
    cap = MEETING_PREP_ITEM_CAPS[kind]
    # (an `other` section holding Current State items is treated as `established`, tested below, so use non-state items here)
    result = _normalized(_answer([_section(kind, min(cap + 3, 8), record_type="none" if kind == "other" else "state")]))
    assert len(result.sections) == 1 and len(result.sections[0].items) == cap


def test_state_items_in_an_other_section_are_treated_as_established_which_is_why_the_prompt_says_so():
    result = _normalized(_answer([_section("other", 5, record_type="state")]))
    assert [s.kind for s in result.sections] == ["established"] and len(result.sections[0].items) == MEETING_PREP_ITEM_CAPS["established"]
    assert "Put Current State items in an `established` section." in meeting_prep_shape_guidance()


def test_the_normalizer_orders_sections_and_keeps_at_most_the_section_cap():
    raw = _answer([_section(kind, 1, start=i * 10) for i, kind in enumerate(reversed(MEETING_PREP_SECTION_ORDER[:6]))])
    kinds = [s.kind for s in _normalized(raw).sections]
    assert kinds == list(MEETING_PREP_SECTION_ORDER[:MEETING_PREP_MAX_SECTIONS])


def test_the_normalizer_retitles_the_kinds_that_have_a_title_and_keeps_the_models_title_for_the_rest():
    result = _normalized(_answer([_section(k, 1, title="Model title", start=i * 10) for i, k in enumerate(MEETING_PREP_SECTION_ORDER[:6])]))
    # (only the first MAX_SECTIONS survive, so check the ones that did)
    for section in result.sections:
        expected = MEETING_PREP_SECTION_TITLES.get(section.kind, "Model title")
        assert section.title == expected


def test_the_guidance_names_every_kind_title_and_cap_and_is_generated_from_the_constants(monkeypatch):
    text = meeting_prep_shape_guidance()
    for kind in MEETING_PREP_SECTION_ORDER:
        assert f"`{kind}`" in text
        cap = MEETING_PREP_ITEM_CAPS[kind]
        assert f"at most {cap} item{'' if cap == 1 else 's'}" in text
    for title in set(MEETING_PREP_SECTION_TITLES.values()):
        assert f'"{title}"' in text
    assert f"at most {MEETING_PREP_MAX_SECTIONS} sections" in text and f"at most {MEETING_PREP_MAX_REFINEMENTS} suggested refinements" in text
    # Generated, not hard-coded: change the constant and both the prompt text and the normalizer follow.
    monkeypatch.setattr(ask_service, "MEETING_PREP_ITEM_CAPS", {**MEETING_PREP_ITEM_CAPS, "needs_review": 1})
    assert "`needs_review` titled \"Decisions needed\", at most 1 item;" in meeting_prep_shape_guidance()
    assert len(_normalized(_answer([_section("needs_review", 3)])).sections[0].items) == 1


def test_the_guidance_says_it_applies_only_to_meeting_prep_so_other_jobs_keep_their_own_titles():
    # #246: the first wording, given no such scope, coincided with an Ask-quality scenario (a plain current_fact
    # question) passing 3 of 7 tries instead of 6 of 6; the fixed section titles may have leaked into other jobs.
    text = meeting_prep_shape_guidance()
    assert "applies ONLY when the job you choose is `meeting_prep`" in text
    assert "for every other job, ignore it and use your own concise section titles" in text
    assert text.index("ONLY") < text.index("`needs_review`")                                   # the scope comes before the titles


def test_the_one_call_prompt_carries_the_guidance_and_no_longer_the_loose_legacy_limits():
    prompt = _one_call_prompt("Give me a briefing", {"state": [], "reviews": [], "questions": [], "history": [], "evidence": [], "rules": []}, None)
    assert meeting_prep_shape_guidance() in prompt
    assert "at most 4 items per section" not in prompt                                       # the sentence that contradicted the caps


def test_an_answer_written_exactly_as_the_guidance_says_is_left_unchanged_by_the_normalizer():
    kinds = MEETING_PREP_SECTION_ORDER[:MEETING_PREP_MAX_SECTIONS]
    sections = [_section(k, MEETING_PREP_ITEM_CAPS[k], title=MEETING_PREP_SECTION_TITLES.get(k, "Own title"), start=i * 10) for i, k in enumerate(kinds)]
    report = shape_report(_answer(sections))
    assert report["stable"] and not report["visible_shrink"] and report["items_dropped"] == 0 and not report["out_of_order"]
    # ...and any subset of kinds, still in order, is just as stable
    subset = [s for s in sections if s["kind"] in ("needs_review", "established")]
    assert shape_report(_answer(subset))["stable"]


def test_shape_report_measures_the_shrink_that_the_239_fixture_produced():
    overfull = _answer([_section("established", 3, start=0), _section("established", 2, start=10), _section("needs_review", 1, start=20)])
    r = shape_report(overfull)
    assert r["items_before"] == 6 and r["items_after"] == 4 and r["items_dropped"] == 2
    assert r["sections_before"] == 3 and r["sections_after"] == 2 and r["sections_lost"] == 1
    assert r["repeated_kinds"] == 1 and r["out_of_order"] and r["visible_shrink"] and not r["stable"]


def test_shape_report_flags_a_reorder_a_retitle_and_a_duplicate_record_separately():
    reordered = shape_report(_answer([_section("questions", 1, title="Get these answered", start=0), _section("needs_review", 1, title="Decisions needed", start=10)]))
    assert reordered["out_of_order"] and not reordered["visible_shrink"] and not reordered["stable"]

    retitled = shape_report(_answer([_section("needs_review", 1, title="Things to decide", start=0)]))
    assert retitled["retitled"] and not retitled["visible_shrink"] and not retitled["stable"]

    dup = {"kind": "questions", "title": "Get these answered", "items": [_item(1, "question"), _item(1, "question")]}
    r = shape_report(_answer([dup]))
    assert r["items_dropped"] == 1 and r["visible_shrink"]                                   # the same record twice


def test_shape_report_ignores_other_jobs_and_reports_a_schema_invalid_answer():
    other = shape_report(_answer([_section("questions", 2)], job="current_fact"))
    assert other == {"valid": True, "applies": False, "job": "current_fact"}
    bad = shape_report({"job": "meeting_prep"})
    assert bad["valid"] is False and not bad["applies"]


def test_summarize_reports_rates_over_meeting_prep_runs_only():
    good = shape_report(_answer([_section("needs_review", 1, title="Decisions needed")]))
    shrunk = shape_report(_answer([_section("established", 3, start=0), _section("established", 2, start=10)]))
    not_prep = shape_report(_answer([_section("questions", 1)], job="catch_up"))
    invalid = shape_report({"job": "meeting_prep"})
    s = summarize([good, shrunk, not_prep, invalid])
    assert s["runs"] == 4 and s["invalid_rate"] == 0.25 and s["chose_meeting_prep_rate"] == 0.5
    assert s["stable_rate"] == 0.5 and s["visible_shrink_rate"] == 0.5 and s["items_dropped_mean"] == 1.0
    assert summarize([not_prep])["stable_rate"] is None                                      # nothing to say about shape


def test_the_measured_queries_include_the_real_drawer_starter():
    assert QUERIES["starter_briefing"].startswith("Give me the most consequential project briefing for right now.")


def _cli(*args):
    # ANTHROPIC_API_KEY is set to EMPTY (not removed): the script loads state-project-complete/.env but never
    # overrides a variable that is already set, so no key can leak in and no model call can be made.
    env = {**os.environ, "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""}
    return subprocess.run([sys.executable, "-m", "eval.run_meeting_prep_shape", *args], cwd=SERVICE, env=env,
                          capture_output=True, text=True, timeout=120)


def test_cli_dry_run_states_the_number_of_paid_calls_and_makes_none():
    result = _cli("--dry-run", "--repeats", "2", "--prompt", "both")
    assert result.returncode == 0
    # 2 projects x 2 queries x 2 repeats x 2 prompts
    assert "16 paid model call(s)" in result.stdout and "provider_start" not in result.stdout + result.stderr


def test_cli_skips_without_a_key():
    result = _cli("--repeats", "1")
    assert result.returncode == 0 and "SKIPPED" in result.stdout and "provider_start" not in result.stdout + result.stderr


class _RecordingAskProvider:
    """Stands in for LiveAskProvider: records each prompt and returns a fixed raw combined answer. No model."""

    def __init__(self, answer):
        self.answer, self.prompts = answer, []

    def run(self, prompt):
        self.prompts.append(prompt)
        return {"answer": self.answer, "selection": {"job": "meeting_prep"}}


def test_the_runner_sends_the_legacy_guidance_only_to_the_legacy_variant_and_restores_the_real_one():
    from eval.meeting_prep_shape_run import LEGACY_GUIDANCE, run

    overfull = _answer([_section("established", 3, start=0), _section("established", 2, start=10), _section("needs_review", 1, start=20)])
    provider = _RecordingAskProvider(overfull)
    real = ask_service.meeting_prep_shape_guidance
    report = run(provider, prompt_variants=("legacy", "new"), repeats=1, projects=("northstar",), queries={"q": "Give me a briefing"})

    legacy_prompts, new_prompts = provider.prompts[:1], provider.prompts[1:]
    assert len(provider.prompts) == 2
    assert LEGACY_GUIDANCE in legacy_prompts[0] and meeting_prep_shape_guidance() not in legacy_prompts[0]
    assert meeting_prep_shape_guidance() in new_prompts[0] and LEGACY_GUIDANCE not in new_prompts[0]
    assert ask_service.meeting_prep_shape_guidance is real                                     # patch undone afterwards
    for variant in ("legacy", "new"):                                                          # same canned answer, so same shape result
        s = report["variants"][variant]["summary"]
        assert s["runs"] == 1 and s["visible_shrink_rate"] == 1.0 and s["stable_rate"] == 0.0


def test_a_provider_error_is_recorded_as_an_error_not_a_crash():
    from eval.meeting_prep_shape_run import run

    class Down:
        def run(self, prompt):
            raise RuntimeError("provider unavailable")

    report = run(Down(), prompt_variants=("new",), repeats=1, projects=("northstar",), queries={"q": "x"})
    entry = report["variants"]["new"]["runs"][0]
    assert entry["report"]["valid"] is False and "provider unavailable" in entry["report"]["error"]
    assert report["variants"]["new"]["summary"]["invalid_rate"] == 1.0
