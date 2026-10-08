"""Before/after UI comparison for the static portfolio pages (#451).

Serves a base git ref and the working tree as static sites, loads every portfolio page
at desktop, tablet and phone widths, scrolls through it (scroll-reveal effects), waits
for fonts, and fingerprints every element with capture.js's snap(): computed styles
incl. pseudo-elements, own text, attributes and structure. Use it to prove a CSS or
markup refactor leaves the portfolio unchanged.

Usage (from the repo root):
  state-project-complete/.venv/bin/python scripts/state_ui_compare/portfolio_compare.py
  ... --base origin/staging   ref to compare against (default: HEAD)
  ... --runs 1                captures per page and width (default: 1)
  ... --pages index.html,...  only these pages
  ... --self                  compare the base against itself (noise check)
Exit status is 1 when any difference is found.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CAPTURE_JS = open(os.path.join(os.path.dirname(__file__), "capture.js")).read()
WIDTHS = {"desktop": (1280, 900), "tablet": (820, 1180), "phone": (375, 812)}
# Pages with their own stylesheet and live data are not part of the shared portfolio CSS.
EXCLUDE = {"project-health.html", "state-evals.html"}


def portfolio_pages() -> list[str]:
    names = subprocess.run(["git", "-C", REPO, "ls-files", "*.html"], capture_output=True, text=True, check=True).stdout.split()
    return sorted(n for n in names if "/" not in n and n not in EXCLUDE)


def serve(root: str) -> str:
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=root))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/"


SETTLE_JS = """async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try { await document.fonts.ready; } catch (e) {}
  const step = Math.max(200, Math.floor(innerHeight * 0.6));
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await sleep(60); }
  scrollTo(0, document.documentElement.scrollHeight); await sleep(400);
  scrollTo(0, 0); await sleep(1200);
}"""


def capture(browser, url: str, page_name: str, width: int, height: int):
    ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Analytics and other third-party requests are not part of the page's own rendering.
    page.route("**/_vercel/**", lambda route: route.abort())
    page.goto(url + page_name, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(1500)
    page.evaluate(SETTLE_JS)
    page.add_script_tag(content=CAPTURE_JS)
    data = page.evaluate("() => STATE_CAPTURE.snap()")
    ctx.close()
    return data, errors


def diff(A: dict, B: dict) -> dict:
    d = {
        "only_before": [p for p in A if p not in B],
        "only_after": [p for p in B if p not in A],
        "style": [[p, A[p]["cls"], A[p]["txt"]] for p in A if p in B and A[p]["s"] != B[p]["s"]],
        "text": [[p, A[p]["txt"], B[p]["txt"]] for p in A if p in B and A[p]["t"] != B[p]["t"]],
        "attrs": [[p, A[p]["cls"], B[p]["cls"]] for p in A if p in B and A[p]["a"] != B[p]["a"]],
    }
    return {k: v for k, v in d.items() if v}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="HEAD")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--pages")
    parser.add_argument("--self", action="store_true", dest="self_check")
    parser.add_argument("--json", help="write the full report here")
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    pages = args.pages.split(",") if args.pages else portfolio_pages()
    worktree = tempfile.mkdtemp(prefix="portfolio-base-")
    print(f"checking out {args.base} for comparison...", flush=True)
    subprocess.run(["git", "-C", REPO, "worktree", "add", "--detach", "-q", worktree, args.base], check=True)
    report, changed = {}, False
    try:
        before_url = serve(worktree)
        after_url = before_url if args.self_check else serve(REPO)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for page_name in pages:
                for label, (w, h) in WIDTHS.items():
                    for run in range(args.runs):
                        before, eb = capture(browser, before_url, page_name, w, h)
                        after, ea = capture(browser, after_url, page_name, w, h)
                        d = diff(before, after)
                        key = f"{page_name} {label} run {run + 1}"
                        report[key] = {"diff": d, "errors_before": eb, "errors_after": ea}
                        changed = changed or bool(d) or (bool(ea) and ea != eb)
                        summary = {k: len(v) for k, v in d.items()}
                        print(f"{key}: {'IDENTICAL' if not d else summary}" + (f"  page errors after: {ea[:2]}" if ea and ea != eb else ""), flush=True)
                        for kind, rows in list(d.items())[:3]:
                            for row in rows[:4]:
                                print(f"    {kind}: {row}")
            browser.close()
    finally:
        subprocess.run(["git", "-C", REPO, "worktree", "remove", "--force", worktree], check=False)
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(report, fh, indent=1)
    print("RESULT:", "DIFFERENT" if changed else "IDENTICAL", f"(base {args.base}{', self-check' if args.self_check else ''}, {len(pages)} pages)")
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
