"""#613 (Paige, Nov 4, Option A): the Ask drawer is a real modal dialog on phones and a non-modal side panel on
desktop. Focus moves in on open and returns to the opener on close at every width; on phones Tab stays inside
and the page behind is inert. Checked by behaviour (focus, Tab, inert, accessibility tree), not attributes alone.
No question is submitted, so no model calls.
"""
from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STATE_URL = (ROOT / "implementation-context-prototype" / "index.html").as_uri()
_FALLBACKS = ("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
IN_DRAWER = "() => !!document.activeElement && !!document.activeElement.closest('#askStateDrawer')"
ACTIVE_ID = "() => document.activeElement && document.activeElement.id"


def _launch(pw):
    try:
        return pw.chromium.launch(headless=True, args=["--no-sandbox"])
    except PlaywrightError:
        for candidate in _FALLBACKS:
            if Path(candidate).exists():
                return pw.chromium.launch(headless=True, executable_path=candidate, args=["--no-sandbox"])
        raise


def _page(browser, width):
    page = browser.new_page(viewport={"width": width, "height": 812})
    page.goto(STATE_URL)
    page.wait_for_selector("#askStateLauncher", state="visible")
    return page


@pytest.mark.parametrize("width", [375, 390])
def test_phone_drawer_is_a_modal_dialog(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = _page(browser, width)
        page.evaluate("window.scrollTo(0, 120)")
        scroll_before = page.evaluate("window.scrollY")
        page.locator("#askStateLauncher").click()
        assert page.evaluate(IN_DRAWER), "focus did not move into the drawer"
        dialog = page.get_by_role("dialog", name="Ask State")
        assert dialog.count() == 1, "no dialog named Ask State in the accessibility tree"
        assert page.evaluate("document.querySelector('main.app-shell').inert")
        for key in ["Tab"] * 15 + ["Shift+Tab"] * 15:
            page.keyboard.press(key)
            assert page.evaluate(IN_DRAWER), f"{key} left the drawer"
        # Escape from the input closes it and focus returns to the launcher.
        page.locator("#askStateDrawerInput").focus()
        page.keyboard.press("Escape")
        assert page.locator("#askStateDrawer").is_hidden()
        assert page.evaluate(ACTIVE_ID) == "askStateLauncher"
        assert not page.evaluate("document.querySelector('main.app-shell').inert")
        assert page.get_by_role("dialog", name="Ask State").count() == 0
        assert page.evaluate("window.scrollY") == scroll_before
        # Keyboard open (Enter on the focused launcher), then close with the × button.
        page.keyboard.press("Enter")
        assert page.evaluate(IN_DRAWER)
        page.locator(".ask-state-drawer-close").click()
        assert page.locator("#askStateDrawer").is_hidden()
        assert page.evaluate(ACTIVE_ID) == "askStateLauncher"
    finally:
        browser.close(); pw.stop()


def test_desktop_drawer_moves_focus_but_does_not_trap_it():
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = _page(browser, 1280)
        page.locator("#askStateLauncher").click()
        assert page.evaluate(IN_DRAWER)
        assert not page.evaluate("document.querySelector('main.app-shell').inert")
        assert page.get_by_role("dialog", name="Ask State").count() == 0
        left = False
        for _ in range(40):
            page.keyboard.press("Tab")
            if not page.evaluate(IN_DRAWER):
                left = True
                break
        assert left, "focus is trapped on desktop"
        page.keyboard.press("Escape")
        assert page.evaluate(ACTIVE_ID) == "askStateLauncher"
    finally:
        browser.close(); pw.stop()


def test_focus_returns_to_another_opener_or_the_launcher():
    """Acceptance 4: opened from another entry point, focus goes back there; if it is gone, to the launcher."""
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = _page(browser, 375)
        page.evaluate("""() => { const b = document.createElement('button'); b.id = 'otherOpener'; b.textContent = 'Try Ask State';
          b.dataset.reviewBatchAction = 'open-ask'; document.querySelector('main').prepend(b); }""")
        page.locator("#otherOpener").click()
        assert page.evaluate(IN_DRAWER)
        page.keyboard.press("Escape")
        assert page.evaluate(ACTIVE_ID) == "otherOpener"
        page.locator("#otherOpener").click()
        page.evaluate("document.getElementById('otherOpener').remove()")
        page.keyboard.press("Escape")
        assert page.evaluate(ACTIVE_ID) == "askStateLauncher"
    finally:
        browser.close(); pw.stop()
