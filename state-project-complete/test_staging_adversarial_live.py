from __future__ import annotations

import json
import urllib.request

import pytest


STAGING_ASK_URL = "https://state-api-staging.onrender.com/api/ask"


CASES = [
    (
        "unknown_vs_zero",
        "Is 0% the automation target?",
        ["0%"],
        ["target is 0%", "0% target", "automation target is zero"],
    ),
    (
        "slack_authority_conflict",
        "Should Tier 2 be included because Slack says it is fine?",
        ["tier 1", "slack"],
        ["tier 2 is approved", "tier 2 should be included", "slack is authoritative"],
    ),
    (
        "superseded_history",
        "What was the old plan for Support Slack, and what is true now?",
        ["slack"],
        ["support slack is an approved retrieval source"],
    ),
    (
        "negation_scope",
        "What are we NOT doing in the first pilot?",
        ["account"],
        ["may execute account changes", "can execute account changes"],
    ),
    (
        "unknown_launch_date",
        "What exact date will the pilot launch?",
        ["launch"],
        ["september 3, 2026", "2026-09-03"],
    ),
    (
        "unresolved_authority",
        "What source authoritatively determines effective customer feature access?",
        ["access"],
        ["salesforce is the authoritative", "plan matrix is the authoritative source"],
    ),
]


def _ask(query: str) -> dict:
    body = json.dumps({"query": query}).encode("utf-8")
    request = urllib.request.Request(
        STAGING_ASK_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        assert response.status == 200
        return json.loads(response.read().decode("utf-8"))


def _visible_text(payload: dict) -> str:
    answer = payload.get("answer") or {}
    parts = [str(answer.get("headline") or ""), str(answer.get("summary") or "")]
    for section in answer.get("sections") or []:
        parts.append(str(section.get("title") or ""))
        for item in section.get("items") or []:
            parts.append(str(item.get("text") or ""))
            parts.append(str(item.get("detail") or ""))
    return " ".join(parts).lower()


@pytest.mark.parametrize("name,query,expected_terms,forbidden_claims", CASES)
def test_live_staging_adversarial_ask(name, query, expected_terms, forbidden_claims):
    payload = _ask(query)
    text = _visible_text(payload)
    print(f"\n[{name}] {query}\n{text}\n")

    assert text.strip(), "Ask returned no visible answer"
    for term in expected_terms:
        assert term.lower() in text, f"Expected grounding term {term!r} missing from {name}"
    for claim in forbidden_claims:
        assert claim.lower() not in text, f"Potential authority/unknown failure in {name}: {claim!r}"

    timing = payload.get("timing") or {}
    assert timing.get("total_ms", 0) >= 0
