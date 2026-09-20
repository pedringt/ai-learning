"""Issue #229: State must look the same in a dark-preferring browser as in a light one.

The app's styling is written for light mode and its theme toggle is hidden, but
`state-shell.js` used to add the `v88-dark` class to <body> when the browser
prefers dark (or when the portfolio, on the same origin at the old path, had saved
`ai-cs-theme=dark`). That switched a few rules to dark (the active sidebar item, the
help card) and switched the `body:not(.v88-dark)` light polish rules off, leaving
the app half-dark. Another module (`forceLightState()` in context-feedback-pass-3.js)
tried to remove the class, but only when its own `run()` happened to execute, so
whether the class survived was a race. The tests therefore assert the class is never
added at all (a MutationObserver installed before any page script), not just that it
is absent at some later moment.

Serves the real app folder over a local HTTP server and compares a dark-preferring
context with a light one. No backend or model calls: the UI shell renders without one.
"""
import http.server
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_browser_user_flows import _launch_chromium

FRONTEND = Path(__file__).resolve().parents[1] / 'implementation-context-prototype'

# Colors only, keyed by position and tag. Class names are deliberately left out: two of the
# app's modules rename an Ask button in a timing-dependent order, which is unrelated to theme.
SNAPSHOT_JS = """() => [...document.querySelectorAll('body *')]
  .filter(e => e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE')
  .map((e, i) => { const c = getComputedStyle(e);
    return [i, e.tagName, c.backgroundColor, c.color, c.borderTopColor, c.borderLeftColor].join('|'); })"""

WATCH_DARK_CLASS_JS = """
  window.__darkClassEverSeen = false;
  new MutationObserver(records => {
    for (const r of records) if (r.target.classList && r.target.classList.contains('v88-dark')) window.__darkClassEverSeen = true;
  }).observe(document, {attributes: true, subtree: true, attributeFilter: ['class']});
"""

SETTLE_JS = """async () => {
  const count = () => document.querySelectorAll('body *').length;
  let last = -1, stable = 0;
  for (let i = 0; i < 40 && stable < 6; i++) {
    await new Promise(r => setTimeout(r, 400));
    const c = count(); stable = c === last ? stable + 1 : 0; last = c;
  }
}"""


@pytest.fixture(scope='module')
def app_url():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(FRONTEND), **kwargs)

        def log_message(self, *args, **kwargs):
            pass

        def do_GET(self):
            # api/state-config.js is a Vercel function (ESM); serve what it would return instead.
            if self.path.split('?')[0].endswith('/api/state-config.js'):
                body = b"window.STATE_API_BASE='http://127.0.0.1:9';"
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_address[1]}/index.html'
    server.shutdown()


def _load(browser, url, *, color_scheme, saved_theme=None):
    context = browser.new_context(color_scheme=color_scheme, viewport={'width': 1280, 'height': 760})
    if saved_theme:
        context.add_init_script(f"try{{localStorage.setItem('ai-cs-theme','{saved_theme}')}}catch(e){{}}")
    context.add_init_script(WATCH_DARK_CLASS_JS)
    page = context.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator('.app-sidebar').wait_for()
    page.evaluate(SETTLE_JS)
    return context, page, errors


@pytest.fixture
def browser():
    with sync_playwright() as pw:
        b = _launch_chromium(pw)
        yield b
        b.close()


def test_dark_preferring_browser_never_gets_the_dark_class(browser, app_url):
    context, page, errors = _load(browser, app_url, color_scheme='dark')
    try:
        assert page.evaluate("matchMedia('(prefers-color-scheme: dark)').matches") is True
        assert page.evaluate("document.body.classList.contains('v88-dark')") is False
        assert page.evaluate("window.__darkClassEverSeen") is False, 'the dark class was added, even if removed later'
        assert errors == []
    finally:
        context.close()


def test_a_theme_saved_by_the_portfolio_on_the_same_origin_is_ignored(browser, app_url):
    context, page, errors = _load(browser, app_url, color_scheme='light', saved_theme='dark')
    try:
        assert page.evaluate("localStorage.getItem('ai-cs-theme')") == 'dark'
        assert page.evaluate("document.body.classList.contains('v88-dark')") is False
        assert page.evaluate("window.__darkClassEverSeen") is False, 'the dark class was added, even if removed later'
        assert errors == []
    finally:
        context.close()


def test_app_looks_the_same_in_dark_and_light_browsers(browser, app_url):
    """The issue's acceptance test: every element's colors match, not just the two that were noticed."""
    light_ctx, light_page, _ = _load(browser, app_url, color_scheme='light')
    dark_ctx, dark_page, _ = _load(browser, app_url, color_scheme='dark')
    try:
        light = light_page.evaluate(SNAPSHOT_JS)
        dark = dark_page.evaluate(SNAPSHOT_JS)
        assert len(light) == len(dark) > 50
        differences = [(a, b) for a, b in zip(light, dark) if a != b]
        assert differences == [], f'{len(differences)} elements differ; first: {differences[:2]}'
        # The two things that were visibly wrong: the active sidebar item and the help card.
        active = 'getComputedStyle(document.querySelector(".sidebar-nav .active")).backgroundColor'
        assert dark_page.evaluate(active) == light_page.evaluate(active)
    finally:
        light_ctx.close(); dark_ctx.close()
