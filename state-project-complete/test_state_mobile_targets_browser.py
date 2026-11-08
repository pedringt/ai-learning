"""#612 (Nov 8): on phones the Ask input is 16px (iOS Safari zooms a focused input under 16px) and small text links
have a tap area of at least 24px (WCAG 2.2 SC 2.5.8), with the input's height and the page layout unchanged.

iOS zoom itself was checked by computed style only; no iPhone or iOS Simulator was used.
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
TAP_AREA_JS = """() => [...document.querySelectorAll('.text-button,.product-case-study,details.reasoning>summary')]
  .filter(e => e.offsetParent && !e.closest('details:not([open])')).map(e => {
    e.scrollIntoView({block: 'center'});
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2;
    let top = r.top + r.height / 2, bottom = top;
    while (top > r.top - 20 && e.contains(document.elementFromPoint(x, top - 1))) top--;
    while (bottom < r.bottom + 20 && e.contains(document.elementFromPoint(x, bottom + 1))) bottom++;
    return {text: e.textContent.trim().slice(0, 30), tap: Math.round(bottom - top + 1)};
  })"""


def _launch(pw):
    try:
        return pw.chromium.launch(headless=True, args=["--no-sandbox"])
    except PlaywrightError:
        for candidate in _FALLBACKS:
            if Path(candidate).exists():
                return pw.chromium.launch(headless=True, executable_path=candidate, args=["--no-sandbox"])
        raise


@pytest.mark.parametrize("width", [375, 390])
def test_phone_ask_input_is_16px_and_keeps_its_height(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = browser.new_page(viewport={"width": width, "height": 812})
        page.goto(STATE_URL)
        page.wait_for_selector(".ask-state-launcher", state="attached")
        page.evaluate("document.querySelector('.ask-state-launcher').click()")
        field = page.locator("#askStateDrawer .ask-state-drawer-form input")
        field.wait_for(state="visible")
        assert field.evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16
        assert round(field.evaluate("e => e.getBoundingClientRect().height")) == 41
    finally:
        browser.close(); pw.stop()


@pytest.mark.parametrize("width", [375, 390])
def test_phone_text_links_have_24px_tap_areas(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = browser.new_page(viewport={"width": width, "height": 812})
        page.goto(STATE_URL)
        page.wait_for_timeout(1500)
        areas = page.evaluate(TAP_AREA_JS)
        assert areas, "no small text controls rendered to check"
        small = [a for a in areas if a["tap"] < 24]
        assert not small, f"tap areas under 24px at {width}px: {small}"
    finally:
        browser.close(); pw.stop()
