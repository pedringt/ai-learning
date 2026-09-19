"""Opt-in loading of state-project-complete/.env for the real-model eval scripts.

This is deliberately NOT called at import time by ``eval.harness`` or any test
module. Importing test helpers must never inject ``ANTHROPIC_API_KEY`` into the
environment: doing so un-skips the real-model tests and makes ``make qa-fast``
call the paid model on any machine that has a ``.env`` (issue #224).

Only the runnable eval entrypoints (``run_eval``, ``run_quality_evals``, ...)
call :func:`load_local_env`, at the top of the script.
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def load_local_env() -> None:
    """Load ``state-project-complete/.env`` if present.

    Lets a real key live in a plain gitignored file instead of a shell export.
    A harmless no-op when the file is missing, and it never overrides a
    variable already set in the real environment.
    """
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
