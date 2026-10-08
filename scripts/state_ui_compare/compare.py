"""Before/after UI comparison for the State app (#450).

Renders the State frontend from a base git ref and from the working tree, side by
side, in headless Chromium against one local backend seeded with the demo data.
Every view plus the Ask drawer is fingerprinted at desktop and phone widths
(computed styles incl. pseudo-elements, own text, attributes, structure) and the
two builds are compared. Use it to prove a refactor leaves the UI unchanged.

No model calls: the backend's interpretation and Ask providers refuse every call,
and API keys are removed from the environment before the app is imported.

Usage (from the repo root):
  state-project-complete/.venv/bin/python scripts/state_ui_compare/compare.py
  ... --base origin/staging   ref to compare against (default: HEAD)
  ... --runs 2                captures per width (default: 2)
  ... --self                  compare the base against itself (noise check)
Exit status is 1 when any difference is found.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND = os.path.join(REPO, "state-project-complete")
APP_DIR = "implementation-context-prototype"
CAPTURE_JS = open(os.path.join(os.path.dirname(__file__), "capture.js")).read()
WIDTHS = {"desktop": (1280, 900), "phone": (375, 812)}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_backend() -> str:
    for key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DATABASE_URL"):
        os.environ.pop(key, None)
    sys.path.insert(0, BACKEND)
    import logging
    import uvicorn
    logging.getLogger("state.api").setLevel(logging.WARNING)
    from api import Settings, create_app

    class NoModel:
        name = "no-model"
        model_identifier = "no-model-v1"

        def __getattr__(self, attr):
            def refuse(*args, **kwargs):
                raise RuntimeError("state_ui_compare: model calls are disabled")
            return refuse

    db = os.path.join(tempfile.mkdtemp(prefix="state-ui-compare-"), "state.db")
    app = create_app(Settings(database_path=db, demo_bootstrap=True, cors_origins=["*"], environment="local"),
                     provider=NoModel(), ask_provider=NoModel())
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/health", timeout=1)
            return base
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("backend did not start")


def serve_frontend(root: str, api: str) -> str:
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            if self.path.split("?")[0] == "/api/state-config.js":
                body = f"window.STATE_API_BASE={api!r};".encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=root))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/"


def capture(browser, url: str, width: int, height: int):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url + "#workspace")
    page.wait_for_timeout(2500)
    page.add_script_tag(content=CAPTURE_JS)
    data = page.evaluate("() => STATE_CAPTURE.run()")
    ctx.close()
    return data, errors


def explain(browser, urls, width, height, d: dict, limit: int):
    """Print which computed properties differ for the first `limit` style-changed elements per view."""
    def props(style):
        out = {}
        for part in style.split(";"):
            if ":" in part:
                k, v = part.split(":", 1)
                out[k] = v
        return out
    for view, kinds in d.items():
        paths = [row[0] for row in kinds.get("style", [])][-limit:]  # deepest-last order: innermost elements are most telling
        if not paths:
            continue
        details = []
        for url in urls:
            ctx = browser.new_context(viewport={"width": width, "height": height})
            page = ctx.new_page()
            page.goto(url + "#workspace")
            page.wait_for_timeout(2500)
            page.add_script_tag(content=CAPTURE_JS)
            details.append(page.evaluate("([v, p]) => STATE_CAPTURE.detail(v, p)", [view, paths]))
            ctx.close()
        for path in paths:
            a, b = details[0].get(path), details[1].get(path)
            if not a or not b:
                continue
            for part in ("base", "before", "after"):
                pa, pb = props(a[part]), props(b[part])
                changed = [k for k in sorted(set(pa) | set(pb)) if pa.get(k) != pb.get(k)]
                if changed:
                    print(f"  [{view}] {path}{'' if part == 'base' else '::' + part}")
                    for k in changed[:12]:
                        print(f"      {k}: {pa.get(k)!r} -> {pb.get(k)!r}")


def diff(a: dict, b: dict) -> dict:
    out = {}
    for view in sorted(set(a) | set(b)):
        A, B = a.get(view, {}), b.get(view, {})
        d = {
            "only_before": [p for p in A if p not in B],
            "only_after": [p for p in B if p not in A],
            "style": [[p, A[p]["cls"], A[p]["txt"]] for p in A if p in B and A[p]["s"] != B[p]["s"]],
            "text": [[p, A[p]["txt"], B[p]["txt"]] for p in A if p in B and A[p]["t"] != B[p]["t"]],
            "attrs": [[p, A[p]["cls"], B[p]["cls"]] for p in A if p in B and A[p]["a"] != B[p]["a"]],
        }
        d = {k: v for k, v in d.items() if v}
        if d:
            out[view] = d
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="HEAD")
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--self", action="store_true", dest="self_check")
    parser.add_argument("--json", help="write the full report here")
    parser.add_argument("--explain", type=int, default=0, metavar="N",
                        help="for the first differing run, print the changed CSS properties of up to N elements per view")
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    worktree = tempfile.mkdtemp(prefix="state-ui-base-")
    print(f"checking out {args.base} for comparison...", flush=True)
    subprocess.run(["git", "-C", REPO, "worktree", "add", "--detach", "-q", worktree, args.base], check=True)
    try:
        api = start_backend()
        print("local backend up; capturing...", flush=True)
        before_url = serve_frontend(os.path.join(worktree, APP_DIR), api)
        after_url = before_url if args.self_check else serve_frontend(os.path.join(REPO, APP_DIR), api)
        report, changed = {}, False
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for label, (w, h) in WIDTHS.items():
                for run in range(args.runs):
                    print(f"capturing {label} run {run + 1}: base...", flush=True)
                    before, errors_before = capture(browser, before_url, w, h)
                    print(f"capturing {label} run {run + 1}: working tree...", flush=True)
                    after, errors_after = capture(browser, after_url, w, h)
                    d = diff(before, after)
                    changed = changed or bool(d) or bool(errors_after)
                    report[f"{label} run {run + 1}"] = {"diff": d, "errors_before": errors_before, "errors_after": errors_after}
                    if d and args.explain and run == 0:
                        print(f"--- explain: {label}")
                        explain(browser, [before_url, after_url], w, h, d, args.explain)
            browser.close()
    finally:
        subprocess.run(["git", "-C", REPO, "worktree", "remove", "--force", worktree], check=False)

    for key, r in report.items():
        summary = {view: {k: len(v) for k, v in d.items()} for view, d in r["diff"].items()}
        print(f"{key}: {'IDENTICAL' if not summary else summary}"
              + (f"  page errors after: {r['errors_after'][:3]}" if r["errors_after"] else ""))
        for view, d in list(r["diff"].items())[:3]:
            for kind, rows in d.items():
                for row in rows[:5]:
                    print(f"    {view} {kind}: {row}")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(report, fh, indent=1)
    print("RESULT:", "DIFFERENT" if changed else "IDENTICAL", f"(base {args.base}{', self-check' if args.self_check else ''})")
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
