#!/usr/bin/env python3
"""Capture State + portfolio screenshots at several widths, light and dark.

Usage:  python3 shots.py <repo-root> <output-dir>

Serves the repo statically, points the prototype at a local backend, walks every
view, and writes one PNG per (page, width, theme). Deterministic: the backend is
seeded with the idempotent Northstar demo, and no Ask requests are issued.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
SITE = "http://127.0.0.1:8080"
# The prototype talks to this backend. Point it at a locally running api.py.
API = os.environ.get("STATE_API_BASE", "http://127.0.0.1:8000")

WIDTHS = [("desktop", 1440, 900), ("tablet", 834, 1112), ("phone", 390, 844)]
THEMES = ["light", "dark"]

# (slug, url, nav button selector to click after load)
STATE_VIEWS = [
    ("workspace", None),
    ("project", '.sidebar-nav [data-view="project-overview"]'),
    ("open-items", '.sidebar-nav [data-view="open-items"]'),
    ("notes", '.sidebar-nav [data-view="notes"]'),
    ("history", '.sidebar-nav [data-view="history"]'),
]
PORTFOLIO_PAGES = [
    ("home", "/index.html"),
    ("case-study", "/implementation-context.html"),
]


def serve():
    return subprocess.Popen(
        [sys.executable, "-m", "http.server", "8080", "--bind", "127.0.0.1", "-d", str(REPO)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# The portfolio topbar's theme-toggle glyph (a colour-font moon) and the native
# <select> render with sub-pixel variation between runs. Masking them makes the
# harness deterministic: two runs of identical code now produce identical bytes,
# so any diff is a real change.
NOISE = ".top-actions"


def shoot(page, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    mask = page.locator(NOISE)
    page.screenshot(path=str(path), full_page=True,
                    mask=[mask] if mask.count() else [])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = serve()
    time.sleep(1.5)
    count = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
            for label, w, h in WIDTHS:
                for theme in THEMES:
                    ctx = browser.new_context(
                        viewport={"width": w, "height": h},
                        device_scale_factor=1,
                        reduced_motion="reduce",
                    )
                    # Point the prototype at the local backend and pin the theme
                    # before any page script runs.
                    ctx.add_init_script(
                        f"window.STATE_API_BASE = '{API}';"
                        f"try {{ localStorage.setItem('ai-cs-theme', '{theme}'); }} catch (e) {{}}"
                    )
                    page = ctx.new_page()

                    for slug, url in PORTFOLIO_PAGES:
                        page.goto(SITE + url, wait_until="networkidle")
                        page.wait_for_timeout(400)
                        shoot(page, OUT / f"{slug}__{label}__{theme}.png")
                        count += 1

                    page.goto(SITE + "/implementation-context-prototype/index.html",
                              wait_until="networkidle")
                    page.wait_for_timeout(1400)  # let hydration settle
                    for slug, selector in STATE_VIEWS:
                        if selector:
                            page.locator(selector).first.click()
                            page.wait_for_timeout(700)
                        shoot(page, OUT / f"state-{slug}__{label}__{theme}.png")
                        count += 1

                    ctx.close()
            browser.close()
    finally:
        srv.terminate()
    print(f"wrote {count} screenshots to {OUT}")


if __name__ == "__main__":
    main()
