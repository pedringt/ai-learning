"""#624: tests that need a real model key run only in `make qa-real-model` (qa-python unsets the keys).

Every test file that skips without ANTHROPIC_API_KEY must be on the Makefile's REAL_MODEL_TESTS list, or it
would silently never run anywhere again.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEY_GATE = re.compile(r'skipif\(\s*not os\.getenv\("ANTHROPIC_API_KEY"\)|skipTest\("ANTHROPIC_API_KEY not set"\)')


def test_every_key_gated_test_file_runs_in_qa_real_model():
    makefile = (HERE.parent / "Makefile").read_text()
    listed = set(re.search(r"^REAL_MODEL_TESTS = (.+)$", makefile, re.M).group(1).split())
    gated = {path.name for path in HERE.glob("test_*.py") if KEY_GATE.search(path.read_text())}
    assert gated, "the key-gate pattern found nothing; update KEY_GATE"
    assert gated <= listed, f"add to REAL_MODEL_TESTS: {sorted(gated - listed)}"
    assert all((HERE / name).exists() for name in listed), "REAL_MODEL_TESTS names a file that no longer exists"
