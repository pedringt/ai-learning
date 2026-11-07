"""Nov 5 cleanup, step 4: two page-wide MutationObservers were replaced.

- state-shell.js locked the page behind the open Ask drawer from an observer that ran getComputedStyle on every DOM
  change. openAskDrawer()/closeAskDrawer() now lock and unlock it themselves.
- On phones the drawer's close button (context-ask-controls.js) used to set drawer.hidden directly, bypassing
  closeAskDrawer(): the app still thought the drawer was open. It now goes through closeAskDrawer().
- Closing Ask never cancelled the request on any width: context-ask-followup.js's wrappers dropped the abort signal
  that closeAskDrawer() aborts (Sept 14's close-to-cancel fix, afdc245, sat behind them). They forward it now.
- context-layout.js watched the whole document to keep the phone help footer, the Current State subnav pin and the
  desktop help card in step. It now runs on each drawn view, on resize, and (help card) on sidebar resize.

Real app folder, API stubbed at the network layer; the Ask stream is held open and never answered. No backend or
model calls.
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

TRACK_ASK_SIGNALS_JS = """
  window.__askSignals = [];
  const realFetch = window.fetch;
  window.fetch = (url, options = {}) => {
    if (/\\/api\\/ask/.test(String(url)) && options.signal) window.__askSignals.push(options.signal);
    return realFetch(url, options);
  };
