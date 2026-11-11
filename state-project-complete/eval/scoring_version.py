"""A scoring version for each quality-eval suite (#639).

Two runs scored under different scenarios or different scoring code measure different things, so their pass rates
are not directly comparable. The version is a fingerprint of the suite's scenario set (every field of every scenario)
and of the harness that seeds and scores it, with comments and docstrings removed so a comment edit is not a new
version. It is computed, not maintained by hand, so it cannot drift from the code that produced a run.

Runs recorded before Nov 7 carry no version. Readers label them "legacy / version unknown"; none is assigned after
the fact.
"""
from __future__ import annotations

import ast
import dataclasses
import inspect
import json

from eval import quality_harness
from eval.authority_lab_export import _sha, _strip_docstrings

_PREFIX = {"review_interpretation": "review", "ask_quality": "ask"}


def _scenarios(suite: str) -> tuple:
    if suite == "review_interpretation":
        from eval.review_interpretation_scenarios import SCENARIOS
    elif suite == "ask_quality":
        from eval.ask_quality_scenarios import SCENARIOS
    else:
        raise ValueError(f"unknown suite {suite!r}")
    return SCENARIOS


def harness_source() -> str:
    # #567 (Nov 10): the Ask scorer reads the answer through ask_display, so its source is part of the version too.
    import ask_display

    return "\n".join(ast.unparse(_strip_docstrings(ast.parse(inspect.getsource(module))))
                     for module in (quality_harness, ask_display))


def scoring_version(suite: str, scenarios: tuple | None = None) -> str:
    data = [dataclasses.asdict(s) for s in (scenarios if scenarios is not None else _scenarios(suite))]
    return f"{_PREFIX[suite]}-{len(data)}-" + _sha(json.dumps(data, sort_keys=True, default=list) + "\n\x1e\n" + harness_source())
