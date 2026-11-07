"""Nov 5 cleanup, step 5: state-product-health.js used to wrap history.replaceState so its quality-analytics section
re-rendered whenever the page's load() happened to update the URL. load() now calls STATE_PRODUCT_HEALTH.refreshQuality()
after each render, and replaceState is the browser's own again.

Real page, served locally; its API calls go to the real local backend with the demo seed. No model calls.
"""
import http.server
import threading
from pathlib import Path

from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_browser_user_flows import _launch_chromium

FRONTEND = Path(__file__).resolve().parents[1] / 'implementation-context-prototype'
API = 'http://127.0.0.1:9'


class _RefusingProvider:
    name = "refusing"
    model_identifier = "refusing-v1"

    def interpret(self, *, context, evidence):
        raise AssertionError("no model calls in this test")


def test_quality_section_follows_each_load_without_patching_history(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'state.db'), cors_origins=[], demo_bootstrap=True)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(FRONTEND), **kwargs)

        def log_message(self, *args, **kwargs):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    quality_calls = []
    with TestClient(create_app(settings, provider=_RefusingProvider())) as client, sync_playwright() as pw:
        def api(route):
            path = route.request.url[len(API):]
            if path.startswith('/api/admin/quality-analytics'):
                quality_calls.append(path)
            response = client.get(path)
            route.fulfill(status=response.status_code, content_type='application/json', body=response.text,
                          headers={'Access-Control-Allow-Origin': '*'})

        browser = _launch_chromium(pw)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.set_default_timeout(15000)
            page.add_init_script(f"window.STATE_API_BASE='{API}';")
            page.route(f'{API}/**', api)
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/state-product-health.html')
            page.wait_for_selector('#qualityAnalyticsExtra')
            assert page.evaluate("history.replaceState.toString().includes('[native code]')")

            project_id = page.evaluate("[...document.querySelectorAll('#scopeSelect option')].map(o => o.value).find(v => v)")
            assert project_id
            before = len(quality_calls)
            page.select_option('#scopeSelect', project_id)
            page.wait_for_function(f"new URLSearchParams(location.search).get('project') === '{project_id}'")
            page.wait_for_function(f"document.querySelectorAll('#qualityAnalyticsExtra').length === 1")
            page.wait_for_timeout(300)
            assert any(f'project_id={project_id}' in call for call in quality_calls[before:])
            assert page.evaluate("document.querySelectorAll('#qualityAnalyticsExtra').length") == 1
        finally:
            browser.close()
            server.shutdown()
