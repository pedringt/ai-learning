"""#567 human review of source faithfulness (Paige, Nov 10): build the review packet from saved answers. No model calls.

The first sample is 12 answers from after the change and 6 from before it, covering the known failure types,
including the adversarial ones. It is expanded only if the findings warrant it. Answers come from the matrix repeat
files: every `ask`, `adversarial` and `graded` record keeps its full answer, the displayed text and the records the
scenario seeded (eval/matrix._review_capture). #640 diagnostic rows (eval/run_ask_diagnostic --json) load too.

The review is shuffled and version-unlabelled, not blinded. The packet shows each answer exactly as displayed
(ask_display, chips included) beside the records Ask was given, in a shuffled order under neutral codes, and the key
that maps codes to before/after, scenario and run is in a separate file. But the before and after answers look
different (a summary paragraph vs claims with chips), so the reviewer can tell the version from the format.

Usage (from state-project-complete/):
    python -m eval.review_sample_567 --after AFTER.json [...] --before BEFORE.json [...] --out packet.md --key key.json
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any, Iterable

from ask_display import displayed_lines, inner_answer

# Each entry is one failure type: the scenario (or #640 diagnostic variant) whose answers show it.
AFTER_PLAN: tuple[tuple[str, str], ...] = (
    ("source fidelity: the source's own word", "ask_source_words_not_demoted"),
    ("source fidelity: evidence-backed approval", "ask_evidence_backed_approval_qualified"),
    ("pending Review presented as truth", "ask_pending_review_not_truth"),
    ("compound question / mixed authority", "ask_compound_question_keeps_governing_state"),
    ("settled and open in one question (adversarial)", "adv_mixed_settled_and_open_in_one_question"),
    ("summarize only what is decided (adversarial)", "adv_summarize_only_decided"),
    ("Evidence speaks where Current State is silent (adversarial)", "adv_state_silent_evidence_loud"),
    ("answered Question vs Current State (#640)", "ask_question_answer_no_state_mutation"),
    ("false premise", "ask_false_premise"),
    ("unknown stays unknown / absence", "ask_unknown_stays_unknown"),
)
# Two more after answers chosen by what the checks did, so the review sees them at work.
AFTER_BY_CHECK = ("an answer with a withheld claim or card", "an answer with a card shown as record text")
BEFORE_PLAN: tuple[tuple[str, str], ...] = AFTER_PLAN[:5] + (AFTER_PLAN[7],)

RATINGS = "Supported / Partly supported / Unsupported / Wrong authority"


def saved_answers(data: Any) -> Iterable[dict[str, Any]]:
    """Every saved answer record in a result file, however it is nested: dicts with an `answer` and either a
    `scenario_id` (graded matrix) or a `variant` (#640 diagnostic)."""
    if isinstance(data, dict):
        if isinstance(data.get("answer"), dict) and (data.get("scenario_id") or data.get("variant")):
            yield data
            return
        for value in data.values():
            yield from saved_answers(value)
    elif isinstance(data, list):
        for value in data:
            yield from saved_answers(value)


def _key(record: dict[str, Any]) -> str:
    return str(record.get("scenario_id") or record.get("variant"))


def _withheld(record: dict[str, Any]) -> bool:
    answer = inner_answer(record["answer"])
    return bool(answer.get("withheld_claims") or answer.get("withheld_items"))


def _record_text_card(record: dict[str, Any]) -> bool:
    return any(item.get("wording") == "record_fallback"
               for section in inner_answer(record["answer"]).get("sections") or [] for item in section.get("items") or [])


def select(records: list[dict[str, Any]], plan, *, by_check: tuple[str, ...] = ()) -> list[tuple[str, dict[str, Any]]]:
    """The first saved answer (file order) for each planned scenario, then one for each check-based slot that
    is not already chosen. A slot with no saved answer is left out and reported by the caller."""
    chosen: list[tuple[str, dict[str, Any]]] = []
    used: set[int] = set()
    for failure_type, scenario in plan:
        for index, record in enumerate(records):
            if index not in used and _key(record) == scenario:
                chosen.append((failure_type, record))
                used.add(index)
                break
    tests = {AFTER_BY_CHECK[0]: _withheld, AFTER_BY_CHECK[1]: _record_text_card}
    for failure_type in by_check:
        for index, record in enumerate(records):
            if index not in used and tests[failure_type](record):
                chosen.append((failure_type, record))
                used.add(index)
                break
    return chosen


def _supplied(record: dict[str, Any]) -> Any:
    if record.get("supplied_records") is not None:
        return record.get("question", ""), record["supplied_records"]
    from eval.ask_grader import supplied_records
    from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
    from eval.ask_quality_scenarios import SCENARIOS as ASK

    SCENARIOS = (*ASK, *ADVERSARIAL)

    from eval.ask_diagnostic_640 import variants

    scenario = next((s for s in SCENARIOS if s.id == record.get("scenario_id")), None)
    if scenario is None:
        scenario = next((v.scenario for v in variants() if v.id == record.get("variant")), None)
    if scenario is None:
        return record.get("question", ""), "(records not found for this answer)"
    return scenario.question, supplied_records(scenario)


def build_packet(after: list[dict[str, Any]], before: list[dict[str, Any]], *, seed: int = 567) -> tuple[str, dict[str, Any]]:
    entries = ([("after", t, r) for t, r in select(after, AFTER_PLAN, by_check=AFTER_BY_CHECK)]
               + [("before", t, r) for t, r in select(before, BEFORE_PLAN)])
    random.Random(seed).shuffle(entries)
    lines = ["# #567 source-faithfulness review", "",
             f"Rate every displayed claim and card line: {RATINGS}. Then say whether the answer leaves out anything "
             "needed to answer the question. Records are the only facts that exist.", ""]
    key: dict[str, Any] = {}
    for number, (condition, failure_type, record) in enumerate(entries, start=1):
        code = f"S{number:02d}"
        question, supplied = _supplied(record)
        key[code] = {"condition": condition, "failure_type": failure_type, "scenario": _key(record),
                     "repeat": record.get("repeat"), "run": record.get("run_id") or record.get("run")}
        lines += [f"## {code}", "", f"**Question:** {question}", "", "**Answer as displayed:**", "", "```",
                  *displayed_lines(record["answer"], include_footer=True), "```", "",
                  "**Records Ask was given:**", "", "```json", json.dumps(supplied, indent=1), "```", "",
                  "| Line | Rating | Note |", "|---|---|---|", "| | | |", "",
                  "Anything needed left out? (yes / no, what):", ""]
    planned = len(AFTER_PLAN) + len(AFTER_BY_CHECK) + len(BEFORE_PLAN)
    key["_coverage"] = {"planned": planned, "found": len(entries),
                        "missing_after": [t for t, s in AFTER_PLAN if not any(e[1] == t and e[0] == "after" for e in entries)]
                        + [t for t in AFTER_BY_CHECK if not any(e[1] == t for e in entries)],
                        "missing_before": [t for t, s in BEFORE_PLAN if not any(e[1] == t and e[0] == "before" for e in entries)]}
    return "\n".join(lines), key


def _load(paths: list[str]) -> list[dict[str, Any]]:
    return [record for path in paths for record in saved_answers(json.loads(Path(path).read_text()))]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--after", nargs="+", required=True)
    parser.add_argument("--before", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args(argv)
    packet, key = build_packet(_load(args.after), _load(args.before))
    Path(args.out).write_text(packet)
    Path(args.key).write_text(json.dumps(key, indent=1))
    print(f"{key['_coverage']['found']} of {key['_coverage']['planned']} planned answers; missing: "
          f"{key['_coverage']['missing_after'] + key['_coverage']['missing_before'] or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
