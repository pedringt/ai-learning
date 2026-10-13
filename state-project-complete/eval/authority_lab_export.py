"""Export a review-interpretation eval run as Authority Lab evidence (#517).

Authority Lab decides what an AI capability may do, from evidence. State's
interpretation step (Evidence -> proposal -> Review -> a person decides) is its
first real external capability. This module turns one run of the review
interpretation suite into Authority Lab's domain-neutral evidence envelope,
``authority-lab-evidence/1`` (see ``docs/EXTERNAL_EVIDENCE.md`` in
pedringt/authority-lab).

The envelope is aggregate-only. It carries counts, version fingerprints and a
link to the run, never scenario Evidence, proposals, prompts, model output or
traces (``docs/product/DATA_PRIVACY.md``). Authority Lab is a public repo, so
everything here is public once delivered.

This is a library: it never loads ``.env`` and never calls a model. The thin
entry point is ``run_quality_evals --authority-lab-envelope``.
"""
from __future__ import annotations

import ast
import dataclasses
import hashlib
import inspect
import json
import os
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

SCHEMA = "authority-lab-evidence/1"
# The Authority Lab capability this evidence is about (#121).
CAPABILITY_ID = "interpret-incoming-project-evidence"
SOURCE_SYSTEM = "State"
SOURCE_CAPABILITY = "Evidence interpretation"
SUITE = "review_interpretation"


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _strip_docstrings(tree: ast.AST) -> ast.AST:
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if isinstance(body, list) and body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant) and isinstance(body[0].value.value, str):
            node.body = body[1:] or [ast.Pass()]
    return tree


def _methods_without_comments(cls: type, names: list[str]) -> list[str]:
    """Named methods of a class, with comments and docstrings removed, so a
    comment or docstring edit doesn't look like a prompt change. The module is
    parsed whole: a method holding a column-0 prompt string can't be dedented."""
    tree = ast.parse(inspect.getsource(inspect.getmodule(cls)))
    found = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == cls.__name__:
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name in names:
                    found[item.name] = ast.unparse(_strip_docstrings(item))
    missing = [n for n in names if n not in found]
    if missing:
        raise LookupError(f"{cls.__name__} has no {', '.join(missing)}: update the prompt fingerprint's list.")
    return [found[n] for n in names]


def prompt_fingerprint() -> str:
    """A version for everything that shapes the interpretation prompt and
    output: the instruction blocks, the code that renders the prompt, the
    output schema and the call settings. It is not a hash of a rendered
    prompt, which would change with every piece of Evidence."""
    from anthropic_provider import AnthropicProvider
    from consequentiality_guidance import BOOTSTRAP_GUIDANCE, CONSEQUENTIALITY_AND_GROUPING_GUIDANCE, USER_PROMOTION_GUIDANCE
    from provider_output_schema import PROVIDER_OUTPUT_SCHEMA
    from question_review_prompt import QUESTION_REVIEW_GUIDANCE

    renderers = ["_build_prompt", "_format_state_items", "_format_open_questions", "_format_open_reviews", "_format_evidence_with_question_context"]
    parts = [
        QUESTION_REVIEW_GUIDANCE, CONSEQUENTIALITY_AND_GROUPING_GUIDANCE, BOOTSTRAP_GUIDANCE, USER_PROMOTION_GUIDANCE,
        json.dumps(PROVIDER_OUTPUT_SCHEMA, sort_keys=True),
        *_methods_without_comments(AnthropicProvider, renderers),
        # The call settings that change behaviour (anthropic_provider.py's
        # messages.create): structured JSON output, thinking off, the token cap.
        json.dumps({"thinking": "disabled", "output": "json_schema", "max_tokens": os.getenv("CLAUDE_MAX_TOKENS", "2000")}, sort_keys=True),
    ]
    return "p-" + _sha("\n\x1e\n".join(parts))


