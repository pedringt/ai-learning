"""#614 (Paige, Nov 4): Project Health phone layout, tap targets and drawer focus return.

Network is stubbed (no real requests or model calls), so the attention card shows "Couldn't check" text; the
width check uses the real issue title in place of it.
"""
from __future__ import annotations

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

from test_project_health_open_investigation_browser import _launch, _open_page

TAP_JS = """(sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent).map(e => {
  e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(), x = r.left + r.width / 2;
  let a = r.top + r.height / 2, b = a;
  while (a > r.top - 20 && e.contains(document.elementFromPoint(x, a - 1))) a--;
  while (b < r.bottom + 20 && e.contains(document.elementFromPoint(x, b + 1))) b++;
  return {text: e.textContent.trim().slice(0, 20), tap: Math.round(b - a + 1)}; })"""


@pytest.mark.parametrize("width", [375, 390])
def test_phone_layout_and_tap_targets(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = _open_page(pw, browser, width, [])
        projects = page.eval_on_selector_all(".project-switcher-item", "els => els.map(e => e.dataset.project)")
        for project in projects:
            page.locator(f'.project-switcher-item[data-project="{project}"]').first.click()
            page.wait_for_timeout(400)
            tabs = page.evaluate("(() => { const t = document.querySelector('.project-tabs'); return t.scrollWidth - t.clientWidth; })()")
            assert tabs <= 0, f"{project}: project tabs overflow by {tabs}px at {width}px"
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), f"{project}: page scrolls sideways"
        row = page.evaluate("""(() => { const strong = document.querySelector('.mock-attention-banner .mock-issue-row strong');
          strong.textContent = '1 failure in a high-severity AI scenario needs review';
          const text = strong.parentElement, tag = document.querySelector('.mock-attention-banner .mock-issue-meta');
          return {width: text.getBoundingClientRect().width, lines: Math.round(strong.getBoundingClientRect().height / parseFloat(getComputedStyle(strong).lineHeight)),
                  tag: !!tag && tag.getBoundingClientRect().width > 0}; })()""")
        assert row["width"] >= 245 and row["lines"] <= 3 and row["tag"], row
        small = [t for t in page.evaluate(TAP_JS, "#detailLiveLink,#detailRepoLink,.mock-analytics-link") if t["tap"] < 24]
        assert not small, small
    finally:
        browser.close(); pw.stop()


def test_closing_the_drawer_returns_focus_to_its_opener():
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = _open_page(pw, browser, 375, [])
        control = page.locator("[data-open-investigation]:visible").first
        for close in ("Escape", "button", "backdrop"):
            control.scroll_into_view_if_needed()
            control.focus()
            page.keyboard.press("Enter")
            scroll = page.evaluate("scrollY")
            assert page.locator("#investigationDrawer").is_visible()
            if close == "Escape":
                page.keyboard.press("Escape")
            elif close == "button":
                page.locator("#closeInvestigationDrawer").click()
            else:
                page.evaluate("document.getElementById('investigationBackdrop').click()")
            assert page.locator("#investigationDrawer").is_hidden()
            assert page.evaluate("document.activeElement.hasAttribute('data-open-investigation')"), f"focus not returned after {close}"
            assert page.evaluate("scrollY") == scroll
    finally:
        browser.close(); pw.stop()
