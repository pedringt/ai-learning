"""Baseline decomposition eval (#233): how well does the model turn a source into a Starting State?

The Deep QA gate deliberately does not fail on how the real model splits a Baseline source (DEC-008);
it records the split as an observation. This eval is where that quality is measured.

For each synthetic source it runs Baseline analysis through the real API path (a fresh project, then
POST /api/baseline/evidence, then GET /api/baseline/draft) and scores the draft. Model output varies
run to run, so every source is run several times and the report gives RATES, not a single pass/fail:

- failed: analysis failed (for example schema-violating model output), leaving an empty draft
- expected-fact recall: how many of the facts a person would expect actually appear in the draft
- sections: number of distinct areas, and how often the "General" last-resort area is used
- suspect: an unresolved or merely-considered item recorded as an established fact
- open items raised, and how often that blocked Confirm (a Review the person must resolve)

The provider is injectable so the harness itself is tested without a model (see
test_baseline_decomposition_eval.py). Running it against the real model is paid: use
`python -m eval.run_baseline_decomposition`.
"""
from __future__ import annotations

import re
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class DecompositionScenario:
    id: str
    title: str
    source: str
    # Each entry is a group of lowercase keywords that must ALL appear in a single draft fact.
    expected_facts: tuple[tuple[str, ...], ...]
    min_areas: int = 2
    # Keyword groups that describe something unresolved; a fact containing all of a group's words is "suspect".
    unresolved: tuple[tuple[str, ...], ...] = ()
    # Whether a person would expect the source to leave open items (Questions or Reviews). None = don't care.
    expects_open_items: bool | None = None
    notes: str = ""


SCENARIOS: tuple[DecompositionScenario, ...] = (
    DecompositionScenario(
        id="atlas_short",
        title="Short two-section source (the Deep QA sample)",
        source=(
            "Purpose\n"
            "Project Atlas replaces the weekly spreadsheet status report with one maintained project summary.\n\n"
            "Delivery\n"
            "The target launch date is October 15, 2026.\n"
            "Morgan Lee owns launch readiness."
        ),
        expected_facts=(("atlas", "spreadsheet"), ("october 15",), ("morgan lee", "launch readiness")),
        min_areas=2,
        expects_open_items=False,
        notes="What Deep QA uses today; it has been observed to return 3 facts and 2-3 areas.",
    ),
    DecompositionScenario(
        id="structured_plan",
        title="Plan with five headed sections",
        source=(
            "Project Orchard: Customer Onboarding Revamp\n\n"
            "Scope\n"
            "Orchard replaces the manual onboarding checklist with a guided in-app flow for new customers. "
            "It covers account setup and data import. It does not cover billing changes.\n\n"
            "Timeline\n"
            "Design freeze is March 6. Beta starts April 10 with 20 pilot customers. General availability is June 2.\n\n"
            "Budget\n"
            "The approved budget is $180,000. Contractor spend is capped at $60,000.\n\n"
            "Ownership\n"
            "Priya Nair owns the roadmap. Luis Ortega owns the data import work. Support enablement belongs to Hannah Cole.\n\n"
            "Risks\n"
            "The import tool depends on the new export API from the platform team, due March 20."
        ),
        expected_facts=(
            ("orchard", "checklist"), ("billing",), ("march 6",), ("april 10",), ("june 2",),
            ("180,000",), ("60,000",), ("priya nair",), ("luis ortega",), ("hannah cole",), ("export api",),
        ),
        min_areas=4,
        notes="Tests decomposition into several sections and not one blob; the source has five headings.",
    ),
    DecompositionScenario(
        id="decisions_and_open_questions",
        title="Meeting notes: decisions mixed with open questions",
        source=(
            "Weekly sync, Aug 14\n"
            "Decided: we will use Postgres for the reporting store. Owner: Dana.\n"
            "Decided: the beta will be invite-only.\n"
            "Open: nobody has confirmed whether legal needs to review the data retention wording.\n"
            "Open question: should we support SSO at launch? Not decided."
        ),
        expected_facts=(("postgres", "reporting"), ("invite-only",)),
        min_areas=1,
        unresolved=(("sso",),),
        expects_open_items=True,
        notes="Decisions are facts; the two open items belong in Questions or Reviews, not the Starting State.",
    ),
    DecompositionScenario(
        id="hedged_change",
        title="A schedule with a considered, undecided change",
        source=(
            "Kestrel migration plan\n"
            "The migration to the new billing system is scheduled for September 30.\n"
            "We are considering moving it to October 14 if testing slips, but that has not been decided.\n"
            "Tomas Reyes is the migration lead."
        ),
        expected_facts=(("september 30",), ("tomas reyes",)),
        min_areas=1,
        unresolved=(("october 14",),),
        notes="The October 14 date is only being considered; recording it as an established fact would be wrong.",
    ),
)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9$,]+", " ", (text or "").lower().replace("-", " ").replace("’", "'")).strip()


def _has_all(statement: str, words: Iterable[str]) -> bool:
    """True if every keyword appears in `statement`: whole words/phrases, except tokens with digits or
    currency (dates, amounts), which match as substrings so "180,000" is found in "$180,000"."""
    haystack = _norm(statement)
    padded = f" {haystack} "
    for word in words:
        needle = _norm(word)
        if re.search(r"[\d$]", needle):
            if needle not in haystack:
                return False
        elif f" {needle} " not in padded:
            return False
    return True


