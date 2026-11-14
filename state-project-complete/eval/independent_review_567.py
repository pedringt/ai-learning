"""Independent meaning review of the #567 comparison packet (Paige, Nov 12).

The grader (eval/ask_grader.py, unchanged) sees only each answer's question, records and displayed answer:
eval/calibration/567_packet_answers.json holds no ratings and no versions. Paige's review
(567_packet_review.json) and the version key (567_packet_key.json) are read only by `compare`, after grading, to
list where the two reads disagree. Paige's review is evidence to examine, not ground truth, and the grader is not
calibrated (observed only, DEC-008), so a disagreement is something to read, not a verdict either way.

A library module: the run script (eval/run_independent_review_567.py) loads .env; tests import only this (#224).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

CALIBRATION = Path(__file__).parent / "calibration"
ANSWERS = CALIBRATION / "567_packet_answers.json"
KEY = CALIBRATION / "567_packet_key.json"
REVIEW = CALIBRATION / "567_packet_review.json"

# Paige's ratings, worst first. "Flagged" = a meaning or authority problem in that answer.
_SEVERITY = {"wrong authority": 3, "unsupported": 3, "misleading structure": 2, "partly supported": 2,
             "wrong authority in headline": 3}


def items(path: Path = ANSWERS) -> list[dict[str, Any]]:
    return json.loads(Path(path).read_text())["items"]


def scenario_for(scenario_id: str):
    from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
    from eval.ask_quality_scenarios import SCENARIOS as ASK

    return next(s for s in (*ASK, *ADVERSARIAL) if s.id == scenario_id)


def grade_all(grade: Callable[[Any, Any], dict[str, dict[str, Any]]], path: Path = ANSWERS) -> list[dict[str, Any]]:
    """`grade(scenario, answer)` is eval.ask_grader.grade_answer in a paid run, or a fake in tests."""
    return [{"item_id": item["item_id"], "scenario_id": item["scenario_id"],
             "grade": grade(scenario_for(item["scenario_id"]), item["answer"])} for item in items(path)]


def paige_verdicts() -> dict[str, dict[str, Any]]:
    """Paige's worst rating per answer (item id), from her review; answers she didn't flag were rated Supported."""
    key = json.loads(KEY.read_text())
    review = json.loads(REVIEW.read_text())["items"]
    out: dict[str, dict[str, Any]] = {}
    for item_id, meta in key.items():
        pair = item_id.split("-")[0]
        flagged = [r for r in review if r["pair"] == pair and r["version"] == meta["version"]
                   and _SEVERITY.get(r["rating"], 0) > 0]
        worst = max((_SEVERITY[r["rating"]] for r in flagged), default=0)
        out[item_id] = {"version": meta["version"], "flagged": worst > 0, "severity": worst,
                        "findings": sorted({str(r["finding"]) for r in flagged})}
    return out


def compare(graded: list[dict[str, Any]]) -> dict[str, Any]:
    """Where the grader and Paige agree that an answer has a meaning or authority problem, and where they don't.
    The grader flags an answer when faithfulness or authority_calibration is 2 or lower."""
    paige = paige_verdicts()
    rows = []
    for g in graded:
        scores = {d: (g["grade"].get(d) or {}).get("score") for d in ("faithfulness", "authority_calibration")}
        grader_flag = any(s is not None and s <= 2 for s in scores.values())
        p = paige[g["item_id"]]
        rows.append({"item_id": g["item_id"], "version": p["version"], "paige_flagged": p["flagged"],
                     "paige_findings": p["findings"], "grader_flagged": grader_flag, "grader_scores": scores,
                     "grader_reasons": {d: (g["grade"].get(d) or {}).get("reason") for d in scores},
                     "agree": grader_flag == p["flagged"]})
    return {
        "answers": len(rows),
        "agree": sum(r["agree"] for r in rows),
        "paige_only": [r["item_id"] for r in rows if r["paige_flagged"] and not r["grader_flagged"]],
        "grader_only": [r["item_id"] for r in rows if r["grader_flagged"] and not r["paige_flagged"]],
        "rows": rows,
    }