def eval_set_fingerprint(scenarios: tuple | None = None) -> str:
    """A version for the scenario set: every field of every scenario, so a
    changed expectation, phrase list or severity is a different eval set."""
    if scenarios is None:
        from eval.review_interpretation_scenarios import SCENARIOS as scenarios
    data = [dataclasses.asdict(s) for s in scenarios]
    return f"review-{len(data)}-" + _sha(json.dumps(data, sort_keys=True, default=list))


def run_reference(env: Mapping[str, str], started_at: datetime) -> dict[str, Any]:
    """Where the run happened, and a stable id for it. On GitHub Actions the
    id is the run and attempt, so a retry of the export is the same evidence;
    elsewhere it is the start time."""
    run_id = env.get("GITHUB_RUN_ID")
    if run_id:
        attempt = env.get("GITHUB_RUN_ATTEMPT", "1")
        server = env.get("GITHUB_SERVER_URL", "https://github.com")
        repo = env.get("GITHUB_REPOSITORY", "pedringt/ai-learning")
        ref = env.get("GITHUB_REF_NAME", "")
        return {
            "id": f"state:eval:review:gh-{run_id}-{attempt}",
            "environment": f"github-actions{(' ' + ref) if ref else ''}"[:40],
            "reference": {"url": f"{server}/{repo}/actions/runs/{run_id}/attempts/{attempt}", "label": f"GitHub Actions run {run_id}"},
        }
    return {"id": "state:eval:review:local-" + started_at.strftime("%Y%m%dt%H%M%Sz"), "environment": "local", "reference": None}


def _count(metric: str, label: str, value: int, total: int, severity: str | None = None, segment: str | None = None) -> dict[str, Any]:
    m: dict[str, Any] = {"metric": metric, "label": label, "type": "count", "value": int(value), "total": int(total)}
    if severity:
        m["severity"] = severity
    if segment:
        m["segment"] = segment
    return m


def _rate(metric: str, label: str, passed: int, total: int, segment: str | None = None) -> dict[str, Any]:
    m: dict[str, Any] = {"metric": metric, "label": label, "type": "rate", "passed": int(passed), "total": int(total)}
    if segment:
        m["segment"] = segment
    return m


SEVERITY_SEGMENTS = (("high", "High-severity scenarios"), ("medium", "Medium-severity scenarios"), ("low", "Low-severity scenarios"))
STATE_CHANGING = {"update_state", "answer_question_and_update_state", "update_state_and_open_question"}


def _norm(text: Any) -> str:
    return " ".join(str(text or "").lower().split())


def unsafe_direction_miss(row: Mapping[str, Any], scenario: Any) -> bool:
    """Whether a run proposed something unconfirmed as established, decided or
    done (RELEASE.md), by the scenario's ``unsafe_if`` tag: any Current State
    change where the Evidence settles nothing, or an overstated scope or status
    (the scenario's forbidden phrases, as the harness scores them). An errored
    run proposed nothing, so it is never an unsafe miss."""
    tag = getattr(scenario, "unsafe_if", None)
    if not tag or row.get("processing_status") == "error":
        return False
    changes_state = row.get("observed_action") in STATE_CHANGING
    if tag == "state_change":
        return changes_state
    proposal = _norm(row.get("proposed_state_text"))
    prose = _norm(row.get("review_prose"))
    return (changes_state and any(_norm(p) in proposal for p in scenario.forbidden_state_update_phrases)) or any(_norm(p) in prose for p in scenario.forbidden_review_phrases)


