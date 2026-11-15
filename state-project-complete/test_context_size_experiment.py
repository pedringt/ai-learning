"""DEC-023 context-size experiment (#653): the plan and the retrieval conditions, with no model calls."""
from __future__ import annotations

from eval import context_size_experiment as cse
from eval import retrieval_benchmark as rb
from test_ask_r9 import FakeAskProvider


def test_every_case_runs_under_every_condition():
    items = cse.scenarios()
    assert len(items) == len(rb.CASES) * len(cse.CONDITIONS)
    assert len({s.id for s in items}) == len(items)


def test_conditions_change_only_how_much_the_model_receives():
    case = next(c for c in rb.CASES if c.id == "w1")
    size = {name: cse.prompt_chars(cse.Scenario(f"w1@{name}", case, name)) for name in cse.CONDITIONS}
    assert size["today"] < size["x1_5"] < size["x2"] < size["whole"]
    assert abs(size["x1"] - size["today"]) < 0.05 * size["today"]     # no windows at today's limits: about the same size


def test_a_call_is_recorded_without_crashing_the_run():
    record = cse.run_one(cse.scenarios()[0], FakeAskProvider())
    assert record["outcome"] in {"pass", "fail", "error"}
    assert record["prompt_chars"] > 0 and record["condition"] == "today"
