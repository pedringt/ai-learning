#!/usr/bin/env python3
"""Prove a CSS cleanup is appearance-neutral: compare computed styles, old vs new.

Serves two copies of the static site (for example a `git worktree` of the previous commit
and the working tree), renders each page view at phone and desktop widths in light and dark
mode, and compares EVERY element's full computed style (all properties, plus ::before and
::after) between the two. It reports the number of differing elements and, for the first few,
which properties differ. Exit code 1 if anything differs.

    git worktree add /tmp/old HEAD
    python tools/style_parity.py --old /tmp/old --new .

Always run old-vs-old first (`--old . --new .`): that is the noise floor and must be 0. Rule
counts differ by design when a cleanup removes empty rules; computed styles must not.
Needs Playwright (see tools/README.md). Makes no network calls except to localhost.
"""
import argparse
import functools
import hashlib
import http.server
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SNAPSHOT_JS = """() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TITLE', 'HEAD']);
  const label = (e, i) => i + ' ' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const props = cs => { const out = []; for (let i = 0; i < cs.length; i++) out.push(cs[i] + ':' + cs.getPropertyValue(cs[i])); return out.join(';'); };
  const rows = [];
  [...document.querySelectorAll('body, body *')].forEach((e, i) => {
    if (skip.has(e.tagName)) return;
    const own = props(getComputedStyle(e));
    const before = getComputedStyle(e, '::before'), after = getComputedStyle(e, '::after');
    const pseudo = (before.content !== 'none' ? 'B|' + props(before) : '') + (after.content !== 'none' ? 'A|' + props(after) : '');
    rows.push([label(e, i), own + '||' + pseudo]);
  });
  return rows;
}"""

PROPS_JS = """(index) => {
  const e = [...document.querySelectorAll('body, body *')][index];
  const read = cs => { const o = {}; for (let i = 0; i < cs.length; i++) o[cs[i]] = cs.getPropertyValue(cs[i]); return o; };
  return {own: read(getComputedStyle(e)), before: read(getComputedStyle(e, '::before')), after: read(getComputedStyle(e, '::after'))};
}"""


def serve(directory):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def log_message(self, *args, **kwargs):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def snapshot(browser, url, *, width, scheme, view):
    context = browser.new_context(color_scheme=scheme, viewport={'width': width, 'height': 900}, reduced_motion='reduce')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1') else route.abort())
    page = context.new_page()
    page.goto(url, wait_until='load')
    page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}')
    if view:
        page.evaluate("v => { const b = document.querySelector('[data-view=\"' + v + '\"]'); if (b) b.click(); }", view)
    page.wait_for_timeout(700)
    rows = page.evaluate(SNAPSHOT_JS)
    return context, page, rows


def compare(browser, old_url, new_url, *, width, scheme, view, detail_limit):
    old_ctx, old_page, old_rows = snapshot(browser, old_url, width=width, scheme=scheme, view=view)
    new_ctx, new_page, new_rows = snapshot(browser, new_url, width=width, scheme=scheme, view=view)
    try:
        diffs = []
        if len(old_rows) != len(new_rows):
            diffs.append(f'element count differs: {len(old_rows)} vs {len(new_rows)}')
        for index, (a, b) in enumerate(zip(old_rows, new_rows)):
            if a[1] != b[1]:
                diffs.append((index, a[0]))
        lines = []
        for item in diffs[:detail_limit]:
            if isinstance(item, str):
                lines.append(item)
                continue
            index, label = item
            po, pn = old_page.evaluate(PROPS_JS, index), new_page.evaluate(PROPS_JS, index)
            changed = [f'{part}.{k}: {po[part].get(k)!r} -> {pn[part].get(k)!r}' for part in po for k in po[part] if po[part].get(k) != pn[part].get(k)]
            lines.append(f'{label}: ' + '; '.join(changed[:4]))
        return len(old_rows), len(diffs), lines
    finally:
        old_ctx.close()
        new_ctx.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--old', required=True, help='directory serving the previous version of the site')
    parser.add_argument('--new', required=True, help='directory serving the changed version')
    parser.add_argument('--page', default='index.html')
    parser.add_argument('--views', nargs='*', default=['home', 'portfolio', 'learn'], help='data-view values to activate (default: Home, Applied Work, Learning Guide)')
    parser.add_argument('--widths', nargs='*', type=int, default=[1280, 390])
    parser.add_argument('--schemes', nargs='*', default=['light', 'dark'])
    parser.add_argument('--details', type=int, default=4, help='how many differing elements to explain per case')
    args = parser.parse_args()

    old_server, new_server = serve(Path(args.old).resolve()), serve(Path(args.new).resolve())
    old_url = f'http://127.0.0.1:{old_server.server_address[1]}/{args.page}'
    new_url = f'http://127.0.0.1:{new_server.server_address[1]}/{args.page}'
    total_diffs = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])
        for view in args.views:
            for width in args.widths:
                for scheme in args.schemes:
                    count, diffs, lines = compare(browser, old_url, new_url, width=width, scheme=scheme, view=view, detail_limit=args.details)
                    total_diffs += diffs
                    print(f'{"OK  " if not diffs else "DIFF"} view={view:<10} width={width:<5} {scheme:<5} elements={count:<5} differing={diffs}')
                    for line in lines:
                        print('       ' + line[:300])
        browser.close()
    old_server.shutdown()
    new_server.shutdown()
    print('\nRESULT:', 'identical computed styles everywhere' if not total_diffs else f'{total_diffs} differing elements')
    return 1 if total_diffs else 0


if __name__ == '__main__':
    sys.exit(main())
