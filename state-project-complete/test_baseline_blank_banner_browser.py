"""#455: a brand-new project's Baseline banner must offer both ways to start.

The banner copy is "Add existing project material, or enter what you already
know", so it needs both "Add starting material" and "Enter Current State
manually". The manual button used to be removed straight after rendering:
context-baseline-polish.js decided blankness only from a ".baseline-setup-meta"
line that the dogfood banner does not render for a blank project, and the
dogfood banner's signature guard never drew it again.

Runs the real frontend against a real local backend (temporary SQLite, demo
seed, no model calls) and creates the project through the UI.
"""
from __future__ import annotations

import functools
import http.server
import socket
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_browser_user_flows import _launch_chromium

FRONTEND = Path(__file__).resolve().parents[1] / "implementation-context-prototype"


class _NoModel:
    name = "no-model"
    model_identifier = "no-model-v1"

    def __getattr__(self, attr):
        def refuse(*args, **kwargs):
            raise RuntimeError("model calls are disabled in this test")
        return refuse


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _serve_frontend(api_base: str):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] == "/api/state-config.js":
                body = f"window.STATE_API_BASE={api_base!r};".encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(FRONTEND)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def test_new_project_banner_offers_starting_material_and_manual_entry(tmp_path):
    settings = Settings(database_path=str(tmp_path / "banner.db"), cors_origins=["*"], demo_bootstrap=True)
    app = create_app(settings, provider=_NoModel(), ask_provider=_NoModel())
    port = _free_port()
    api = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
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
                page.set_default_timeout(15000)
                page.goto(f"http://127.0.0.1:{frontend.server_address[1]}/#workspace")
                page.wait_for_selector("#projectSwitcher:not(:has-text('Loading'))")
                page.click("#projectSwitcher")
                page.locator("#projectMenu button", has_text="New project").first.click()
                page.locator("#dialogBody input").first.fill("Blank banner check")
                page.locator("#dialogBody button.primary").first.click()
                banner = page.locator("#baselineSetupBanner")
                banner.locator(".baseline-setup-title", has_text="Set up Current State").wait_for()
                page.wait_for_timeout(1500)  # let every layer's observer run
                buttons = banner.locator("button").all_inner_texts()
                assert "Add starting material" in buttons
                assert "Enter Current State manually" in buttons, buttons
                # ...and it opens manual entry, still behind the Starting State confirmation.
                banner.locator("[data-baseline-start-manual]").click()
                page.locator("#dialogBody [data-baseline-save-manual]").wait_for()
                assert page.locator("#overlay").is_visible()
            finally:
                browser.close()
    finally:
        api.should_exit = True
        if frontend:
            frontend.shutdown()
