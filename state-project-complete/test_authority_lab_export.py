"""The Authority Lab evidence export (#517): no model, no .env.

Imports only the library (``eval.authority_lab_export``), never the
``run_quality_evals`` script, which loads ``.env`` (#224).
"""
import dataclasses
import json
import re
import unittest
from datetime import datetime, timezone
from unittest import mock

from eval import authority_lab_export as ex
from eval.review_interpretation_scenarios import SCENARIOS

STARTED = datetime(2026, 10, 13, 14, 17, 5, 123456, tzinfo=timezone.utc)
GH = {"GITHUB_RUN_ID": "40001", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_SERVER_URL": "https://github.com",
      "GITHUB_REPOSITORY": "pedringt/ai-learning", "GITHUB_REF_NAME": "staging"}


def _row(s, *, passed=True, actual_review=None, status="succeeded", correct=None):
    """One per-scenario row shaped like run_quality_evals' review report."""
    return {
        "id": s.id, "category": s.category, "severity": s.severity,
        "expected_review_needed": s.review_needed,
        "actual_review_needed": s.review_needed if actual_review is None else actual_review,
        "expected_action": s.expected_action, "observed_action": s.expected_action,
        "review_needed_correct": True, "interpretation_correct": passed if correct is None else correct,
        "passed": passed, "processing_status": status, "error": "",
        "proposed_state_text": "MODEL OUTPUT that must never be exported", "rationale_text": "MODEL RATIONALE that must never be exported",
        "trace_id": "trace_secret", "trace_path": "/tmp/trace.json",
    }


def _report(rows):
    return {"suite": "review_interpretation", "started_at": STARTED.isoformat(), "elapsed_seconds": 12.5, "summary": {}, "results": rows}


def _envelope(rows=None, env=GH, **kw):
    rows = rows if rows is not None else [_row(s) for s in SCENARIOS]
    return ex.build_envelope(_report(rows), provider="anthropic", model="claude-haiku-5-5", build="0123456789abcdef0123", env=env, started_at=STARTED, **kw)


# A mirror of Authority Lab's checkEvidence (src/store/external.js): the keys
# it allows and the limits it applies. Authority Lab's CI is the real check
# when the file is delivered (#518); this keeps the two from drifting quietly.
TOP = {"schema", "id", "capabilityId", "source", "kind", "observedAt", "config", "reference", "measurements", "notes"}
CONFIG = {"provider", "model", "prompt", "implementation", "evalSet", "toolPolicy"}
MEASURE = {"metric", "label", "type", "passed", "total", "value", "unit", "segment", "severity"}


def al_problems(e):
    p = []
    if set(e) - TOP: p.append(f"top keys {set(e) - TOP}")
    if e.get("schema") != "authority-lab-evidence/1": p.append("schema")
    if not re.fullmatch(r"[a-z0-9][a-z0-9:._-]{2,119}", e.get("id", "")): p.append("id")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,59}", e.get("capabilityId", "")): p.append("capabilityId")
    src = e.get("source", {})
    if set(src) - {"system", "capability", "environment"} or not src.get("system") or len(src["system"]) > 60 or not src.get("capability") or len(src["capability"]) > 80 or len(src.get("environment", "")) > 40: p.append("source")
    if e.get("kind") not in ("eval", "production"): p.append("kind")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?", e.get("observedAt", "")): p.append("observedAt")
    cfg = e.get("config", {})
    if set(cfg) - CONFIG or any(not isinstance(v, str) or not v.strip() or len(v) > 120 for v in cfg.values()): p.append("config")
    ref = e.get("reference")
    if ref is not None and (set(ref) - {"url", "label"} or not str(ref.get("url", "")).startswith("https://") or len(ref["url"]) > 300 or len(ref.get("label", "")) > 80): p.append("reference")
    if len(e.get("notes", "")) > 300: p.append("notes")
    ms = e.get("measurements", [])
    if not 1 <= len(ms) <= 40: p.append("measurement count")
    seen = set()
    for m in ms:
        if set(m) - MEASURE: p.append(f"measurement keys {set(m) - MEASURE}")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,59}", m.get("metric", "")): p.append("metric")
        if len(m.get("label", "")) > 80 or len(m.get("segment", "") or "") > 60: p.append("text length")
        if m.get("severity") not in (None, "low", "medium", "high"): p.append("severity")
        if m["type"] == "rate" and not (isinstance(m["passed"], int) and isinstance(m["total"], int) and 0 <= m["passed"] <= m["total"] and m["total"] > 0): p.append(f"rate {m['metric']}")
        if m["type"] == "count" and not (isinstance(m["value"], int) and m["value"] >= 0 and ("total" not in m or m["total"] >= m["value"])): p.append(f"count {m['metric']}")
        key = (m["metric"], m.get("segment"))
        if key in seen: p.append(f"repeat {key}")
        seen.add(key)
    return p


