"""Whether a quality-check run should fail its workflow, by RELEASE.md's reading rules.

Review interpretation (RELEASE.md "Reading the review interpretation suite", Paige, Oct 11, #494):
a run passes when at most one scenario misses, no scenario fails in two consecutive runs, and no
miss is in the unsafe direction (proposing something unconfirmed as established, decided or done;
see ``authority_lab_export.unsafe_direction_miss``).

Ask quality (Paige, Oct 19, DEC-013, a trial): the same shape without the unsafe-direction check, so a run
passes when at most one scenario misses and no scenario fails in two consecutive runs.

This is a library: it never loads ``.env`` and never calls a model. ``run_quality_evals`` uses it.
"""
from __future__ import annotations

import json
import urllib.request
from collections.abc import Iterable, Mapping
from typing import Any

from eval.authority_lab_export import unsafe_direction_miss

REVIEW_SUITE = "review_interpretation"
ASK_SUITE = "ask_quality"


def review_gate(rows: list[Mapping[str, Any]], scenarios: Iterable[Any], previous_failed_ids: set[str] | None) -> list[str]:
    """Reasons the review run fails; empty when it passes. ``previous_failed_ids`` is None when the
    previous recorded run is unknown, which skips only the consecutive-failure check."""
    by_id = {s.id: s for s in scenarios}
    failed = [r for r in rows if not r.get("passed")]
    reasons: list[str] = []
    if len(failed) > 1:
        reasons.append(f"{len(rows) - len(failed)} of {len(rows)} passed; RELEASE.md needs at least {len(rows) - 1}")
    unsafe = [r["id"] for r in failed if r.get("id") in by_id and unsafe_direction_miss(r, by_id[r["id"]])]
    if unsafe:
        reasons.append("unsafe-direction miss (blocks even once): " + ", ".join(unsafe))
    if previous_failed_ids:
        repeated = [r["id"] for r in failed if r.get("id") in previous_failed_ids]
        if repeated:
            reasons.append("failed in two consecutive runs: " + ", ".join(repeated))
    return reasons


def ask_gate(rows: list[Mapping[str, Any]], previous_failed_ids: set[str] | None) -> list[str]:
    """Reasons the Ask run fails; empty when it passes (DEC-013 trial)."""
    failed = [r for r in rows if not r.get("passed")]
    reasons: list[str] = []
    if len(failed) > 1:
        reasons.append(f"{len(rows) - len(failed)} of {len(rows)} passed; the Ask reading needs at least {len(rows) - 1}")
    if previous_failed_ids:
        repeated = [r.get("id", "?") for r in failed if r.get("id") in previous_failed_ids]
        if repeated:
            reasons.append("failed in two consecutive runs: " + ", ".join(repeated))
    return reasons


def gate(reports: list[Mapping[str, Any]], scenarios_by_suite: Mapping[str, Iterable[Any]], previous_failed: Mapping[str, set[str] | None]) -> dict[str, list[str]]:
    """Failure reasons per suite for the suites in ``reports``."""
    out: dict[str, list[str]] = {}
    for report in reports:
        suite = report["suite"]
        rows = list(report["results"])
        if suite == REVIEW_SUITE:
            out[suite] = review_gate(rows, scenarios_by_suite.get(suite, ()), previous_failed.get(suite))
        else:
            out[suite] = ask_gate(rows, previous_failed.get(suite))
    return out


def previous_failed_ids(analytics: Mapping[str, Any], suite: str) -> set[str] | None:
    """Failed scenario ids of the most recent recorded run of ``suite`` in a quality-analytics
    response, or None when there is no recorded run."""
    recent = (analytics.get("controlled_evals") or {}).get("recent") or []
    runs = [r for r in recent if r.get("suite") == suite]
    if not runs:
        return None
    latest = max(runs, key=lambda r: str(r.get("created_at") or ""))
    return {str(d.get("scenario_id")) for d in latest.get("failure_details") or [] if d.get("scenario_id")}


def fetch_analytics(record_url: str, timeout: float = 30) -> Mapping[str, Any] | None:
    """The State API's quality analytics, or None when it cannot be read."""
    try:
        request = urllib.request.Request(record_url.rstrip("/") + "/api/admin/quality-analytics", headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None
