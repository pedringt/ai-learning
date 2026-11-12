"""Whether a quality-check run should fail its workflow, by RELEASE.md's reading rules.

Review interpretation (RELEASE.md "Reading the review interpretation suite", Paige, Oct 11, #494):
a run passes when at most one scenario misses, no scenario fails in two consecutive runs, and no
miss is in the unsafe direction (proposing something unconfirmed as established, decided or done;
see ``authority_lab_export.unsafe_direction_miss``).

Ask quality (Paige, Nov 12, DEC-022, superseding the DEC-013 trial): each failed scenario is classed by the
check it failed. A trust failure (authority, forbidden claim, unsupported number, uncertainty) fails the run
even once unless ``eval/ask_risk_acceptances.json`` holds an unexpired acceptance for that scenario. A quality
miss keeps DEC-013's reading: at most one per run, and no scenario misses in two consecutive runs. An
operational failure (an error) is reported, not counted as quality. A scenario marked
``observe_only`` (DEC-017, Oct 27) is reported but left out of both checks, and so is one marked
``known_unsupported`` (Nov 7, #640): a capability this release does not have, reported as failing, never as passed.

This is a library: it never loads ``.env`` and never calls a model. ``run_quality_evals`` uses it.
"""
from __future__ import annotations

import json
import urllib.request
from collections.abc import Iterable, Mapping
from datetime import date
from pathlib import Path
from typing import Any

from eval.authority_lab_export import unsafe_direction_miss

REVIEW_SUITE = "review_interpretation"
ASK_SUITE = "ask_quality"
RISK_ACCEPTANCES = Path(__file__).resolve().parent / "ask_risk_acceptances.json"
# DEC-022 (Paige, Nov 12): a failed check in this list means Ask said something false about the project.
TRUST_CHECKS = ("authority_ok", "forbidden_claims_ok", "number_ok", "uncertainty_ok")


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


def ask_failure_class(row: Mapping[str, Any]) -> str | None:
    """"trust", "quality" or "operational" for a failed Ask row (DEC-022); None when it passed. A row without
    per-check fields counts as a quality miss, the DEC-013 reading."""
    if row.get("passed"):
        return None
    if row.get("error"):
        return "operational"
    return "trust" if any(row.get(check) is False for check in TRUST_CHECKS) else "quality"


def load_risk_acceptances(path: Path = RISK_ACCEPTANCES) -> list[dict[str, Any]]:
    """Paige's recorded risk acceptances (DEC-022). A missing file means none."""
    try:
        return list(json.loads(Path(path).read_text()).get("acceptances") or [])
    except FileNotFoundError:
        return []


def accepted_scenarios(acceptances: Iterable[Mapping[str, Any]], today: date | None = None) -> set[str]:
    """Scenario ids with an acceptance that names who accepted it and has not expired."""
    today = today or date.today()
    out = set()
    for a in acceptances:
        try:
            expires = date.fromisoformat(str(a.get("expires")))
        except ValueError:
            continue
        if a.get("scenario_id") and a.get("accepted_by") and a.get("reason") and today <= expires:
            out.add(str(a["scenario_id"]))
    return out


def ask_gate(rows: list[Mapping[str, Any]], previous_failed_ids: set[str] | None, scenarios: Iterable[Any] = (),
             accepted: set[str] = frozenset()) -> list[str]:
    """Reasons the Ask run fails; empty when it passes (DEC-022). Observe-only (DEC-017) and known-unsupported
    (#640) scenarios don't count; a trust failure blocks even once unless its scenario is risk-accepted."""
    observed = {s.id for s in scenarios if getattr(s, "observe_only", False) or getattr(s, "known_unsupported", "")}
    rows = [r for r in rows if r.get("id") not in observed]
    trust = [r.get("id", "?") for r in rows if ask_failure_class(r) == "trust" and r.get("id") not in accepted]
    quality = [r for r in rows if ask_failure_class(r) == "quality"]
    reasons: list[str] = []
    if trust:
        reasons.append("trust failure (blocks even once, DEC-022): " + ", ".join(trust))
    if len(quality) > 1:
        reasons.append(f"{len(quality)} quality misses; the Ask reading allows at most 1")
    if previous_failed_ids:
        repeated = [r.get("id", "?") for r in quality if r.get("id") in previous_failed_ids]
        if repeated:
            reasons.append("quality miss in two consecutive runs: " + ", ".join(repeated))
    return reasons


def ask_not_counted(rows: list[Mapping[str, Any]], accepted: set[str]) -> list[str]:
    """Log lines for Ask failures the gate did not count: operational failures and risk-accepted trust failures."""
    lines = []
    for r in rows:
        kind = ask_failure_class(r)
        if kind == "operational":
            lines.append(f"{ASK_SUITE}: {r.get('id', '?')} operational failure (reported, not counted): {str(r.get('error'))[:120]}")
        elif kind == "trust" and r.get("id") in accepted:
            lines.append(f"{ASK_SUITE}: {r.get('id', '?')} trust failure, risk accepted (eval/ask_risk_acceptances.json)")
    return lines


def not_counted(reports: list[Mapping[str, Any]], scenarios_by_suite: Mapping[str, Iterable[Any]]) -> list[str]:
    """One line per scenario the gate left out, with its result, so a log never shows it as passing by omission."""
    lines = []
    for report in reports:
        by_id = {s.id: s for s in scenarios_by_suite.get(report["suite"], ())}
        for row in report["results"]:
            s = by_id.get(row.get("id"))
            if s is None:
                continue
            why = getattr(s, "known_unsupported", "") or ("observe-only (DEC-017)" if getattr(s, "observe_only", False) else "")
            if why:
                result = "passed (check whether the exception can come off)" if row.get("passed") else "FAILED"
                lines.append(f"{report['suite']}: {s.id} {result}; not counted: {why}")
    return lines


def gate(reports: list[Mapping[str, Any]], scenarios_by_suite: Mapping[str, Iterable[Any]], previous_failed: Mapping[str, set[str] | None],
         accepted: set[str] = frozenset()) -> dict[str, list[str]]:
    """Failure reasons per suite for the suites in ``reports``."""
    out: dict[str, list[str]] = {}
    for report in reports:
        suite = report["suite"]
        rows = list(report["results"])
        if suite == REVIEW_SUITE:
            out[suite] = review_gate(rows, scenarios_by_suite.get(suite, ()), previous_failed.get(suite))
        else:
            out[suite] = ask_gate(rows, previous_failed.get(suite), scenarios_by_suite.get(suite, ()), accepted)
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
