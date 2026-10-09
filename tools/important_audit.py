#!/usr/bin/env python3
"""Find portfolio `!important` flags that change nothing, and optionally remove them.

For every stylesheet (shared .css files and inline <style> blocks), each `!important`
declaration is a candidate unless it cannot be exercised by a static page load: rules with
interaction pseudo-classes (:hover, :focus, ...), script-toggled attributes ([open],
[aria-expanded], ...), classes a portfolio script mentions, or print / preference / pointer
media queries keep their flag.

Each round loads every portfolio page view (plus index.html#learn and #portfolio) at one
width inside every breakpoint interval of the CSS, records every element's full computed
style (incl. ::before / ::after), swaps in each stylesheet's text with the current
candidates' `!important` removed (in place, so cascade order is unchanged), and compares.
Any changed (element, property) is traced back to the candidate declarations that could
cause it: same or related property, on the element or (for inherited values) an ancestor,
selector and media matching. Those keep their flag. Rounds repeat until removing the
remaining candidates changes nothing anywhere.

    python3 tools/important_audit.py              # report only
    python3 tools/important_audit.py --apply      # also rewrite the sources

Then prove it with scripts/state_ui_compare/portfolio_compare.py (#451).
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(REPO, "scripts", "state_ui_compare"))
from portfolio_compare import SETTLE_JS, portfolio_pages, serve  # noqa: E402

FILES = ["site-shell.css", "site-components.css", "site-redesign.css", "site-polish.css",
         "implementation-context-case.css", "final-freeze-polish.css"]
INTERACTIVE = re.compile(r":(hover|focus|focus-visible|focus-within|active|visited|checked|target|open|invalid|valid|"
                         r"placeholder-shown|disabled|enabled|indeterminate|autofill|user-invalid|popover-open|modal)\b"
                         r"|::(selection|placeholder|backdrop|marker|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)")
DYN_ATTR = re.compile(r"\[(open|aria-expanded|aria-pressed|aria-selected|aria-current|aria-hidden|hidden|checked|selected|"
                      r"disabled|data-[\w-]*(state|open|active|expanded|mode|theme)[\w-]*)\b")
SKIP_MEDIA = re.compile(r"print|prefers-|hover|pointer|orientation|any-")


def js_words() -> set[str]:
    text = open(os.path.join(REPO, "site-shell.js")).read() + open(os.path.join(REPO, "site-environment.js")).read()
    for page in glob.glob(os.path.join(REPO, "*.html")):
        text += "\n".join(re.findall(r"<script[^>]*>(.*?)</script>", open(page).read(), flags=re.S))
    return set(re.findall(r"[A-Za-z_][\w-]*", text))


def blank(text: str) -> str:
    def keep_len(m):
        return " " * len(m.group(0))
    text = re.sub(r"/\*.*?\*/", keep_len, text, flags=re.S)
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', lambda m: m.group(0)[0] + "x" * (len(m.group(0)) - 2) + m.group(0)[-1], text)


def declarations(text: str):
    """Yield dicts for every `!important` declaration in a style rule."""
    scan = blank(text)
    found = []

    def parse(start, end, media):
        j = start
        while j < end:
            brace = scan.find("{", j, end)
            if brace < 0:
                break
            depth, k = 1, brace + 1
            while k < end and depth:
                depth += 1 if scan[k] == "{" else -1 if scan[k] == "}" else 0
                k += 1
            prelude = scan[j:brace].strip()
            if prelude.startswith("@"):
                if re.match(r"@(media|supports|container|layer)\b", prelude):
                    parse(brace + 1, k - 1, media + [re.sub(r"^@\w+\s*", "", prelude)] if prelude.startswith("@media") else media)
            else:
                body_start, pos = brace + 1, brace + 1
                for decl in re.finditer(r"[^;]+", scan[body_start:k - 1]):
                    d0 = body_start + decl.start()
                    chunk = scan[d0:body_start + decl.end()]
                    imp = re.search(r"\s*!\s*important\b", chunk, flags=re.I)
                    if not imp or ":" not in chunk:
                        continue
                    prop = chunk.split(":", 1)[0].strip().lower()
                    selector = re.sub(r"/\*.*?\*/", " ", text[j:brace], flags=re.S).strip()
                    found.append({"selector": selector, "prop": prop, "media": media,
                                  "imp_start": d0 + imp.start(), "imp_end": d0 + imp.end()})
            j = k

    parse(0, len(scan), [])
    return found


def sheets() -> dict:
    """name -> {"text": source text, "where": file or (page, block index)}"""
    out = {f: {"text": open(os.path.join(REPO, f)).read(), "file": f} for f in FILES}
    for page in portfolio_pages():
        if "#" in page:
            continue
        for i, block in enumerate(re.findall(r"<style[^>]*>(.*?)</style>", open(os.path.join(REPO, page)).read(), flags=re.S)):
            if "!important" in block:
                out[f"{page}#style{i}"] = {"text": block, "page": page, "index": i}
    return out


def variant(text: str, decls: list, drop: set) -> str:
    for d in sorted((d for d in decls if d["id"] in drop), key=lambda d: -d["imp_start"]):
        text = text[:d["imp_start"]] + text[d["imp_end"]:]
    return text


def widths_from_breakpoints(all_text: str) -> list[int]:
    bps = sorted({int(float(x)) for x in re.findall(r"(?:max|min)-width\s*:\s*(\d+(?:\.\d+)?)px", all_text)})
    edges = [320] + [b for b in bps if b >= 320] + [1600]
    return sorted({(a + b) // 2 for a, b in zip(edges, edges[1:]) if b > a} | {375, 820, 1280, 1600})


PAGE_JS = r"""async ({sheets, cands}) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pathOf = el => { const p = []; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { let i = 1, s = n; while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++; p.push(n.tagName + ':' + i); } return p.reverse().join('>'); };
  const PSEUDOS = ['', '::before', '::after'];
  const snap = () => { const m = new Map(); for (const el of document.querySelectorAll('body, body *')) { if (el.closest('script,style,noscript,link')) continue; for (const ps of PSEUDOS) { const cs = getComputedStyle(el, ps || null); if (ps && (cs.content === 'none' || cs.content === 'normal')) continue; const o = {}; for (const p of cs) o[p] = cs.getPropertyValue(p); m.set(pathOf(el) + ps, {el, ps, o}); } } return m; };
  const base = snap();
  // swap each sheet's text in place
  const norm = s => s.replace(/\s+/g, ' ').trim();
  for (const [name, info] of Object.entries(sheets)) {
    if (info.file) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const href = (link.getAttribute('href') || '').split('?')[0].replace(/^\//, '');
        if (href === info.file) { link.sheet && (link.sheet.disabled = true); const st = document.createElement('style'); st.textContent = info.variant; link.after(st); }
      }
    } else {
      for (const st of document.querySelectorAll('style')) if (norm(st.textContent) === norm(info.original)) st.textContent = info.variant;
    }
  }
  await sleep(250);
  const after = snap();
  const changed = [];
  for (const [k, a] of base) { const b = after.get(k); if (!b) continue; for (const p in a.o) if (a.o[p] !== b.o[p]) changed.push({k, el: a.el, ps: a.ps, p}); }
  // attribute changes to candidate declarations
  const related = (cssProp, declProp) => cssProp === declProp || cssProp.startsWith(declProp + '-') || declProp.startsWith(cssProp + '-') ||
    ({inset: /^(top|right|bottom|left|inset)/, font: /^(font|line-height)/, flex: /^flex/, grid: /^grid/, 'place-items': /^(align|justify)-items/,
      'place-content': /^(align|justify)-content/, 'place-self': /^(align|justify)-self/, gap: /gap$/, overflow: /^overflow/, outline: /^outline/,
      'text-decoration': /^text-decoration/, columns: /^column/, background: /^background/, border: /^border/, 'list-style': /^list-style/,
      animation: /^animation/, transition: /^transition/, 'border-radius': /radius$/, 'inset-inline': /^(left|right|inset)/, 'inset-block': /^(top|bottom|inset)/,
      'margin-inline': /^margin/, 'margin-block': /^margin/, 'padding-inline': /^padding/, 'padding-block': /^padding/}[declProp]?.test(cssProp) || false);
  const sel = s => s.replace(/::?(before|after|first-line|first-letter|marker|placeholder|selection)\b/g, '');
  const mediaOk = d => d.media.every(m => { try { return matchMedia(m).matches; } catch (e) { return true; } });
  const needed = new Set();
  for (const c of changed) {
    let hit = false;
    for (let el = c.el, depth = 0; el && el !== document.documentElement && !hit; el = el.parentElement, depth++) {
      for (const d of cands) {
        if (!related(c.p, d.prop) || !mediaOk(d)) continue;
        if (depth === 0 && c.ps && !d.selector.includes(c.ps.slice(1))) continue;
        let match = false; for (const s of d.selector.split(/,(?![^()]*\))/)) { try { if (el.matches(sel(s.trim()) || '*')) { match = true; break; } } catch (e) {} }
        if (match) { needed.add(d.id); hit = true; }
      }
    }
    if (!hit) for (const d of cands) { let match = false; for (const s of d.selector.split(/,(?![^()]*\))/)) { try { if (c.el.matches(sel(s.trim()) || '*')) { match = true; break; } } catch (e) {} } if (match) needed.add(d.id); }
  }
  return {changed: changed.length, needed: [...needed], sample: [...new Set(changed.map(c => c.p))].slice(0, 12).concat(changed.slice(0, 3).map(c => c.k.slice(-60)))};
}"""


def main() -> int:
    from playwright.sync_api import sync_playwright

    words = js_words()
    src = sheets()
    decls, all_text = [], ""
    for name, info in src.items():
        all_text += info["text"]
        for i, d in enumerate(declarations(info["text"])):
            d.update(id=f"{name}|{i}", sheet=name)
            skip = (INTERACTIVE.search(d["selector"]) or DYN_ATTR.search(d["selector"]) or any(SKIP_MEDIA.search(m) for m in d["media"])
                    or any(t in words for t in re.findall(r"[.#]([A-Za-z_][\w-]*)", re.sub(r"\[[^\]]*\]", "", d["selector"]))))
            d["candidate"] = not skip
            decls.append(d)
    by_sheet = {}
    for d in decls:
        by_sheet.setdefault(d["sheet"], []).append(d)
    candidates = {d["id"] for d in decls if d["candidate"]}
    print(f"!important declarations: {len(decls)}; candidates: {len(candidates)}", flush=True)
    widths = widths_from_breakpoints(all_text)
    views = portfolio_pages()
    for arg in sys.argv:
        if arg.startswith("--views="):
            views = arg.split("=", 1)[1].split(",")
        if arg.startswith("--widths="):
            widths = [int(x) for x in arg.split("=", 1)[1].split(",")]
    print(f"views: {len(views)}  widths: {len(widths)}", flush=True)
    url = serve(REPO)
    cand_meta = {d["id"]: {"id": d["id"], "selector": d["selector"], "prop": d["prop"], "media": d["media"]} for d in decls}
    round_no = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        while True:
            round_no += 1
            needed_round, changed_total, t0, last_sample = set(), 0, time.time(), []
            for view in views:
                page_name = view.split("#")[0]
                page_html = open(os.path.join(REPO, page_name)).read()
                payload_sheets = {}
                for name, info in src.items():
                    if "file" in info:
                        if info["file"] not in page_html:
                            continue
                    elif info["page"] != page_name:
                        continue
                    drop = set() if os.environ.get("IMPORTANT_AUDIT_NODROP") else candidates
                    payload_sheets[name] = {"file": info.get("file"), "original": info["text"],
                                            "variant": variant(info["text"], by_sheet.get(name, []), drop)}
                page_cands = [cand_meta[i] for i in candidates if i.split("|")[0] in payload_sheets]
                if not page_cands:
                    continue
                for w in widths:
                    ctx = browser.new_context(viewport={"width": w, "height": 900}, reduced_motion="reduce")
                    page = ctx.new_page()
                    page.route("**/_vercel/**", lambda r: r.abort())
                    page.goto(url + view, wait_until="domcontentloaded", timeout=90000)
                    page.wait_for_timeout(800)
                    page.evaluate(SETTLE_JS)
                    res = page.evaluate(PAGE_JS, {"sheets": payload_sheets, "cands": page_cands})
                    ctx.close()
                    changed_total += res["changed"]
                    last_sample = res["sample"]
                    needed_round |= set(res["needed"])
                print(f"  round {round_no}: {view} done ({len(needed_round)} needed so far)", flush=True)
            candidates -= needed_round
            if os.environ.get("IMPORTANT_AUDIT_DEBUG"):
                print("   sample:", last_sample, flush=True)
            print(f"round {round_no}: {changed_total} changed values, {len(needed_round)} declarations keep !important, "
                  f"{len(candidates)} candidates left ({int(time.time() - t0)}s)", flush=True)
            if not needed_round:
                if changed_total:
                    print("STOP: removing the remaining candidates still changes computed styles, but no candidate "
                          "could be attributed. Nothing was applied.", flush=True)
                    return 1
                break
        browser.close()
    removable = [d for d in decls if d["id"] in candidates]
    per = {}
    for d in removable:
        per[d["sheet"]] = per.get(d["sheet"], 0) + 1
    print(json.dumps({"removable": len(removable), "of": len(decls), "per_sheet": per}, indent=1))
    json.dump([{k: d[k] for k in ("id", "sheet", "selector", "prop", "media")} for d in removable],
              open(os.path.join(os.environ.get("IMPORTANT_AUDIT_OUT", "/tmp"), "important_removable.json"), "w"), indent=1)
    if "--apply" in sys.argv:
        drop = {d["id"] for d in removable}
        for name, info in src.items():
            new = variant(info["text"], by_sheet.get(name, []), drop)
            if new == info["text"]:
                continue
            if "file" in info:
                open(os.path.join(REPO, info["file"]), "w").write(new)
            else:
                path = os.path.join(REPO, info["page"])
                html = open(path).read()
                blocks = list(re.finditer(r"(<style[^>]*>)(.*?)(</style>)", html, flags=re.S))
                b = blocks[info["index"]]
                assert b.group(2) == info["text"]
                html = html[:b.start(2)] + new + html[b.end(2):]
                open(path, "w").write(html)
        print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