def score_run(scenario: DecompositionScenario, draft: dict[str, Any]) -> dict[str, Any]:
    """Score one Baseline draft (the payload of GET /api/baseline/draft) against a scenario."""
    counts = draft.get("counts") or {}
    items = [i for i in (draft.get("draft") or {}).get("items", []) if i.get("kind") in ("proposed", "current")]
    statements = [f"{i.get('topic', '')} {i.get('statement', '')}" for i in items]
    areas = {_norm(i.get("area_name") or "General") for i in items}
    questions = (draft.get("draft") or {}).get("questions", [])
    needs_review = draft.get("needs_individual_review") or []
    hits = [any(_has_all(s, group) for s in statements) for group in scenario.expected_facts]
    suspect = [group for group in scenario.unresolved if any(_has_all(s, group) for s in statements)]
    open_items = len(questions) + len(needs_review)
    return {
        # What the draft actually said, so a person can judge the automatic flags below
        # (a fact that merely MENTIONS an unresolved item, correctly hedged, is flagged too).
        "facts_detail": [{"area": i.get("area_name") or "General", "topic": i.get("topic") or "", "statement": i.get("statement") or ""} for i in items],
        "open_item_texts": [str(q.get("text", ""))[:200] for q in questions] + [str(r.get("decision_question", ""))[:200] for r in needs_review],
        "failed": int(counts.get("failed_evidence", 0)) > 0,
        "facts": len(items),
        "areas": len(areas),
        "general_used": "general" in areas,
        "enough_areas": len(areas) >= scenario.min_areas,
        "recall": (sum(hits) / len(hits)) if hits else 1.0,
        "missed": [" + ".join(group) for group, hit in zip(scenario.expected_facts, hits) if not hit],
        "suspect": len(suspect),
        "suspect_groups": [" + ".join(group) for group in suspect],
        "suspect_statements": [st for st in statements if any(_has_all(st, group) for group in scenario.unresolved)],
        "open_items": open_items,
        "blocked_confirm": not draft.get("can_confirm", True) and not counts.get("failed_evidence", 0),
        "expected_open_items_ok": None if scenario.expects_open_items is None else (open_items > 0) == scenario.expects_open_items,
    }


def summarize(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Rates over repeated runs of one scenario. Failed runs count toward the failure rate and are excluded from quality means."""
    n = len(runs)
    ok = [r for r in runs if not r["failed"]]

    def mean(key):
        return round(sum(r[key] for r in ok) / len(ok), 2) if ok else None

    def rate(pred, pool):
        return round(sum(1 for r in pool if pred(r)) / len(pool), 2) if pool else None

    checked = [r for r in ok if r["expected_open_items_ok"] is not None]
    return {
        "runs": n,
        "failed_rate": rate(lambda r: r["failed"], runs),
        "facts_mean": mean("facts"),
        "areas_mean": mean("areas"),
        "enough_areas_rate": rate(lambda r: r["enough_areas"], ok),
        "general_used_rate": rate(lambda r: r["general_used"], ok),
        "recall_mean": mean("recall"),
        "suspect_rate": rate(lambda r: r["suspect"] > 0, ok),
        "open_items_mean": mean("open_items"),
        "blocked_confirm_rate": rate(lambda r: r["blocked_confirm"], ok),
        "open_items_as_expected_rate": rate(lambda r: r["expected_open_items_ok"], checked),
    }


ROUTES = ("paste", "upload")


def run_scenarios(provider, scenarios: Iterable[DecompositionScenario] = SCENARIOS, repeats: int = 3,
                  database_dir: str | None = None, timeout_seconds: float = 180.0, route: str = "paste") -> dict[str, Any]:
    """Run each scenario `repeats` times against `provider` through the real API path.

    `route` is how the source reaches State: "paste" (POST /api/baseline/evidence, pasted notes) or
    "upload" (POST /api/baseline/evidence/upload, a .txt file, which is what Deep QA does). The analysis
    is meant to treat them the same; running both is how to check that.
    """
    if route not in ROUTES:
        raise ValueError(f"route must be one of {ROUTES}")
    from fastapi.testclient import TestClient

    from api import Settings, create_app

    started = time.time()
    scenarios = list(scenarios)
    per_scenario: dict[str, dict[str, Any]] = {}
    with tempfile.TemporaryDirectory(dir=database_dir) as tmp:
        for scenario in scenarios:
            runs: list[dict[str, Any]] = []
            for attempt in range(repeats):
                # A fresh database per run, on purpose: runs must not share state. (Two projects in one database
                # can collide on an identical open Review, #238, which would show up here as a spurious failure
                # instead of a measurement of the model.)
                settings = Settings(database_path=str(Path(tmp) / f"{scenario.id}_{attempt}.db"), cors_origins=[], demo_bootstrap=False)
                with TestClient(create_app(settings, provider=provider)) as client:
                    project = client.post("/api/projects", json={"name": f"Eval {scenario.id} {attempt}"}).json()
                    headers = {"X-State-Project-Id": project["id"]}
                    if route == "upload":
                        response = client.post("/api/baseline/evidence/upload", headers=headers,
                                               files={"file": (f"{scenario.id}.txt", scenario.source.encode("utf-8"), "text/plain")})
                    else:
                        response = client.post("/api/baseline/evidence", headers=headers,
                                               json={"content": scenario.source, "source_type": "manual_note"})
                    deadline = time.time() + timeout_seconds
                    draft: dict[str, Any] = {}
                    while time.time() < deadline:
                        draft = client.get("/api/baseline/draft", headers=headers).json()
                        if not (draft.get("counts") or {}).get("processing_evidence"):
                            break
                        time.sleep(0.5)
                result = score_run(scenario, draft)
                result["submit_status"] = response.status_code
                runs.append(result)
            per_scenario[scenario.id] = {"title": scenario.title, "summary": summarize(runs), "runs": runs}
    overall = summarize([r for s in per_scenario.values() for r in s["runs"]])
    return {"suite": "baseline_decomposition", "route": route, "elapsed_seconds": round(time.time() - started, 2),
            "repeats": repeats, "overall": overall, "scenarios": per_scenario}
