"""Nov 18 production QA: three interaction bugs, checked in a real browser against the local API (no model calls).

1. "Add Evidence" moved ~106px when the "Exploring State?" guide was inserted after Evidence loaded, so a click aimed
   at it landed on empty space. Its position must not change when loading finishes.
2. A second Enter while the same question was still being answered sent a second Ask request (the first kept running).
3. Closing the drawer mid-answer cancelled the request but left "Finding the answer…" on screen when reopened.
"""
from fastapi.testclient import TestClient
import pytest

from api import Settings, create_app
from test_ask_open_work import OneRecordAsk
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_preload_project_header_browser import _hydrated, _open_page


@pytest.fixture
def client(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'ui.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider(), ask_provider=OneRecordAsk())) as c:
        yield c


def _slow_asks(page, ms):
    """Hold every /api/ask* response for `ms`, and count the requests sent."""
    page.evaluate("""ms=>{window.__asks=0;const real=window.fetch;window.fetch=async(url,options={})=>{
        const path=new URL(url,window.STATE_API_BASE).pathname;
        if(path.startsWith('/api/ask')){window.__asks++;if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
          await new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'))})});}
        return real(url,options);};}""", ms)


def _submit(page, query):
    page.locator('#askStateDrawerInput').fill(query)
    page.evaluate("document.querySelector('.ask-state-drawer-form').requestSubmit()")


def test_add_evidence_does_not_move_when_loading_finishes(client):
    page, browser, _requests, errors, pw = _open_page(client, hold_bootstrap=True)
    try:
        page.wait_for_selector('[data-action="add-info"]:visible')
        before = page.locator('[data-action="add-info"]:visible').first.bounding_box()
        page.evaluate('window.__releaseBootstrap()')
        _hydrated(page)
        page.wait_for_timeout(300)
        after = page.locator('[data-action="add-info"]:visible').first.bounding_box()
        assert abs(after['y'] - before['y']) < 2, (before, after)
        assert page.locator('.state-reviewer-guide[data-guide-stage="pending"]').count() == 0, 'the placeholder is replaced'
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_a_second_enter_on_the_same_question_sends_no_second_request(client):
    page, browser, _requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        _slow_asks(page, 1500)
        page.locator('#askStateLauncher').click()
        _submit(page, 'What is the pilot budget?')
        page.wait_for_timeout(150)
        page.evaluate("document.querySelector('.ask-state-drawer-form').requestSubmit()")
        page.wait_for_timeout(150)
        assert page.evaluate('window.__asks') == 1
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_closing_mid_answer_leaves_no_loading_state(client):
    page, browser, _requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        _slow_asks(page, 3000)
        page.locator('#askStateLauncher').click()
        _submit(page, 'What is the pilot budget?')
        page.wait_for_timeout(200)
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        page.locator('#askStateLauncher').click()
        page.wait_for_timeout(200)
        assert page.locator('#askStateDrawerResult .ask-live-loading').count() == 0
        assert errors == []
    finally:
        browser.close(); pw.stop()
