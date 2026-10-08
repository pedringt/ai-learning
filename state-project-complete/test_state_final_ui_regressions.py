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
    # context-layout.js (formerly context-final-mobile.js, #450) clears this class after the first render.
    page.wait_for_function("!document.documentElement.classList.contains('state-final-mobile-pending')")
    return pw, browser, page


def test_final_feedback_layer_is_loaded_by_real_state_entrypoint():
    pw, browser, page = _page()
    try:
        # Layer styles load once from state-app.css instead of being injected by each script (#450).
        assert page.locator('link[href*="state-app.css"]').count() == 1
        injected = page.evaluate(
            "() => [...document.querySelectorAll('style')].map(s => s.id).filter(id => !['state-prepaint-guard', 'state-mobile-nav'].includes(id))"
        )
        assert injected == []
        bg = page.locator(".prototype-productbar").evaluate("e => getComputedStyle(e).backgroundColor")
        border = page.locator(".prototype-productbar").evaluate("e => getComputedStyle(e).borderBottomColor")
        assert bg == "rgb(251, 252, 253)"
        assert border == "rgb(216, 225, 235)"
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
        page.wait_for_timeout(50)

        reset = page.locator("#askStateDrawer .state-ask-reset")
        assert reset.is_visible()
        assert not page.locator("#askStateDrawer .ask-state-drawer-form button[type='submit']").is_visible()
        # The second, never-visible clear button that feedback-pass-3 used to add is gone (#450).
        assert page.locator("#askStateDrawer .state-ask-clear").count() == 0
        reset_after = reset.evaluate("e => getComputedStyle(e,'::after').content")
        assert reset_after in ('none', '""')

        reset.click()
        page.wait_for_timeout(50)
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


def test_add_evidence_modal_uses_neutral_surface_and_blue_action():
    pw, browser, page = _page()
    try:
        page.locator('[data-action="add-info"]').click()
        dialog = page.locator("#overlay .dialog")
        assert dialog.is_visible()
        assert page.locator("#addInfoText").is_visible()
        bg = dialog.evaluate("e => getComputedStyle(e).backgroundColor")
        primary = page.locator('[data-action="save-info"]').evaluate("e => getComputedStyle(e).backgroundColor")
        assert bg == "rgb(255, 255, 255)"
        assert primary == "rgb(23, 105, 232)"
    finally:
        browser.close(); pw.stop()


def test_project_record_refresh_warning_is_not_hidden_by_late_styles():
    pw, browser, page = _page()
    try:
        page.locator("#askStateLauncher").click()
        page.evaluate("""() => {
          const result=document.getElementById('askStateDrawerResult');
          result.innerHTML='<div class="ask-state-stale"><span>The project record has changed since this answer was generated.</span><button>Refresh answer</button></div>';
        }""")
        assert page.locator("#askStateDrawer .ask-state-stale").is_visible()
    finally:
        browser.close(); pw.stop()


def test_history_entries_have_no_left_timeline_rail_or_hover_transform():
    pw, browser, page = _page()
    try:
        page.evaluate("""() => {
          const host=document.createElement('section');
          host.className='history-page';
          host.innerHTML='<div id="historyList" class="history-list"><article class="history-entry is-linked"><div class="history-entry-body">Decision</div></article></div>';
          document.body.appendChild(host);
        }""")
        entry = page.locator(".history-page .history-entry").last
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


IDLE_MUTATIONS_JS = """async () => {
  const seen = [];
  const mo = new MutationObserver(list => {
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      seen.push(`${m.type} ${m.attributeName || ''} ${t ? t.tagName + '.' + String(t.className).split(' ')[0] : ''}`);
    }
  });
  mo.observe(document.documentElement, {childList: true, subtree: true, attributes: true, characterData: true});
  await new Promise(r => setTimeout(r, 1000));
  mo.disconnect();
  return seen;
}"""


@pytest.mark.parametrize("open_ask", [False, True])
def test_idle_page_does_not_rewrite_the_dom_every_frame(open_ask):
    # #450: several patch layers rewrote identical values on every animation
    # frame (sidebar icons, <html>/<body> classes, the Ask status and submit
    # button), and each write re-triggered every other layer's MutationObserver,
    # so an idle tab kept the DOM changing ~840 times a second. An idle page
    # must not change at all.
    pw, browser, page = _page()
    try:
        if open_ask:
            page.locator("#askStateLauncher").click()
        page.wait_for_timeout(1500)
        seen = page.evaluate(IDLE_MUTATIONS_JS)
        assert seen == [], f"{len(seen)} DOM changes on an idle page, e.g. {sorted(set(seen))[:5]}"
    finally:
        browser.close(); pw.stop()


def test_dismissed_sources_strip_stays_dismissed_after_rerender():
    # #450: the Workspace "Sources" strip moved from a MutationObserver layer
    # (context-sources.js) into the Workspace template; dismissal must still
    # remove it and survive later Workspace renders.
    pw, browser, page = _page()
    try:
        page.evaluate("() => localStorage.removeItem('state-workspace-source-banner-dismissed-v2')")
        page.locator('.sidebar-nav [data-view="notes"]').click()
        page.locator('.sidebar-nav [data-view="overview"]').click()
        assert page.locator(".overview .workspace-source-strip").count() == 1
        page.locator(".workspace-source-dismiss").click()
        assert page.locator(".workspace-source-strip").count() == 0
        page.locator('.sidebar-nav [data-view="notes"]').click()
        page.locator('.sidebar-nav [data-view="overview"]').click()
        page.wait_for_timeout(300)
        assert page.locator(".overview").count() == 1
        assert page.locator(".workspace-source-strip").count() == 0
    finally:
        browser.close(); pw.stop()
