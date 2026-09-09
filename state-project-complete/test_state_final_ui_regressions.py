from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STATE_URL = (ROOT / "implementation-context-prototype" / "index.html").as_uri()

_CHROMIUM_FALLBACKS = (
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)


def _launch(pw):
    try:
        return pw.chromium.launch(headless=True, args=["--no-sandbox"])
    except PlaywrightError:
        for candidate in _CHROMIUM_FALLBACKS:
            if Path(candidate).exists():
                return pw.chromium.launch(headless=True, executable_path=candidate, args=["--no-sandbox"])
        raise


def _page(width=1200, height=900):
    pw = sync_playwright().start()
    browser = _launch(pw)
    page = browser.new_page(viewport={"width": width, "height": height})
    page.goto(STATE_URL)
    page.wait_for_function("document.getElementById('state-final-feedback') !== null")
    return pw, browser, page


def test_final_feedback_layer_is_loaded_by_real_state_entrypoint():
    pw, browser, page = _page()
    try:
        assert page.locator("#state-final-feedback").count() == 1
        # Regression: context-feedback-pass-4.js existed in the repo but was not
        # loaded by index.html, so several 'fixed' bugs kept reappearing live.
        bg = page.locator(".prototype-productbar").evaluate("e => getComputedStyle(e).backgroundColor")
        assert bg == "rgb(219, 231, 248)"
    finally:
        browser.close(); pw.stop()


def test_ask_answer_has_one_control_and_reset_restores_discovery_ui():
    pw, browser, page = _page()
    try:
        page.locator("#askStateLauncher").click()
        page.evaluate("""() => {
          const drawer=document.getElementById('askStateDrawer');
          const input=document.getElementById('askStateDrawerInput');
          const result=document.getElementById('askStateDrawerResult');
          input.value='Who is the billing contact?';
          result.innerHTML='<div class="ask-live-answer"><h2>Billing contact</h2><p>Example answer</p></div>';
          drawer.classList.add('has-answer');
        }""")
        page.wait_for_timeout(40)

        reset = page.locator("#askStateDrawer .state-ask-reset")
        assert reset.is_visible()
        assert not page.locator("#askStateDrawer .ask-state-drawer-form button[type='submit']").is_visible()
        assert page.locator("#askStateDrawer .state-ask-clear").count() == 1
        assert not page.locator("#askStateDrawer .state-ask-clear").is_visible()

        reset.click()
        page.wait_for_timeout(40)
        assert page.locator("#askStateDrawerInput").input_value() == ""
        assert page.locator("#askStateDrawerResult").inner_text() == ""
        assert page.locator("#askStateDrawer .ask-state-starters").is_visible()
        assert page.locator("#askStateDrawer .ask-state-drawer-form button[type='submit']").is_visible()
    finally:
        browser.close(); pw.stop()


def test_mobile_ask_starters_are_full_width_and_drawer_can_close():
    pw, browser, page = _page(390, 720)
    try:
        page.locator("#askStateLauncher").click()
        drawer = page.locator("#askStateDrawer")
        assert drawer.is_visible()
        first = page.locator("#askStateDrawer .ask-state-starters button").first.bounding_box()
        assert first and first["width"] > 300

        page.locator("#askStateDrawer .ask-state-drawer-close").click()
        page.wait_for_timeout(30)
        assert page.locator("#askStateDrawer").evaluate("e => e.hidden") is True
    finally:
        browser.close(); pw.stop()


def test_coarse_stale_answer_warning_is_not_surfaced():
    pw, browser, page = _page()
    try:
        page.locator("#askStateLauncher").click()
        page.evaluate("""() => {
          const result=document.getElementById('askStateDrawerResult');
          result.innerHTML='<div class="ask-state-stale"><span>Current State has changed since this answer was generated.</span><button>Refresh answer</button></div>';
        }""")
        assert not page.locator("#askStateDrawer .ask-state-stale").is_visible()
    finally:
        browser.close(); pw.stop()


def test_history_entries_have_no_left_timeline_rail_or_hover_transform():
    pw, browser, page = _page()
    try:
        page.locator('.sidebar-nav [data-view="history"]').click()
        entry = page.locator(".history-page .history-entry").first
        entry.wait_for()
        values = entry.evaluate("""e => ({
          borderLeft:getComputedStyle(e).borderLeftWidth,
          transform:getComputedStyle(e).transform,
          before:getComputedStyle(e,'::before').display,
          after:getComputedStyle(e,'::after').display
        })""")
        assert values["borderLeft"] == "0px"
        assert values["transform"] == "none"
        assert values["before"] == "none"
        assert values["after"] == "none"
    finally:
        browser.close(); pw.stop()
