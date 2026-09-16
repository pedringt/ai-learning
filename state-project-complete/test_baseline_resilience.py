from baseline_resilience import _is_token_exhaustion, _retry_interpret


def _split(text, max_chars):
    return [text[i:i + max_chars] for i in range(0, len(text), max_chars)]


def _merge(payloads):
    parts = []
    for item in payloads:
        if "parts" in item:
            parts.extend(item["parts"])
        else:
            parts.append(item["value"])
    return {"parts": parts}


def test_token_exhaustion_detection_is_narrow():
    assert _is_token_exhaustion(RuntimeError("structured output hit max_tokens=1200"))
    assert not _is_token_exhaustion(RuntimeError("provider unavailable"))


def test_retry_splits_only_after_token_exhaustion():
    calls = []

    def call(evidence):
        text = evidence["content"]
        calls.append(len(text))
        if len(text) > 700:
            raise RuntimeError("structured output hit max_tokens=1200")
        return {"value": len(text)}

    result = _retry_interpret(
        call,
        {"id": "evidence_test", "content": "x" * 1800},
        split_fn=_split,
        merge_fn=_merge,
    )

    assert calls[0] == 1800
    assert all(size <= 700 for size in result["parts"])
    assert sum(result["parts"]) == 1800


def test_non_token_provider_error_is_not_retried():
    calls = 0

    def call(_evidence):
        nonlocal calls
        calls += 1
        raise RuntimeError("provider unavailable")

    try:
        _retry_interpret(
            call,
            {"id": "evidence_test", "content": "x" * 1800},
            split_fn=_split,
            merge_fn=_merge,
        )
    except RuntimeError as error:
        assert "provider unavailable" in str(error)
    else:
        raise AssertionError("expected provider error")
    assert calls == 1
