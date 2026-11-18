"""#696 (Paige, Nov 16; DEC-030 amendment): "the answer lost its pending claim" is reported as its own trust metric,
separately from the authority check and even when that check passes. Reporting only, never a gate. No model calls."""
from eval.aggregate_matrix import aggregate, to_markdown
from eval.pending_omission import describe, lost_pending_claim, summarize
from eval.scoring_version import harness_source

KEPT_STATE = {"answer": {"claims": [{"text": "No. Current State says data retention is 30 days.",
                                     "basis": "current_state", "primary_record_id": "ask-state-0"}]}}
KEPT_PENDING = {"answer": {"claims": [
    *KEPT_STATE["answer"]["claims"],
    {"text": "A pending Review proposes restoring 90 days.", "basis": "pending_review", "primary_record_id": "ask-review-0"}]}}
WITHHELD_PENDING = [{"unit": "claim", "kind": "figure", "reason": "anchor check failed", "basis": "pending_review",
                     "record_id": "ask-review-0",
                     "statement_text": "A pending Review proposes restoring the 90-day retention period; it does not change "
                                       "the current 30-day setting."}]


def test_withheld_pending_claim_with_none_left_counts():
    assert lost_pending_claim(KEPT_STATE, WITHHELD_PENDING)


def test_a_kept_pending_claim_means_nothing_was_lost():
    assert not lost_pending_claim(KEPT_PENDING, WITHHELD_PENDING)


def test_other_withholdings_do_not_count():
    other = [{**WITHHELD_PENDING[0], "basis": "current_state"}, {**WITHHELD_PENDING[0], "unit": "item"}]
    assert not lost_pending_claim(KEPT_STATE, other)
    assert not lost_pending_claim(KEPT_STATE, None)


def test_summary_reports_it_even_when_the_authority_check_passes():
    rows = [{"scenario_id": "adv_pending_agrees_with_stale_history", "answer": KEPT_STATE,
             "withheld_units": WITHHELD_PENDING, "checks": {"authority": True}},
            {"scenario_id": "adv_hedged_pending_item", "answer": KEPT_PENDING, "withheld_units": WITHHELD_PENDING,
             "checks": {"authority": True}},
            {"scenario_id": "errored", "answer": None}]
    s = summarize(rows)
    assert (s["n"], s["lost"], s["authority_passed"]) == (2, 1, 1)
    assert s["withheld_kinds"] == {"figure": 1}
    assert s["scenarios"] == {"adv_pending_agrees_with_stale_history": 1}
    assert "1/2" in describe(s) and "not a gate" in describe(s)


def test_matrix_summary_shows_the_metric_without_changing_pass_rates():
    row = {"scenario_id": "adv_pending_agrees_with_stale_history", "outcome": "pass", "passed": True,
           "checks": {"authority": True}, "answer": KEPT_STATE, "withheld_units": WITHHELD_PENDING}
    summary = aggregate([{"suite": "adversarial", "model": "claude-haiku-5-5", "repeat": 0, "calls": 1,
                          "complete": True, "results": [row]}])
    suite = summary["suites"][0]
    assert suite["passes"] == 1 and suite["lost_pending_claim"]["lost"] == 1
    assert "Lost its pending claim" in to_markdown(summary)


def test_the_metric_is_not_part_of_the_scoring_version():
    assert "lost_pending_claim" not in harness_source()
