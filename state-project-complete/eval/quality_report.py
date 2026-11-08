"""What a controlled quality-eval run records for the dashboard (#639/#643).

A library module, so tests can import it without the run script loading .env (#224). The dashboard stores
content-minimizing results (DATA_PRIVACY.md "Controlled eval data"): counts, rates, scenario ids, the failed checks and
the failed items named from each scenario's own phrase lists. A failed Ask scenario may also carry one synthetic eval
excerpt of at most 200 characters (the Nov 7 exception, #643); the full answer stays in the local report.
"""
from __future__ import annotations

import os

SYNTHETIC_EXCERPT_LIMIT = 200


def recordable_items(items: list) -> list[str]:
    """Failed items as the dashboard may store them. Required facts and forbidden claims are the scenario's own phrases;
    an invented number came from the model's answer, so only that a number was invented is kept (DATA_PRIVACY.md)."""
    out: list[str] = []
    for item in items:
        text = str(item)
        if text.startswith("number not in any record"):
            text = "number not in any record"
        if text not in out:
            out.append(text[:160])
    return out[:8]


def failure_details(report: dict) -> list[dict]:
    details = []
    is_review = report["suite"] == "review_interpretation"
    for row in report["results"]:
        if row.get("passed"):
            continue
        if is_review:
            failed_checks = [
                name for name, ok in (
                    ("review_needed", row.get("review_needed_correct")),
                    ("interpretation", row.get("interpretation_correct")),
                )
                if ok is False
            ]
            if row.get("processing_status") and row.get("processing_status") != "succeeded":
                failed_checks.append("processing")
            expected = row.get("expected_action")
            observed_action = row.get("observed_action") or row.get("processing_status") or row.get("error")
            proposal = str(row.get("proposed_state_text") or "").strip()
            observed = observed_action
            if proposal:
                observed += " | proposed State: " + proposal[:180]
        else:
            failed_checks = [
                name for name, ok in (
                    ("grounding", row.get("grounding_ok")),
                    ("required_facts", row.get("required_facts_ok")),
                    ("forbidden_claims", row.get("forbidden_claims_ok")),
                    ("uncertainty", row.get("uncertainty_ok")),
                    ("open_item", row.get("open_item_ok")),
                    ("authority", row.get("authority_ok")),
                )
                if ok is False
            ]
            expected = "Grounded answer that preserves uncertainty, open items, and decision authority"
            observed = "Failed checks: " + ", ".join(failed_checks) if failed_checks else (row.get("error") or "Behavior did not meet the controlled expectation")
        detail = {
            "scenario_id": row["id"],
            "category": row.get("category"),
            "severity": row.get("severity", "medium"),
            "expected": str(expected)[:240] if expected else None,
            "observed": str(observed)[:240] if observed else None,
            "failed_checks": failed_checks[:8],
            # #639/#643: which required or forbidden item failed, so a reader sees what was wrong, not only which check.
            "failed_items": recordable_items(row.get("failed_items") or []),
        }
        # #643 (Paige, Nov 7): the DATA_PRIVACY.md exception for synthetic eval excerpts. Failed controlled scenarios only,
        # 200 characters at most, in its own field so it is never mixed with the software-generated explanation.
        excerpt = str(row.get("answer_excerpt") or "").strip()
        if not is_review and excerpt and report.get("run_kind", "controlled_eval") == "controlled_eval":
            detail["synthetic_answer_excerpt"] = excerpt if len(excerpt) <= SYNTHETIC_EXCERPT_LIMIT else excerpt[:SYNTHETIC_EXCERPT_LIMIT - 1].rstrip() + "…"
        details.append(detail)
    return details[:16]


def analytics_payload(report: dict, provider) -> dict:
    summary = report["summary"]
    common = {
        "suite": report["suite"],
        "scoring_version": report.get("scoring_version"),
        "run_kind": "controlled_eval",
        "build": os.getenv("RENDER_GIT_COMMIT", os.getenv("GITHUB_SHA", "local"))[:120],
        "provider": getattr(provider, "name", "anthropic"),
        "model_identifier": getattr(provider, "model_identifier", os.getenv("CLAUDE_MODEL", "configured-default"))[:160],
        "total": summary["total"],
        "errors": summary["errors"],
        "high_severity_failures": summary["high_severity_failures"],
        "failure_details": failure_details(report),
    }
    if report["suite"] == "review_interpretation":
        common.update({
            "precision": summary["precision"],
            "recall": summary["recall"],
            "false_positives": summary["false_positives"],
            "false_negatives": summary["false_negatives"],
            "interpretation_accuracy": summary["interpretation_accuracy"],
        })
    else:
        common.update({
            "ask_grounding": summary["ask_grounding"],
            "uncertainty_accuracy": summary["uncertainty_accuracy"],
            "open_item_accuracy": summary["open_item_accuracy"],
            "authority_accuracy": summary["authority_accuracy"],
            "overall_pass_rate": summary["overall_pass_rate"],
        })
    return common
