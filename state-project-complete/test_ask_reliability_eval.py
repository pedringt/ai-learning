"""Deterministic coverage for the Ask completion-reliability eval harness.

No real model calls. The paid runner is eval/run_ask_reliability.py.
"""
from __future__ import annotations

import json
from copy import deepcopy

from eval.ask_reliability import run, summarize
from test_ask_r9 import FakeAskProvider


class ContractMissThenValidProvider(FakeAskProvider):
    def __init__(self):
        super().__init__()
        self.stream_calls = 0

    def stream(self, prompt):
        self.stream_calls += 1
        invalid = deepcopy(self.answer)
        invalid["job"] = "not-a-real-ask-job"
        yield json.dumps({"selection": self.selection, "answer": invalid})


class AlwaysValidStreamingProvider(FakeAskProvider):
    def __init__(self):
        super().__init__()
        self.stream_calls = 0

    def stream(self, prompt):
        self.stream_calls += 1
        yield json.dumps({"selection": self.selection, "answer": self.answer})


def test_summary_keeps_contract_reliability_separate_from_provider_errors():
    s = summarize([
        {"first_outcome": "valid", "model_calls": 1, "unrecovered": False},
        {"first_outcome": "contract_failure", "model_calls": 2, "recovered_on_retry": True, "unrecovered": False},
        {"first_outcome": "contract_failure", "model_calls": 2, "recovered_on_retry": False, "unrecovered": True},
        {"first_outcome": "provider_error", "model_calls": 1, "unrecovered": True},
    ])
    assert s["first_attempt_valid_rate"] == 0.25
    assert s["contract_failure_rate"] == 0.5
    assert s["retry_recovery_rate"] == 0.5
    assert s["unrecovered_failure_rate"] == 0.5
    assert s["provider_error_rate"] == 0.25
    assert s["model_calls"] == 6


def test_harness_records_a_contract_miss_recovered_by_retry():
    provider = ContractMissThenValidProvider()
    report = run(provider, repeats=1, queries={"repro": "Prep me for the security meeting."})

    row = report["runs"][0]
    assert row["first_outcome"] == "contract_failure"
    assert row["recovered_on_retry"] is True
    assert row["unrecovered"] is False
    assert row["model_calls"] == 2
    assert report["summary"]["retry_recovery_rate"] == 1.0
    assert provider.stream_calls == 1
    assert len(provider.prompts) == 2


def test_harness_records_first_attempt_success_without_retry():
    provider = AlwaysValidStreamingProvider()
    report = run(provider, repeats=1, queries={"ok": "Prep me for the security meeting."})

    row = report["runs"][0]
    assert row["first_outcome"] == "valid"
    assert row["recovered_on_retry"] is False
    assert row["unrecovered"] is False
    assert row["model_calls"] == 1
    assert report["summary"]["first_attempt_valid_rate"] == 1.0
    assert provider.stream_calls == 1
    assert len(provider.prompts) == 0