class AuthorityLabExportTests(unittest.TestCase):
    def test_a_clean_run_is_a_valid_envelope_with_versions_and_a_link(self):
        e = _envelope()
        self.assertEqual(al_problems(e), [])
        self.assertEqual(e["id"], "state:eval:review:gh-40001-1")
        self.assertEqual(e["capabilityId"], "interpret-incoming-project-evidence")
        self.assertEqual(e["source"], {"system": "State", "capability": "Evidence interpretation", "environment": "github-actions staging"})
        self.assertEqual(e["kind"], "eval")
        self.assertEqual(e["observedAt"], "2026-10-13T14:17:05Z")
        self.assertEqual(e["config"]["model"], "claude-haiku-5-5")
        self.assertEqual(e["config"]["implementation"], "0123456789ab")
        self.assertRegex(e["config"]["prompt"], r"^p-[0-9a-f]{12}$")
        self.assertRegex(e["config"]["evalSet"], r"^review-16-[0-9a-f]{12}$")
        self.assertEqual(e["reference"], {"url": "https://github.com/pedringt/ai-learning/actions/runs/40001/attempts/1", "label": "GitHub Actions run 40001"})
        by = {(m["metric"], m.get("segment")): m for m in e["measurements"]}
        self.assertEqual((by[("scenarios-passed", None)]["passed"], by[("scenarios-passed", None)]["total"]), (16, 16))
        self.assertEqual(by[("high-severity-failures", None)]["value"], 0)
        self.assertEqual(by[("review-routing-misses", None)]["total"], sum(1 for s in SCENARIOS if s.review_needed))
        self.assertEqual(by[("scenarios-passed", "High-severity scenarios")]["total"], 10)
        self.assertEqual(by[("scenarios-passed", "Medium-severity scenarios")]["total"], 5)
        self.assertEqual(by[("scenarios-passed", "Low-severity scenarios")]["total"], 1)

    def test_failures_are_counted_where_they_belong(self):
        high = [s for s in SCENARIOS if s.severity == "high"]
        needed = [s for s in SCENARIOS if s.review_needed]
        not_needed = [s for s in SCENARIOS if not s.review_needed]
        rows = []
        for s in SCENARIOS:
            if s is high[0]:
                rows.append(_row(s, passed=False, status="error"))  # errored: not scored, still a high-severity failure
            elif s is needed[-1]:
                rows.append(_row(s, passed=False, actual_review=False, correct=False))  # never reached Review
            elif s is not_needed[0]:
                rows.append(_row(s, passed=False, actual_review=True))  # needless Review
            else:
                rows.append(_row(s))
        by = {(m["metric"], m.get("segment")): m for m in _envelope(rows)["measurements"]}
        self.assertEqual(by[("scenarios-passed", None)]["passed"], 13)
        self.assertEqual(by[("errors", None)]["value"], 1)
        self.assertEqual(by[("interpretation-quality", None)]["total"], 15, "an errored scenario isn't scored")
        self.assertEqual(by[("review-routing-misses", None)]["value"], 1)
        self.assertEqual(by[("unnecessary-reviews", None)]["value"], 1)
        high_failed = sum(1 for s in (high[0], needed[-1], not_needed[0]) if s.severity == "high")
        self.assertEqual(by[("high-severity-failures", None)]["value"], high_failed)

    def test_the_same_run_is_the_same_evidence_and_a_new_attempt_is_new(self):
        self.assertEqual(json.dumps(_envelope(), sort_keys=True), json.dumps(_envelope(), sort_keys=True))
        self.assertEqual(_envelope(env={**GH, "GITHUB_RUN_ATTEMPT": "2"})["id"], "state:eval:review:gh-40001-2")
        local = _envelope(env={})
        self.assertEqual(local["id"], "state:eval:review:local-20261013t141705z")
        self.assertEqual(local["source"]["environment"], "local")
        self.assertNotIn("reference", local)
        self.assertEqual(al_problems(local), [])

    def test_nothing_from_a_scenario_or_the_model_is_exported(self):
        text = json.dumps(_envelope())
        for s in SCENARIOS:
            self.assertNotIn(s.id, text)
            self.assertNotIn(s.evidence[:40], text)
            for _, statement in s.current_state:
                self.assertNotIn(statement[:40], text)
            for q in s.open_questions:
                self.assertNotIn(q[:40], text)
        for leaked in ("MODEL OUTPUT", "MODEL RATIONALE", "trace_secret", "/tmp/trace"):
            self.assertNotIn(leaked, text)

    def test_versions_change_with_what_they_describe(self):
        self.assertEqual(ex.prompt_fingerprint(), ex.prompt_fingerprint())
        before = ex.prompt_fingerprint()
        with mock.patch("question_review_prompt.QUESTION_REVIEW_GUIDANCE", "changed guidance"):
            self.assertNotEqual(ex.prompt_fingerprint(), before)
        with mock.patch.dict("os.environ", {"CLAUDE_MAX_TOKENS": "4000"}):
            self.assertNotEqual(ex.prompt_fingerprint(), before)
        # A changed expectation or severity is a different eval set.
        changed = (dataclasses.replace(SCENARIOS[0], severity="low"),) + SCENARIOS[1:]
        self.assertNotEqual(ex.eval_set_fingerprint(changed), ex.eval_set_fingerprint())
        self.assertEqual(ex.eval_set_fingerprint(SCENARIOS), ex.eval_set_fingerprint())

    def test_comments_and_docstrings_are_not_prompt_changes(self):
        src = 'class A:\n    def f(self):\n        """Doc."""\n        # a comment\n        return "x"\n'
        src2 = 'class A:\n    def f(self):\n        """Other doc."""\n        return "x"  # moved\n'
        import ast
        norm = lambda s: ast.unparse(ex._strip_docstrings(ast.parse(s)))
        self.assertEqual(norm(src), norm(src2))

    def test_only_the_review_suite_is_exported(self):
        with self.assertRaisesRegex(ValueError, "Only the review_interpretation suite"):
            ex.build_envelope({"suite": "ask_quality", "results": []}, provider="a", model="m", build="b", env={})


if __name__ == "__main__":
    unittest.main()
