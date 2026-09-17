"""Deployment entry point for State with Baseline Setup composed in.

The original FastAPI implementation lives in ``api_core``. Keeping this wrapper
as ``api.py`` means Render's existing ``uvicorn api:app`` start command loads the
Baseline Setup lifecycle without any environment or service configuration change.

``api`` remains an alias of the core module after composition so existing imports
and test monkeypatches still target the globals used by State's route handlers.
"""
from __future__ import annotations

import sys

import api_core as _core
import baseline_async_intake as _baseline_async_intake
from baseline_dogfood_fixes import install_baseline_dogfood_fixes
from baseline_draft import register_baseline_draft_routes
from baseline_fact_recovery import install_baseline_fact_recovery
from baseline_manual_setup import register_baseline_manual_setup_routes
from baseline_prompt_hardening import install_baseline_prompt_hardening
from baseline_review_visibility import install_baseline_review_visibility
from baseline_setup import install_baseline_extensions, register_baseline_routes
from baseline_resilience import install_baseline_resilience
from product_analytics import register_product_analytics
from quality_analytics_api import register_quality_analytics

# Patch the authority-bearing runtime hooks before constructing the deployment
# app. Baseline Setup still uses the existing Review/human authorization path.
install_baseline_extensions(_core)
# The async module imports the canonical pipeline before composition. Point its
# background worker at the composed hook so Baseline area/topic metadata is
# persisted exactly like synchronous Evidence intake.
_baseline_async_intake.process_evidence = _core.process_evidence
install_baseline_prompt_hardening()
# Dogfood fixes need to patch the source splitter before resilience captures it,
# and make queued Baseline work/delete cleanup safe before routes are registered.
install_baseline_dogfood_fixes(_core, _baseline_async_intake)
install_baseline_review_visibility(_core)
install_baseline_resilience()
install_baseline_fact_recovery()
_core_create_app = _core.create_app


def create_app(settings=None, provider=None, ask_provider=None):
    application = _core_create_app(
        settings=settings,
        provider=provider,
        ask_provider=ask_provider,
    )
    register_baseline_routes(application, application.state.settings)
    register_baseline_draft_routes(application, application.state.settings)
    _baseline_async_intake.register_baseline_async_intake_routes(application, application.state.settings)
    register_baseline_manual_setup_routes(application, application.state.settings)
    register_product_analytics(application, application.state.settings)
    register_quality_analytics(application, application.state.settings)
    return application


# Keep the historical public module contract intact: callers that import or
# monkeypatch ``api`` should operate on the same globals the core route closures
# use, not on copied re-exports from a wrapper module.
_core.create_app = create_app
_core.app = create_app()

# Source-contract breadcrumbs for tests/documentation that locate these routes
# from the deployment entrypoint. Their implementations live in api_core.py.
# @app.get("/api/attention")
# @app.post("/api/ask")

sys.modules[__name__] = _core
