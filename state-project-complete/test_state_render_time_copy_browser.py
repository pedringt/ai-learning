"""Nov 5 cleanup, step 2: three wording patches in state-shell.js used to rewrite text after render from a
whole-page MutationObserver. The renderers now produce the final wording themselves, so these checks render the
real app and assert the visible text directly:

- the help dialog says "people authorize", not "people decide";
- Slack Settings has an "Approved channels" heading and "Disable channel" / "Enable channel" buttons;
- the Ask launcher reads "✦ Ask State", with exactly one sparkle.

Serves the real app folder and stubs the API at the network layer. No backend or model calls.
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

SLACK = {
    '/api/integrations/slack/health': {'connected': True, 'workspace_name': 'Acme', 'pending_checkpoints': 0},
    '/api/integrations/slack/channels': {'items': [
        {'id': 'row_on', 'channel_id': 'C1', 'channel_name': 'state-test', 'enabled': True, 'last_event_at': None},
        {'id': 'row_off', 'channel_id': 'C2', 'channel_name': 'launch', 'enabled': False, 'last_event_at': None},
    ]},
}


@pytest.fixture(scope='module')
def page():
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

    def api(route):
        path = route.request.url[len(API):].split('?')[0]
        if path in SLACK:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(SLACK[path]),
                          headers={'Access-Control-Allow-Origin': '*'})
        else:
            route.fulfill(status=503, content_type='application/json', body='{"detail":"stub"}',
                          headers={'Access-Control-Allow-Origin': '*'})

    with sync_playwright() as pw:
        browser = _launch_chromium(pw)
        try:
            p = browser.new_page(viewport={'width': 1280, 'height': 900})
            p.route(f'{API}/**', api)
            p.goto(f'http://127.0.0.1:{server.server_address[1]}/index.html')
            p.wait_for_selector('#askStateLauncher')
            yield p
        finally:
            browser.close()
            server.shutdown()


def test_ask_launcher_has_exactly_one_sparkle(page):
    assert page.inner_text('#askStateLauncher').strip() == '✦ Ask State'


def test_help_dialog_says_people_authorize(page):
    page.evaluate("document.querySelector('[data-action=\"show-demo-help\"]').click()")
    principle = page.wait_for_selector('.demo-flow-principle')
    assert principle.inner_text().strip() == 'AI interprets → software enforces → people authorize'
    page.evaluate("document.querySelector('[data-action=\"close-dialog\"]')?.click()")


def test_slack_settings_show_channel_heading_and_full_button_labels(page):
    page.evaluate("location.hash = '#settings'")
    page.wait_for_selector('[data-settings-action="toggle-channel"][data-channel-row-id="row_off"]')
    section = page.query_selector('#settings-slack')
    assert len(section.query_selector_all('.settings-channel-heading')) == 1
    assert 'Approved channels' in section.query_selector('.settings-channel-heading').inner_text()
    on = section.query_selector('[data-channel-row-id="row_on"]')
    off = section.query_selector('[data-channel-row-id="row_off"]')
    assert on.inner_text().strip() == 'Disable channel'
    assert on.get_attribute('aria-label') == 'Disable #state-test'
    assert off.inner_text().strip() == 'Enable channel'
    assert off.get_attribute('aria-label') == 'Enable #launch'
