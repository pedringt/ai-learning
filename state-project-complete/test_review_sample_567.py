"""#567: the human-review packet builder picks the planned failure types, hides scenario and run behind codes,
and shows each answer as displayed. No model calls."""
from __future__ import annotations

import json

from eval.review_sample_567 import AFTER_BY_CHECK, AFTER_PLAN, BEFORE_PLAN, build_packet, main, saved_answers


def _after(scenario, *, withheld=0, fallback=False, repeat=0):
    item = {"text": "Card.", "record_type": "state", "record_id": "k", "detail": None,
            "wording": "record_fallback" if fallback else "model"}
    return {"scenario_id": scenario, "repeat": repeat, "answer": {"answer": {
        "job": "current_fact", "headline": "What State has on record",
        "claims": [{"text": f"Claim {len(scenario)}.", "label": "Current State", "basis": "current_state"}],
        "withheld_claims": withheld, "withheld_items": 0,
        "sections": [{"kind": "other", "title": "Context", "items": [item]}], "suggested_refinements": []}}}


def _before(scenario):
    return {"scenario_id": scenario, "answer": {"answer": {"headline": "Old", "summary": f"Summary {len(scenario)}.", "sections": []}}}


def test_packet_covers_every_planned_failure_type_and_keeps_the_key_separate():
    after = [_after(s) for _, s in AFTER_PLAN if s != "resolved_question_only"]
    after += [{"variant": "resolved_question_only", "question": "Has Legal answered?", "answer": _after("x")["answer"]},
              _after("ask_change_summary", withheld=1), _after("ask_known_outcome_unknown_reason", fallback=True)]
    before = [_before(s) for _, s in BEFORE_PLAN]
    packet, key = build_packet(after, before)
    assert key["_coverage"] == {"planned": 18, "found": 18, "missing_after": [], "missing_before": []}
    assert sum(1 for v in key.values() if v.get("condition") == "after") == len(AFTER_PLAN) + len(AFTER_BY_CHECK) == 12
    assert sum(1 for v in key.values() if v.get("condition") == "before") == 6
    # the packet names no scenario or condition; the key does
    assert "ask_" not in packet and "resolved_question_only" not in packet
    assert f"[Current State] Claim {len('ask_false_premise')}." in packet and f"Summary {len('ask_false_premise')}." in packet
    assert "Supported / Partly supported / Unsupported / Wrong authority" in packet


def test_missing_answers_are_reported_not_invented(tmp_path):
    after = tmp_path / "after.json"
    before = tmp_path / "before.json"
    after.write_text(json.dumps({"records": [_after("ask_false_premise")]}))
    before.write_text(json.dumps([_before("ask_false_premise")]))
    main(["--after", str(after), "--before", str(before), "--out", str(tmp_path / "p.md"), "--key", str(tmp_path / "k.json")])
    coverage = json.loads((tmp_path / "k.json").read_text())["_coverage"]
    assert coverage["found"] == 2 and len(coverage["missing_after"]) == 11 and len(coverage["missing_before"]) == 5


def test_saved_answers_finds_graded_and_diagnostic_records_however_nested():
    data = {"shards": [{"records": [_after("a"), {"scenario_id": "b", "outcome": "error"}]}],
            "rows": [{"variant": "clear_wording", "answer": {"answer": {}}}]}
    assert [r.get("scenario_id") or r.get("variant") for r in saved_answers(data)] == ["a", "clear_wording"]
