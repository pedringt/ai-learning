"""#450: after Evidence is added, the Workspace attention line keeps its capped wording.

Two patch layers (context-feedback-pass.js, context-feedback-pass-4.js) used to refetch
/attention after "Evidence added" or "Saved, but not analyzed" and rewrite the attention
text themselves, replacing the app's capped "2 reviews · +8 more in Open Items" with
uncapped totals ("7 reviews · 3 blocking questions") next to the same two listed rows.
The app now re-hydrates instead, so the line still describes what is listed.

Real frontend, real local backend (temporary SQLite, demo seed). The interpretation
provider is a stub: notes containing NO_REVIEW are interpreted as needing no Review, and
anything else fails, which exercises the "Saved, but not analyzed" path. No model calls.
"""
from __future__ import annotations

import threading
import time

import httpx
import pytest
import uvicorn

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_baseline_blank_banner_browser import _NoModel, _free_port, _serve_frontend
from test_browser_user_flows import _launch_chromium


class _NoReviewOrFail:
    name = "stub-interpreter"
    model_identifier = "stub-interpreter-v1"

    def interpret(self, *, context=None, evidence=None, connection=None, **kwargs):
        if "NO_REVIEW" in str((evidence or {}).get("content") or ""):
            return {
                "summary": "Routine operational detail.",
                "topics": ["pilot"],
                "outcome": "no_review",
                "no_review_explanation": "Nothing in maintained State changes.",
                "review_recommendations": [],
            }
        raise RuntimeError("interpretation is disabled in this test")


ATTENTION_JS = """() => {
  const a = document.querySelector('.workspace-attention');
  return a ? {
    title: a.querySelector('h3')?.textContent || '',
    line: a.querySelector('.attention-intro-text')?.textContent || '',
    rows: a.querySelectorAll('.attention-item').length,
  } : null;
}"""


@pytest.mark.parametrize("note", ["Ops confirmed the on-call lead owns outage notifications.",
                                  "NO_REVIEW Training moved to the afternoon session."])
def test_attention_line_stays_capped_after_evidence(tmp_path, note):
    settings = Settings(database_path=str(tmp_path / "evidence.db"), cors_origins=["*"], demo_bootstrap=True)
    app = create_app(settings, provider=_NoReviewOrFail(), ask_provider=_NoModel())
    port = _free_port()
    api = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="critical"))
    threading.Thread(target=api.run, daemon=True).start()
    frontend = None
    try:
        for _ in range(100):
            try:
                httpx.get(f"http://127.0.0.1:{port}/health", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        frontend = _serve_frontend(f"http://127.0.0.1:{port}")
        with sync_playwright() as pw:
            browser = _launch_chromium(pw)
            try:
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                page.set_default_timeout(20000)
                page.goto(f"http://127.0.0.1:{frontend.server_address[1]}/#workspace")
                page.wait_for_function("document.querySelectorAll('.workspace-attention .attention-item').length > 0")
                page.wait_for_timeout(500)
                before = page.evaluate(ATTENTION_JS)
                assert "more in Open Items" in before["line"], before

                page.click(".overview-add")
                page.locator("#dialogBody textarea").first.fill(note)
                page.locator("#dialogBody button.primary").first.click()
                page.wait_for_function("/Evidence added|Saved, but not analyzed/i.test(document.getElementById('dialogBody')?.textContent || '')")
                page.wait_for_timeout(1500)  # the old layers rewrote the line 250ms after this dialog
                if note.startswith("NO_REVIEW"):
                    # #456: an established project must not be told Evidence updates a Starting State.
                    message = page.evaluate("() => document.querySelector('#dialogBody p')?.textContent || ''")
                    assert message == "Added as Evidence. Current State did not need a Review.", message
                page.evaluate("() => document.querySelector('#dialogBody [data-action=close-dialog]')?.click()")
                page.wait_for_timeout(800)

                after = page.evaluate(ATTENTION_JS)
                assert after["line"] == before["line"], (before, after)
                assert after["rows"] == before["rows"]
                assert after["title"] == before["title"]
            finally:
                browser.close()
    finally:
        api.should_exit = True
        if frontend:
            frontend.shutdown()
