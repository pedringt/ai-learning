"""Backward-compatible alias for State's composed deployment API.

Baseline Setup now lives behind the normal ``api:app`` entry point. This module
remains so existing tests/imports do not need to change at the same time.
"""
from api import *  # noqa: F401,F403
from api import app, create_app  # noqa: F401
