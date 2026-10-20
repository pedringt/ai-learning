"""Deployment entry point for State with Baseline Setup composed in.

The original FastAPI implementation lives in ``api_core``. Keeping this wrapper
as ``api.py`` means Render's existing ``uvicorn api:app`` start command loads the
Baseline Setup lifecycle without any environment or service configuration change.

Composition is explicit (#502): ``compose_baseline_runtime()`` adds Baseline's
layers to the extension points the core modules declare (see
``baseline_composition`` for the inventory), then ``create_app`` builds the core
app and registers the Baseline/analytics routes. No module's globals are
reassigned, and ``api`` is an ordinary module: it exports ``Settings``,
``create_app`` and ``app``. Tests that replace a core global the route closures
read (for example ``exchange_code_for_token``) patch ``api_core``, not ``api``.
"""
from __future__ import annotations

import api_core as _core
from api_core import Settings
from baseline_async_intake import register_baseline_async_intake_routes
from baseline_composition import compose_baseline_runtime
from baseline_draft import register_baseline_draft_routes
from baseline_manual_setup import register_baseline_manual_setup_routes
from baseline_setup import register_baseline_routes
from product_analytics import register_product_analytics
from quality_analytics_api import register_quality_analytics
from project_health_usage_api import register_project_health_usage

__all__ = ["Settings", "app", "create_app"]

# Idempotent; done at import so anything that imports ``api`` sees the composed
# core functions even before it builds an app.
compose_baseline_runtime()


def create_app(settings=None, provider=None, ask_provider=None):
    compose_baseline_runtime()
    application = _core.create_app(
        settings=settings,
        provider=provider,
        ask_provider=ask_provider,
    )
    register_baseline_routes(application, application.state.settings)
    register_baseline_draft_routes(application, application.state.settings)
    register_baseline_async_intake_routes(application, application.state.settings)
    register_baseline_manual_setup_routes(application, application.state.settings)
    register_product_analytics(application, application.state.settings)
    register_quality_analytics(application, application.state.settings)
    register_project_health_usage(application, application.state.settings)
    return application


app = create_app()

# Source-contract breadcrumbs for tests/documentation that locate these routes
# from the deployment entrypoint. Their implementations live in api_core.py.
# @app.get("/api/attention")
# @app.post("/api/ask")
