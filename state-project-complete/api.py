"""Deployment entry point for State with Baseline Setup composed in.

The original FastAPI implementation lives in ``api_core``. Keeping this wrapper
as ``api.py`` means Render's existing ``uvicorn api:app`` start command loads the
Baseline Setup lifecycle without any environment or service configuration change.
"""
from __future__ import annotations

import api_core as _core
from baseline_setup import install_baseline_extensions, register_baseline_routes

# Patch the core composition points before any app created through this module is
# started. The authority-bearing workflows remain in api_core; Baseline Setup
# only changes interpretation/lifecycle hooks and adds its read/finish routes.
install_baseline_extensions(_core)

from api_core import *  # noqa: E402,F401,F403

# Underscore-prefixed helpers are intentionally not included by import * but some
# tests/integration code may still import this historical module-level helper.
_provider_from_env = _core._provider_from_env


def create_app(settings=None, provider=None, ask_provider=None):
    application = _core.create_app(
        settings=settings,
        provider=provider,
        ask_provider=ask_provider,
    )
    register_baseline_routes(application, application.state.settings)
    return application


app = create_app()
