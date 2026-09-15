"""Regression coverage for Render's real State API entry point."""
from api import app, create_app


def _route_paths(application):
    return {route.path for route in application.routes}


def test_deployment_entrypoint_exposes_baseline_routes():
    paths = _route_paths(app)
    assert "/api/baseline" in paths
    assert "/api/baseline/finish" in paths


def test_factory_entrypoint_exposes_baseline_routes():
    application = create_app()
    paths = _route_paths(application)
    assert "/api/baseline" in paths
    assert "/api/baseline/finish" in paths
