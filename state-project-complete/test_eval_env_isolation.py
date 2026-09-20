"""Importing eval helpers must not load .env (issue #224).

A loaded ANTHROPIC_API_KEY un-skips the real-model tests, so a plain
``make qa-fast`` would make paid model calls on any machine with a ``.env``.
"""
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent

ENTRYPOINTS = (
    "run_eval.py",
    "run_quality_evals.py",
    "run_sequences.py",
    "scaling_experiment.py",
    "raw_vs_state_experiment.py",
    "run_meeting_prep_shape.py",
)


class EvalEnvIsolationTests(unittest.TestCase):
    def test_importing_test_facing_eval_modules_never_calls_load_dotenv(self):
        # Patch dotenv before the imports so an import-time call is recorded
        # whether the module uses `import dotenv` or `from dotenv import ...`.
        code = textwrap.dedent(
            """
            import dotenv
            calls = []
            dotenv.load_dotenv = lambda *a, **k: calls.append((a, k))
            import eval.harness, eval.quality_harness, eval.env  # noqa: F401
            import eval.meeting_prep_shape, eval.meeting_prep_shape_run  # noqa: F401
            assert not calls, f"load_dotenv called at import time: {calls}"
            """
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=HERE, capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_load_local_env_reads_the_project_env_file(self):
        from eval import env

        with mock.patch.object(env, "load_dotenv") as loader:
            env.load_local_env()
        loader.assert_called_once_with(HERE / ".env")

    def test_every_real_model_entrypoint_loads_env_explicitly(self):
        for name in ENTRYPOINTS:
            source = (HERE / "eval" / name).read_text()
            self.assertIn("load_local_env()", source, name)


if __name__ == "__main__":
    unittest.main()
