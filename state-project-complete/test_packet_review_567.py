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
