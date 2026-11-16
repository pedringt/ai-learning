"""#690: at 375px the related-scenario title under "Related test scenarios" wrapped into a one-word-wide column beside
the chip. The row now stacks at phone width: the title uses the card's full width and nothing overflows the page.

Renders the row markup project-health.js builds (`.mock-test-row`) inside project-health.html, with every network
request stubbed. No model calls.
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
TITLE = "Security's pause of password-reset automation: the Review didn't meet the expected wording requirements"
SCENARIO = "Scenario: Partial reversal keeps the unaffected scope"


def _launch(pw):
    try:
        return pw.chromium.launch(headless=True, args=["--no-sandbox"])
    except PlaywrightError:
        for candidate in _CHROMIUM_FALLBACKS:
            if Path(candidate).exists():
                return pw.chromium.launch(headless=True, executable_path=candidate, args=["--no-sandbox"])
        raise


def _stub(route):
    if route.request.url.startswith("file://") and "/api/" not in route.request.url:
        return route.continue_()
    route.fulfill(status=503, content_type="application/json", body=json.dumps({"detail": "stubbed in tests"}))


@pytest.mark.parametrize("width", [375, 1280])
def test_related_scenario_title_uses_the_card_width(width):
    pw = sync_playwright().start()
    browser = _launch(pw)
    try:
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.route("**/*", _stub)
        page.goto(URL)
        page.wait_for_selector("main, .shell", state="attached", timeout=15000)
        # The same markup project-health.js renders for a stale failure, inside the card section it lives in.
        page.evaluate(
            """([title, scenario]) => {
                const host = document.querySelector('.shell') || document.body;
                const section = document.createElement('section');
                section.className = 'mock-dashboard-section mock-investigation-card';
                section.id = 'related-tests-probe';
                section.innerHTML = '<div class="mock-related-tests"><strong style="font-size:11px">Related test scenarios · previous run</strong>'
                  + '<div class="mock-test-row"><strong></strong><span class="status-pill unknown">Failed in previous run</span><span></span></div></div>';
                section.querySelector('.mock-test-row strong').textContent = title;
                section.querySelector('.mock-test-row span:last-child').textContent = scenario;
                host.appendChild(section);
            }""",
            [TITLE, SCENARIO],
        )
        sizes = page.evaluate(
            """() => {
                const row = document.querySelector('#related-tests-probe .mock-test-row');
                const title = row.querySelector('strong');
                const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || 14;
                return {row: row.clientWidth, title: title.getBoundingClientRect().width,
                        lines: Math.round(title.getBoundingClientRect().height / lineHeight),
                        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
            }"""
        )
        assert sizes["pageOverflow"] <= 0, f"page overflows horizontally at {width}px: {sizes}"
        if width == 375:
            assert sizes["title"] >= sizes["row"] * 0.9, f"title does not use the card width at 375px: {sizes}"
            assert sizes["lines"] <= 4, f"title wraps into a narrow column at 375px: {sizes}"
    finally:
        browser.close()
        pw.stop()
