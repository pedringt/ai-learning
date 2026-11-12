"""The #567 packet review fixture (Paige, Nov 12) stays well formed: every item names its pair, version, scenario,
exact sentence, rating and finding. No model calls. The fixture is for regression examples and an independent
meaning review; it is not a keyword acceptance test."""
import json
from pathlib import Path

from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
from eval.ask_quality_scenarios import SCENARIOS as ASK

FIXTURE = Path(__file__).parent / "eval" / "calibration" / "567_packet_review.json"


def test_every_item_is_complete_and_names_a_real_scenario_and_finding():
    doc = json.loads(FIXTURE.read_text())
    scenarios = {s.id for s in (*ASK, *ADVERSARIAL)}
    assert set(doc["findings"]) == {"1", "2", "3", "4"}
    for item in doc["items"]:
        assert item["pair"].startswith("P") and item["version"] in ("candidate", "baseline")
        assert item["scenario"] in scenarios and item["sentence"].strip() and item["rating"]
        assert item["finding"] in (1, 2, 3, 4, "instruction-following", None)


def test_instruction_following_is_kept_apart_from_authority_findings():
    items = json.loads(FIXTURE.read_text())["items"]
    assert {i["pair"] for i in items if i["finding"] == "instruction-following"} == {"P11"}


# --- Diagnostic flags (eval only; route to manual review, never pass/fail) ---------------------------------------

from eval.authority_wording import diagnostic_flags  # noqa: E402


def _claims(*texts):
    return {"answer": {"claims": [{"text": t, "basis": "none", "primary_record_id": None} for t in texts], "sections": []}}


def test_paiges_finding_1_and_2_sentences_are_flagged_for_reading():
    review = json.loads(FIXTURE.read_text())["items"]
    for item in review:
        if item["finding"] == 1 and item["rating"] in ("unsupported", "partly supported"):
            flags = diagnostic_flags(_claims(item["sentence"]), {})
            assert {"categorical_denial", "proposal_called_false"} & set(flags) or "listed" in item["sentence"] \
                or "not on the" in item["sentence"], item["sentence"]
        if item["finding"] == 2:
            assert "transition_claim" in diagnostic_flags(_claims(item["sentence"]), {}), item["sentence"]


def test_paiges_calibrated_wording_is_not_flagged():
    review = json.loads(FIXTURE.read_text())["items"]
    for item in review:
        if item["finding"] in (1, 2) and item.get("calibrated"):
            assert diagnostic_flags(_claims(item["calibrated"]), {}) == {}, item["calibrated"]


def test_a_pending_review_not_changing_current_state_is_still_flagged_for_reading_not_failed():
    """Supportable in context, but a person reads it: the flag is diagnostic, not a verdict."""
    flags = diagnostic_flags(_claims("The pending Review has not changed Current State."), {})
    assert flags == {"transition_claim": ["The pending Review has not changed Current State."]}


# --- Independent grading: the grader never sees ratings; comparison happens after ----------------------------------

def test_the_grader_inputs_hold_no_ratings_or_versions():
    from eval.independent_review_567 import ANSWERS

    text = ANSWERS.read_text().lower()
    for word in ("candidate", "baseline", "supported", "rating", "finding", "calibrated"):
        assert f'"{word}"' not in text


def test_comparison_lists_disagreements_after_grading():
    from eval.independent_review_567 import compare, grade_all, items

    seen = []

    def fake_grade(scenario, answer):
        seen.append(json.dumps(answer))
        return {"faithfulness": {"score": 4, "reason": "ok"}, "authority_calibration": {"score": 4, "reason": "ok"}}

    report = compare(grade_all(fake_grade))
    assert report["answers"] == len(items()) == 28
    assert not any("partly supported" in s or "wrong authority" in s for s in seen)
    assert "P02-B" in report["paige_only"] and report["grader_only"] == []
