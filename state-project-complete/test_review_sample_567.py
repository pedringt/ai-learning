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
    after = [_after(s) for _, s in AFTER_PLAN]
    after += [_after("ask_change_summary", withheld=1), _after("ask_known_outcome_unknown_reason", fallback=True)]
    before = [_before(s) for _, s in BEFORE_PLAN]
    packet, key = build_packet(after, before)
    assert key["_coverage"] == {"planned": 18, "found": 18, "missing_after": [], "missing_before": []}
    assert sum(1 for v in key.values() if v.get("condition") == "after") == len(AFTER_PLAN) + len(AFTER_BY_CHECK) == 12
    assert sum(1 for v in key.values() if v.get("condition") == "before") == 6
    # the packet names no scenario or condition; the key does
    assert "ask_" not in packet and "adv_" not in packet
    assert "Settled and open" not in packet and "#640" not in packet       # failure types are in the key only
    assert f"[Current State] Claim {len('ask_question_answer_no_state_mutation')}." in packet and f"Summary {len('ask_question_answer_no_state_mutation')}." in packet
    assert "Supported / Partly supported / Unsupported / Wrong authority" in packet


def test_missing_answers_are_reported_not_invented(tmp_path):
    after = tmp_path / "after.json"
    before = tmp_path / "before.json"
    after.write_text(json.dumps({"records": [_after("ask_question_answer_no_state_mutation")]}))
    before.write_text(json.dumps([_before("ask_question_answer_no_state_mutation")]))
    main(["--after", str(after), "--before", str(before), "--out", str(tmp_path / "p.md"), "--key", str(tmp_path / "k.json")])
    coverage = json.loads((tmp_path / "k.json").read_text())["_coverage"]
    assert coverage["found"] == 2 and len(coverage["missing_after"]) == 11 and len(coverage["missing_before"]) == 5


def test_saved_answers_finds_graded_and_diagnostic_records_however_nested():
    data = {"shards": [{"records": [_after("a"), {"scenario_id": "b", "outcome": "error"}]}],
            "rows": [{"variant": "clear_wording", "answer": {"answer": {}}}]}
    assert [r.get("scenario_id") or r.get("variant") for r in saved_answers(data)] == ["a", "clear_wording"]


def test_matrix_ask_records_keep_the_displayed_answer_and_seeded_records_for_review():
    from types import SimpleNamespace

    from eval.ask_adversarial_scenarios import SCENARIOS
    from eval.matrix import ask_record

    scenario = next(s for s in SCENARIOS if s.id == "adv_mixed_settled_and_open_in_one_question")
    answer = _after(scenario.id)["answer"]
    result = SimpleNamespace(scenario=scenario, answer=answer, error="", passed=True, grounding_ok=True,
                             required_facts_ok=True, forbidden_claims_ok=True, uncertainty_ok=True, open_item_ok=True,
                             authority_ok=True)
    record = ask_record(result)
    assert record["answer"] == answer and record["question"] == scenario.question
    assert record["displayed_answer"].startswith("What State has on record\n[Current State] Claim")
    assert record["supplied_records"]["current_state"]
    packet, key = build_packet([record], [])
    assert scenario.question in packet and key["S01"]["scenario"] == scenario.id