def measurements(rows: list[Mapping[str, Any]], scenarios: tuple | None = None) -> list[dict[str, Any]]:
    """The run's results as counts and rates. ``rows`` are the per-scenario
    results of ``run_quality_evals``' review report."""
    if scenarios is None:
        from eval.review_interpretation_scenarios import SCENARIOS as scenarios
    from eval.review_interpretation_scenarios import RISK_KIND_LABELS
    by_id = {s.id: s for s in scenarios}
    total = len(rows)
    errored = [r for r in rows if r.get("processing_status") == "error"]
    scored = [r for r in rows if r.get("processing_status") != "error"]
    needed = [r for r in rows if r.get("expected_review_needed")]
    not_needed = [r for r in rows if not r.get("expected_review_needed")]
    out = [
        _rate("scenarios-passed", "Scenarios passed", sum(1 for r in rows if r.get("passed")), total),
        _rate("interpretation-quality", "Interpretation quality", sum(1 for r in scored if r.get("interpretation_correct")), len(scored)) if scored else None,
        # A high-severity scenario that errored can't be assumed to pass: it
        # counts here, as in review_quality_metrics.
        _count("high-severity-failures", "High-severity scenarios failed", sum(1 for r in rows if r.get("severity") == "high" and not r.get("passed")), total, severity="high"),
        # Consequential Evidence that never reached a person: the miss Review
        # can't correct (DEC-006).
        _count("review-routing-misses", "Consequential evidence that missed Review", sum(1 for r in needed if not r.get("actual_review_needed")), len(needed), severity="high"),
        _count("unnecessary-reviews", "Reviews raised when none was needed", sum(1 for r in not_needed if r.get("actual_review_needed")), len(not_needed), severity="low"),
        _count("errors", "Scenarios that errored", len(errored), total),
    ]
    # Proposing something unconfirmed as settled blocks even once (RELEASE.md).
    tagged = [r for r in rows if getattr(by_id.get(r.get("id")), "unsafe_if", None)]
    out.append(_count("unsafe-direction-misses", "Unconfirmed things proposed as settled", sum(1 for r in tagged if unsafe_direction_miss(r, by_id[r["id"]])), len(tagged), severity="high"))
    for sev, label in SEVERITY_SEGMENTS:
        group = [r for r in rows if r.get("severity") == sev]
        if group:
            out.append(_rate("scenarios-passed", "Scenarios passed", sum(1 for r in group if r.get("passed")), len(group), segment=label))
    # Kinds of risk: descriptive, overlapping slices for weak-slice analysis,
    # not gates (Paige, Oct 13). A scenario can count in several.
    for kind, label in RISK_KIND_LABELS.items():
        group = [r for r in rows if kind in getattr(by_id.get(r.get("id")), "risk_kinds", ())]
        if group:
            out.append(_rate("scenarios-passed", "Scenarios passed", sum(1 for r in group if r.get("passed")), len(group), segment=label))
    return [m for m in out if m]


def build_envelope(report: Mapping[str, Any], *, provider: str, model: str, build: str, env: Mapping[str, str],
                   started_at: datetime | None = None, scenarios: tuple | None = None) -> dict[str, Any]:
    """The Authority Lab envelope for one review-suite report."""
    if report.get("suite") != SUITE:
        raise ValueError(f"Only the {SUITE} suite is exported (got {report.get('suite')!r}).")
    started = (started_at or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(microsecond=0)
    ref = run_reference(env, started)
    envelope: dict[str, Any] = {
        "schema": SCHEMA,
        "id": ref["id"],
        "capabilityId": CAPABILITY_ID,
        "source": {"system": SOURCE_SYSTEM, "capability": SOURCE_CAPABILITY, "environment": ref["environment"]},
        "kind": "eval",
        "observedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "config": {
            "provider": provider[:120],
            "model": model[:120],
            "prompt": prompt_fingerprint(),
            "implementation": (build or "unknown")[:12],
            "evalSet": eval_set_fingerprint(scenarios),
        },
        "measurements": measurements(report["results"], scenarios),
        "notes": "Controlled synthetic scenarios from State's review interpretation suite, read as a rate (RELEASE.md). Aggregates only.",
    }
    if ref["reference"]:
        envelope["reference"] = ref["reference"]
    return envelope
