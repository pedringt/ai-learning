"""#698 (Paige, Nov 16): the release check reads the previous staging run from its saved quality-report artifact.
Deterministic: no model calls, no network."""
import json

from eval.release_gate import ASK_SUITE, REVIEW_SUITE, previous_failed_from_reports


def _report(tmp_path, name, started, suites):
    path = tmp_path / name / "quality-report.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"started_at": started, "reports": [
        {"suite": suite, "results": [{"id": i, "passed": ok} for i, ok in rows]} for suite, rows in suites.items()]}))
    return path


def test_the_newest_report_that_ran_each_suite_supplies_its_failures(tmp_path):
    old = _report(tmp_path, "1", "2026-11-15T05:00:00", {ASK_SUITE: [("a", False)], REVIEW_SUITE: [("r", False)]})
    new = _report(tmp_path, "2", "2026-11-16T19:00:00", {ASK_SUITE: [("b", False), ("c", True)]})
    assert previous_failed_from_reports([new, old]) == {ASK_SUITE: {"b"}, REVIEW_SUITE: {"r"}}


def test_a_passing_previous_run_is_known_and_empty_and_a_missing_suite_is_unknown(tmp_path):
    path = _report(tmp_path, "1", "2026-11-16T19:00:00", {ASK_SUITE: [("a", True)]})
    assert previous_failed_from_reports([path]) == {ASK_SUITE: set(), REVIEW_SUITE: None}


def test_unreadable_files_and_no_reports_mean_unknown(tmp_path):
    bad = tmp_path / "quality-report.json"
    bad.write_text("not json")
    assert previous_failed_from_reports([bad, tmp_path / "missing.json"]) == {ASK_SUITE: None, REVIEW_SUITE: None}
    assert previous_failed_from_reports([]) == {ASK_SUITE: None, REVIEW_SUITE: None}
