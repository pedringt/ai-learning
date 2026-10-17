"""request_options sends each model's accepted thinking form; Haiku 5.5 (production) is unchanged (Oct 16)."""
from model_request_options import OPUS_THINKING_HEADROOM, request_options

FMT = {"format": {"type": "json_schema", "schema": {"type": "object"}}}


def test_haiku_and_other_models_get_exactly_the_old_request():
    for model in ("claude-haiku-5-5", "claude-haiku-4-5", "", None):
        assert request_options(model, 2000, FMT) == {"max_tokens": 2000, "thinking": {"type": "disabled"}, "output_config": FMT}


def test_sonnet_5_5_uses_between_tools_with_no_extra_thinking_fields():
    opts = request_options("claude-sonnet-5-5", 900, FMT)
    assert opts["thinking"] == {"type": "between_tools"}
    assert opts["max_tokens"] == 900 and opts["output_config"] == FMT
    assert "effort" not in opts["output_config"]  # between_tools needs effort high or below; the default is high


def test_opus_5_5_omits_thinking_lowers_effort_and_adds_headroom():
    opts = request_options("claude-opus-5-5", 300, FMT)
    assert "thinking" not in opts
    assert opts["output_config"] == {**FMT, "effort": "low"}
    assert opts["max_tokens"] == 300 + OPUS_THINKING_HEADROOM


def test_output_config_is_not_mutated():
    cfg = {"format": {"type": "json_schema", "schema": {}}}
    request_options("claude-opus-5-5", 100, cfg)
    assert "effort" not in cfg


def test_no_provider_call_hardcodes_disabled_thinking():
    import pathlib
    for name in ("anthropic_provider.py", "ask_provider.py", "omission_detection.py"):
        src = pathlib.Path(__file__).with_name(name).read_text()
        assert 'thinking={"type": "disabled"}' not in src, name
        assert "request_options(" in src, name