"""


@pytest.fixture(scope='module')
def browser_and_url():
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
    with sync_playwright() as pw:
        browser = _launch_chromium(pw)
        try:
            yield browser, f'http://127.0.0.1:{server.server_address[1]}/index.html'
        finally:
            browser.close()
            server.shutdown()


def _open(browser_and_url, width, height, ask_answer=None):
    browser, url = browser_and_url
    page = browser.new_page(viewport={'width': width, 'height': height})
    page.set_default_timeout(10000)
    page.add_init_script(TRACK_ASK_SIGNALS_JS)

    def api(route):
        path = route.request.url[len(API):].split('?')[0]
        if path == '/api/ask/stream' and ask_answer is not None:
            body = 'event: final\ndata: ' + json.dumps({'answer': ask_answer}) + '\n\n'
            return route.fulfill(status=200, content_type='text/event-stream', body=body,
                                 headers={'Access-Control-Allow-Origin': '*'})
        if path.startswith('/api/ask'):
            return  # hold the Ask request open: an answer that is still streaming
        route.fulfill(status=503, content_type='application/json', body=json.dumps({'detail': 'stub'}),
                      headers={'Access-Control-Allow-Origin': '*'})

    page.route(f'{API}/**', api)
    page.goto(url)
    page.wait_for_selector('#askStateLauncher')
    return page


BODY_LOCK_JS = "({position: document.body.style.position, top: document.body.style.top, overflow: document.body.style.overflow})"


def test_desktop_drawer_locks_the_page_and_restores_scroll_on_close(browser_and_url):
    page = _open(browser_and_url, 1280, 700)
    try:
        page.evaluate("document.body.style.minHeight='3000px'; window.scrollTo(0, 400)")
        page.evaluate("document.getElementById('askStateLauncher').click()")
        assert page.evaluate(BODY_LOCK_JS) == {'position': 'fixed', 'top': '-400px', 'overflow': 'hidden'}
        page.evaluate("document.querySelector('#askStateDrawer [data-review-batch-action=\"close-ask\"]').click()")
        assert page.evaluate(BODY_LOCK_JS) == {'position': '', 'top': '', 'overflow': ''}
        assert page.evaluate("window.scrollY") == 400
    finally:
        page.close()


def test_phone_close_cancels_a_streaming_ask_and_unlocks_the_page(browser_and_url):
    page = _open(browser_and_url, 390, 720)
    try:
        page.evaluate("document.getElementById('askStateLauncher').click()")
        page.fill('#askStateDrawerInput', 'What is the launch date?')
        page.evaluate("document.querySelector('#askStateDrawer .ask-state-drawer-form button[type=submit]').click()")
        page.wait_for_function("window.__askSignals.length > 0")
        assert page.evaluate("window.__askSignals.some(s => !s.aborted)")
        page.evaluate("""document.querySelector('#askStateDrawer .ask-state-drawer-close')
                         .dispatchEvent(new PointerEvent('pointerup', {bubbles: true, cancelable: true}))""")
        assert page.evaluate("document.getElementById('askStateDrawer').hidden") is True
        assert page.evaluate("document.body.classList.contains('ask-state-drawer-open')") is False
        assert page.evaluate("window.__askSignals.every(s => s.aborted)")
        assert page.evaluate(BODY_LOCK_JS) == {'position': '', 'top': '', 'overflow': ''}
        assert page.evaluate("document.getElementById('askStateLauncher').classList.contains('is-hidden')") is False
    finally:
        page.close()


@pytest.mark.parametrize('view', ['overview', 'notes', 'history', 'project-overview'])
def test_phone_views_each_get_one_help_footer(browser_and_url, view):
    page = _open(browser_and_url, 390, 720)
    try:
        page.evaluate(f"document.querySelector('[data-view=\"{view}\"]').click()")
        page.wait_for_function("document.querySelectorAll('#viewRoot .state-mobile-help').length === 1")
    finally:
        page.close()


def test_current_state_subnav_shows_and_pins_on_phones(browser_and_url):
    page = _open(browser_and_url, 390, 720)
    try:
        page.evaluate("document.querySelector('[data-view=\"project-overview\"]').click()")
        page.wait_for_function("!document.getElementById('mobileProjectSubnav').hidden")
        page.wait_for_selector('.mobile-subnav-sentinel', state='attached')
        page.evaluate("document.body.style.minHeight='4000px'; window.scrollTo(0, 2000)")
        page.wait_for_function("document.getElementById('mobileProjectSubnav').classList.contains('is-pinned')")
    finally:
        page.close()


def test_desktop_help_card_tracks_the_sidebar_width(browser_and_url):
    page = _open(browser_and_url, 1280, 800)
    try:
        page.evaluate("document.querySelector('.app-sidebar').style.width='300px'")
        page.wait_for_function("""(() => { const s = document.querySelector('.app-sidebar').getBoundingClientRect();
            const c = document.querySelector('.app-sidebar > .state-help-card');
            return c && c.style.width === Math.round(s.width - 36) + 'px'; })()""")
    finally:
        page.close()


def test_desktop_close_cancels_a_streaming_ask(browser_and_url):
    page = _open(browser_and_url, 1280, 800)
    try:
        page.evaluate("document.getElementById('askStateLauncher').click()")
        page.fill('#askStateDrawerInput', 'What is the launch date?')
        page.evaluate("document.querySelector('#askStateDrawer .ask-state-drawer-form button[type=submit]').click()")
        page.wait_for_function("window.__askSignals.length > 0")
        assert page.evaluate("window.__askSignals.some(s => !s.aborted)")
        page.evaluate("document.querySelector('#askStateDrawer [data-review-batch-action=\"close-ask\"]').click()")
        assert page.evaluate("window.__askSignals.every(s => s.aborted)")
    finally:
        page.close()


SUGGESTING_ANSWER = {
    'job': 'answer', 'headline': 'The vendor retention term is not settled',
    'summary': 'State has no accepted retention term for the vendor yet.',
    'sections': [], 'suggested_question': 'What retention term will the vendor agree to?',
}


def test_question_handoff_card_follows_each_answer_render(browser_and_url):
    """Step 6a: context-ask-question-handoff.js adds its card when renderDrawerResult() announces an Ask result,
    instead of observing the result element. The card appears once per answer and goes when the answer is cleared."""
    page = _open(browser_and_url, 1280, 800, ask_answer=SUGGESTING_ANSWER)
    try:
        page.evaluate("document.getElementById('askStateLauncher').click()")
        page.fill('#askStateDrawerInput', 'What is the vendor retention term?')
        page.evaluate("document.querySelector('#askStateDrawer .ask-state-drawer-form button[type=submit]').click()")
        page.wait_for_selector('#askStateDrawerResult .ask-live-answer [data-ask-question-handoff-card="suggest"]')
        page.wait_for_timeout(300)
        assert page.evaluate("document.querySelectorAll('#askStateDrawerResult [data-ask-question-handoff-card]').length") == 1
        assert 'What retention term will the vendor agree to?' in page.inner_text('#askStateDrawerResult [data-ask-question-handoff-card]')
        # Asking again redraws the answer; the card is redrawn with it, still exactly once.
        page.evaluate("document.querySelector('#askStateDrawer .ask-state-drawer-form button[type=submit]').click()")
        page.wait_for_timeout(500)
        assert page.evaluate("document.querySelectorAll('#askStateDrawerResult [data-ask-question-handoff-card]').length") == 1
    finally:
        page.close()


def test_ask_launcher_is_anchored_to_each_drawn_view(browser_and_url):
    """Step 6a: the launcher's right offset follows the drawn view's right edge; it used to be recomputed by a
    document-wide MutationObserver, now on each 'state:view-rendered'."""
    page = _open(browser_and_url, 1600, 900)
    try:
        expected = """(() => { const a = document.querySelector('.view-root')?.firstElementChild; if (!a) return null;
            return Math.max(22, Math.round(innerWidth - a.getBoundingClientRect().right - 22)) + 'px'; })()"""
        for view in ('notes', 'history', 'overview'):
            page.evaluate(f"document.querySelector('.sidebar-nav [data-view=\"{view}\"]').click()")
            page.wait_for_function(f"document.getElementById('askStateLauncher').style.right === {expected}")
    finally:
        page.close()
