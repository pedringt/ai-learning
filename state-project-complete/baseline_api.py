"""Composition root for State with the explicit Baseline Setup lifecycle."""
from __future__ import annotations

import api as _core
from api import *  # noqa: F401,F403

from baseline_setup import install_baseline_extensions, register_baseline_routes

install_baseline_extensions(_core)


def create_app(settings=None, provider=None, ask_provider=None):
    # The core API still owns every authority-bearing workflow. Baseline Setup
    # only composes interpretation/lifecycle hooks and its two read/finish routes.
    install_baseline_extensions(_core)
    application = _core.create_app(settings=settings, provider=provider, ask_provider=ask_provider)
    register_baseline_routes(application, application.state.settings)
    return application


app = create_app()
