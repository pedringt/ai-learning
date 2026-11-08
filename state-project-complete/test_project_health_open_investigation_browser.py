"""#611: every rendered "Open investigation" control opens the investigation drawer, and opening starts nothing.

Paige's decision (Nov 4): the control opens the existing drawer with what already exists for the selected project
(the rules-based assessment before any investigation has run). It never POSTs to /api/project-health-investigate
or calls a model. All network requests are stubbed here; the test fails if anything is POSTed.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / "project-health.html").as_uri()
_CHROMIUM_FALLBACKS = ("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
                       "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def _launch(pw):
    try:
        return pw.chromium.launch(headless=True, args=["--no-sandbox"])
    except PlaywrightError:
        for candidate in _CHROMIUM_FALLBACKS:
            if Path(candidate).exists():
                return pw.chromium.launch(headless=True, executable_path=candidate, args=["--no-sandbox"])
        raise


def _open_page(pw, browser, width, posts):
    page = browser.new_page(viewport={"width": width, "height": 900})

    def stub(route):
        request = route.request
        if request.url.startswith("file://") and "/api/" not in request.url:
            return route.continue_()
        if request.method != "GET":
            posts.append(request.url)
        route.fulfill(status=503, content_type="application/json", body=json.dumps({"detail": "stubbed in tests"}))

    page.route("**/*", stub)
    page.goto(URL)
    page.wait_for_selector("[data-open-investigation]", state="attached", timeout=15000)
    return page


@pytest.mark.parametrize("width", [375, 390, 1280])
def test_every_open_investigation_control_opens_the_drawer_without_a_request(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    posts: list[str] = []
    try:
        page = _open_page(pw, browser, width, posts)
        controls = page.locator("[data-open-investigation]")
        visible = [i for i in range(controls.count()) if controls.nth(i).is_visible()]
        assert visible, "no visible Open investigation control to test"
        for index in visible:
            control = controls.nth(index)
            control.scroll_into_view_if_needed()
            control.click()
            drawer = page.locator("#investigationDrawer")
            assert drawer.is_visible(), f"control {index} did not open the drawer at {width}px"
            body = page.locator("#investigationPanel")
            assert "assessment from current signals" in body.inner_text().lower()
            assert page.evaluate("document.activeElement && document.activeElement.id") == "investigationPanel"
            page.keyboard.press("Escape")
            assert not drawer.is_visible()
            # Keyboard: Enter on the focused control opens it too.
            control.focus()
            page.keyboard.press("Enter")
            assert drawer.is_visible()
            page.keyboard.press("Escape")
        assert posts == [], f"opening an investigation sent requests: {posts}"
    finally:
        browser.close()
        pw.stop()


def test_the_drawer_follows_the_selected_project():
    """Acceptance 4: after switching projects the drawer shows the selected project, never the previous one."""
    pw = sync_playwright().start()
    browser = _launch(pw)
    posts: list[str] = []
    try:
        page = _open_page(pw, browser, 1280, posts)
        projects = page.eval_on_selector_all(".project-switcher-item", "els => els.map(e => e.dataset.project)")
        assert len(projects) >= 3
        for project in projects + [projects[0]]:
            page.locator(f'.project-switcher-item[data-project="{project}"]').first.click()
            page.wait_for_timeout(500)  # the switch re-renders the detail view; let it settle before finding the control
            name = page.locator("#detailTitle").inner_text().strip()
            control = page.locator("[data-open-investigation]:visible").first
            control.scroll_into_view_if_needed()
            control.click()
            assert page.locator("#investigationDrawerTitle").inner_text().strip() == f"{name} investigation"
            page.keyboard.press("Escape")
        assert posts == []
    finally:
        browser.close()
        pw.stop()
