"""Nov 5 cleanup, step 3: six modules used to watch #viewRoot or the sidebar with MutationObservers to learn that a
view had been drawn. context-app.js now announces each drawn view with a 'state:view-rendered' event (settings is
announced by navigation's render() and by context-settings.js), and those modules listen for it. These checks drive
the real app with a stubbed API:

- every sidebar view announces itself exactly once per navigation, with its own name;
- Settings loads again each time you arrive (one Slack status request per arrival, none while elsewhere);
- the browser history entry follows the view (context-history.js);
- the Workspace tour banner is present after returning to Workspace (context-ask-followup.js).

No backend or model calls.
"""
import http.server
import json
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_browser_user_flows import _launch_chromium

FRONTEND = Path(__file__).resolve().parents[1] / 'implementation-context-prototype'
API = 'http://127.0.0.1:9'

RECORD_EVENTS_JS = """
  window.__viewEvents = [];
  document.addEventListener('state:view-rendered', e => window.__viewEvents.push(e.detail && e.detail.view));
"""


@pytest.fixture(scope='module')
def app():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(FRONTEND), **kwargs)

        def log_message(self, *args, **kwargs):
            pass

        def do_GET(self):
            if self.path.split('?')[0].endswith('/api/state-config.js'):
                body = f"window.STATE_API_BASE='{API}';".encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    requests = []

    def api(route):
        path = route.request.url[len(API):].split('?')[0]
        requests.append(path)
        if path == '/api/integrations/slack/health':
            body, status = {'connected': False}, 200
        elif path == '/api/integrations/slack/channels':
            body, status = {'items': []}, 200
        else:
            body, status = {'detail': 'stub'}, 503
        route.fulfill(status=status, content_type='application/json', body=json.dumps(body),
                      headers={'Access-Control-Allow-Origin': '*'})

    with sync_playwright() as pw:
        browser = _launch_chromium(pw)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.set_default_timeout(15000)
            page.add_init_script(RECORD_EVENTS_JS)
            page.route(f'{API}/**', api)
            url = f'http://127.0.0.1:{server.server_address[1]}/index.html'
            page.goto(url)
            page.wait_for_selector('#viewRoot .overview')
            page.app_url = url
            yield page, requests
        finally:
            browser.close()
            server.shutdown()


def _go(page, view):
    page.evaluate("window.__viewEvents.length = 0")
    page.evaluate(f"document.querySelector('.sidebar-nav [data-view=\"{view}\"]').click()")
    page.wait_for_timeout(300)
    return page.evaluate("window.__viewEvents.slice()")


@pytest.mark.parametrize('view', ['notes', 'history', 'open-items', 'overview'])
def test_each_view_announces_itself_once(app, view):
    page, _ = app
    events = _go(page, view)
    assert events == [view]


def test_settings_loads_on_each_arrival_only(app):
    page, requests = app
    health = lambda: requests.count('/api/integrations/slack/health')
    before = health()
    _go(page, 'settings')
    page.wait_for_selector('#settings-slack')
    after_first = health()
    assert after_first == before + 1
    _go(page, 'notes')
    page.wait_for_timeout(300)
    assert health() == after_first
    _go(page, 'settings')
    page.wait_for_selector('#settings-slack')
    assert health() == after_first + 1


def test_browser_history_follows_the_view(app):
    page, _ = app
    _go(page, 'notes')
    page.wait_for_function("history.state && history.state.stateView === 'notes'")
    _go(page, 'history')
    page.wait_for_function("history.state && history.state.stateView === 'history'")


def test_workspace_tour_banner_is_back_after_returning(app):
    page, _ = app
    _go(page, 'notes')
    _go(page, 'overview')
    page.wait_for_timeout(200)
    assert page.evaluate("document.querySelectorAll('#viewRoot .state-reviewer-guide').length") == 1


def test_opening_the_page_on_settings_loads_it_once(app):
    page, requests = app
    page.goto('about:blank')
    start = len(requests)
    page.goto(page.app_url + '#settings')
    page.wait_for_selector('#settings-slack')
    page.wait_for_timeout(1500)
    assert requests[start:].count('/api/integrations/slack/health') == 1


