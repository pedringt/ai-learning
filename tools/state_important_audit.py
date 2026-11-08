#!/usr/bin/env python3
"""Find State `!important` flags (CSS pass 3) or `html body` / `body` selector prefixes (pass 4) that change
nothing, and optionally remove them.

The State counterpart of tools/important_audit.py. State is an app, not a set of static pages, so it reuses
scripts/state_ui_compare: a local backend with the demo seed and no model, a deterministic fake Ask, and capture.js's
walk through every view, the Ask drawer lifecycle and Baseline Setup (20 states). At each state a hook:

1. records every element's full computed style (incl. ::before / ::after, animations frozen),
2. swaps each State stylesheet for a copy with the current candidates' `!important` removed (in place, so cascade
   order is unchanged), records again, and puts the originals back,
3. traces every changed (element, property) to the candidate declarations that could cause it (same or related
   property; on the element, or for inherited values an ancestor; selector and @media matching). Those keep their flag.

It does this at one width inside every breakpoint interval of State's CSS. Rounds repeat until removing the remaining
candidates changes nothing anywhere.

Conservative by construction: a flag is removed only if its selector matched an element in at least one recorded
state at some width (so it was actually exercised) and never caused a change. Rules with interaction pseudo-classes
(:hover, :focus, ...), script-toggled attributes ([open], [aria-expanded], [hidden], ...) or print / preference /
pointer media keep their flag without being tested.

    python3 tools/state_important_audit.py            # report; writes the removable list to $IMPORTANT_AUDIT_OUT
    python3 tools/state_important_audit.py --apply    # also rewrite the stylesheets
    python3 tools/state_important_audit.py --resume   # continue from the last finished round's saved progress
    python3 tools/state_important_audit.py --prefixes # the same for selector prefixes: a candidate is a whole rule
                                                      # whose selectors start with `html body ` or `body `; stripping
                                                      # them matches the same elements with lower specificity

Then prove it with scripts/state_ui_compare/compare.py and the browser tests. No model calls.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(REPO, "scripts", "state_ui_compare"))
sys.path.insert(0, os.path.join(REPO, "tools"))
import compare  # noqa: E402
from important_audit import DYN_ATTR, INTERACTIVE, SKIP_MEDIA, blank, declarations, variant, widths_from_breakpoints  # noqa: E402

APP = os.path.join(REPO, "implementation-context-prototype")
FILES = ["state-shell.css", "context-tool.css", "state-app.css"]

HOOK_JS = r"""({sheets, cands}) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const audit = window.__STATE_IMPORTANT_AUDIT = {needed: new Set(), seen: new Set(), changed: 0, states: 0, sample: []};
  const pathOf = el => { const p = []; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { let i = 1, s = n; while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++; p.push(n.tagName + ':' + i); } return p.reverse().join('>'); };
  const PSEUDOS = ['', '::before', '::after'];
  const freeze = () => { for (const a of document.getAnimations()) { try { if (a.effect?.getComputedTiming?.().iterations === Infinity) a.currentTime = 0; else a.finish(); } catch (e) {} } };
  const snap = () => { freeze(); const m = new Map(); for (const el of document.querySelectorAll('body, body *')) { if (el.closest('script,style,noscript,link')) continue; for (const ps of PSEUDOS) { const cs = getComputedStyle(el, ps || null); if (ps && (cs.content === 'none' || cs.content === 'normal')) continue; const o = {}; for (const p of cs) { if (p.startsWith('transition') || p.startsWith('animation')) continue; o[p] = cs.getPropertyValue(p); } m.set(pathOf(el) + ps, {el, ps, o}); } } return m; };
  const links = () => [...document.querySelectorAll('link[rel="stylesheet"]')];
  const fileOf = link => (link.getAttribute('href') || '').split('?')[0].split('/').pop();
  const swap = () => { const added = []; for (const link of links()) { const v = sheets[fileOf(link)]; if (v === undefined || !link.sheet) continue; link.sheet.disabled = true; const st = document.createElement('style'); st.textContent = v; link.after(st); added.push([link, st]); } return added; };
  const restore = added => { for (const [link, st] of added) { st.remove(); link.sheet.disabled = false; } };
  const related = (cssProp, declProp) => cssProp === declProp || cssProp.startsWith(declProp + '-') || declProp.startsWith(cssProp + '-') ||
    ({inset: /^(top|right|bottom|left|inset)/, font: /^(font|line-height)/, flex: /^flex/, grid: /^grid/, 'place-items': /^(align|justify)-items/,
      'place-content': /^(align|justify)-content/, 'place-self': /^(align|justify)-self/, gap: /gap$/, overflow: /^overflow/, outline: /^outline/,
      'text-decoration': /^text-decoration/, columns: /^column/, background: /^background/, border: /^border/, 'list-style': /^list-style/,
      animation: /^animation/, transition: /^transition/, 'border-radius': /radius$/, 'inset-inline': /^(left|right|inset)/, 'inset-block': /^(top|bottom|inset)/,
      'margin-inline': /^margin/, 'margin-block': /^margin/, 'padding-inline': /^padding/, 'padding-block': /^padding/}[declProp]?.test(cssProp) || false);
  const bare = s => s.replace(/::?(before|after|first-line|first-letter|marker|placeholder|selection)\b/g, '');
  const mediaOk = d => d.media.every(m => { try { return matchMedia(m).matches; } catch (e) { return true; } });
  const parts = d => d.selector.split(/,(?![^()]*\))/).map(s => bare(s.trim()) || '*');
  const matches = (el, d) => parts(d).some(s => { try { return el.matches(s); } catch (e) { return false; } });
  window.STATE_CAPTURE_HOOK = async name => {
    audit.states++;
    for (const d of cands) if (!audit.seen.has(d.id) && mediaOk(d) && parts(d).some(s => { try { return document.querySelector(s); } catch (e) { return false; } })) audit.seen.add(d.id);
    // Noise check: a state that is still changing on its own (an Ask answer streaming in) must not be blamed on CSS.
    // Snapshot twice with nothing swapped, and ignore any value that moved between the two.
    const base = snap();
    await sleep(200);
    const still = snap();
    const noisy = new Set();
    for (const [k, a] of base) { const b = still.get(k); if (!b) { noisy.add(k + '|*'); continue; } for (const p in a.o) if (a.o[p] !== b.o[p]) noisy.add(k + '|' + p); }
    const added = swap();
    await sleep(200);
    const after = snap();
    restore(added);
    await sleep(150);
    // A value the stylesheet swap caused returns once the originals are back; one that moved on its own does not.
    const back = snap();
    for (const [k, a] of still) { const b = back.get(k); if (!b) { noisy.add(k + '|*'); continue; } for (const p in a.o) if (a.o[p] !== b.o[p]) noisy.add(k + '|' + p); }
    const changed = [];
    for (const [k, a] of still) { const b = after.get(k); if (!b || noisy.has(k + '|*')) continue; for (const p in a.o) if (a.o[p] !== b.o[p] && !noisy.has(k + '|' + p)) changed.push({k, el: a.el, ps: a.ps, p}); }
    audit.changed += changed.length;
    if (changed.length && audit.sample.length < 6) audit.sample.push(name + ': ' + changed.slice(0, 2).map(c => c.p + ' @ ' + c.k.slice(-50)).join(' | '));
    for (const c of changed) {
      let hit = false;
      for (let el = c.el, depth = 0; el && el !== document.documentElement && !hit; el = el.parentElement, depth++) {
        for (const d of cands) {
          if (!d.props.some(pr => related(c.p, pr)) || !mediaOk(d)) continue;
          if (depth === 0 && c.ps && !d.selector.includes(c.ps.slice(1))) continue;
          if (matches(el, d)) { audit.needed.add(d.id); hit = true; }
        }
      }
      if (!hit) for (const d of cands) if (matches(c.el, d)) audit.needed.add(d.id);
    }
  };
}"""


PREFIX = re.compile(r"^(html\s+)?body\s+(?=[.#\[:*a-z])", re.I)


def prefixed_rules(text: str) -> list:
    """Style rules with at least one selector that starts with `html body ` or `body `, with the spans to delete."""
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
            prelude = scan[j:brace]
            if prelude.strip().startswith("@"):
                if re.match(r"\s*@(media|supports|container|layer)\b", prelude):
                    p = prelude.strip()
                    parse(brace + 1, k - 1, media + [re.sub(r"^@\w+\s*", "", p)] if p.startswith("@media") else media)
            else:
                spans, kept, at, depth2 = [], [], j, 0
                for i in range(j, brace + 1):
                    ch = scan[i] if i < brace else ","
                    depth2 += ch in "([" and 1 or ch in ")]" and -1 or 0
                    if ch == "," and depth2 == 0:
                        lead = at + len(scan[at:i]) - len(scan[at:i].lstrip())
                        m = PREFIX.match(scan[lead:i])
                        if m:
                            spans.append((lead, lead + m.end()))
                        kept.append(text[lead + (m.end() if m else 0):i].strip())
                        at = i + 1
                if spans:
                    props = sorted({d.split(":", 1)[0].strip().lower() for d in scan[brace + 1:k - 1].split(";") if ":" in d})
                    found.append({"selector": ",".join(kept), "props": props, "media": media, "spans": spans})
            j = k

    parse(0, len(scan), [])
    return found


def strip_prefixes(text: str, rules: list, drop: set) -> str:
    for start, end in sorted((sp for r in rules if r["id"] in drop for sp in r["spans"]), reverse=True):
        text = text[:start] + text[end:]
    return text


def main() -> int:
    from playwright.sync_api import sync_playwright

    src = {f: open(os.path.join(APP, f)).read() for f in FILES}
    decls = []
    prefixes = "--prefixes" in sys.argv
    make_variant = strip_prefixes if prefixes else variant
    for name, text in src.items():
        for i, d in enumerate(prefixed_rules(text) if prefixes else declarations(text)):
            d.update(id=f"{name}|{i}", sheet=name)
            d.setdefault("props", [d.get("prop")])
            d["candidate"] = not (INTERACTIVE.search(d["selector"]) or DYN_ATTR.search(d["selector"])
                                  or any(SKIP_MEDIA.search(m) for m in d["media"]))
            decls.append(d)
    by_sheet: dict[str, list] = {}
    for d in decls:
        by_sheet.setdefault(d["sheet"], []).append(d)
    candidates = {d["id"] for d in decls if d["candidate"]}
    meta = {d["id"]: {"id": d["id"], "selector": d["selector"], "props": d["props"], "media": d["media"]} for d in decls}
    widths = widths_from_breakpoints("".join(src.values()))
    for arg in sys.argv:
        if arg.startswith("--widths="):
            widths = [int(x) for x in arg.split("=", 1)[1].split(",")]
    print(f"{'prefixed rules' if prefixes else '!important declarations'}: {len(decls)}; candidates: {len(candidates)}; widths: {widths}", flush=True)
    seen: set[str] = set()
    round_no = 0
    out_dir = os.environ.get("IMPORTANT_AUDIT_OUT", tempfile.gettempdir())
    kind = "prefix" if prefixes else "important"
    progress = os.path.join(out_dir, f"state_{kind}_progress.json")
    if "--resume" in sys.argv:
        saved = json.load(open(progress))
        candidates, seen, round_no = set(saved["candidates"]), set(saved["seen"]), saved["round"]
        print(f"resumed after round {round_no}: {len(candidates)} candidates left", flush=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        while True:
            round_no += 1
            needed, changed, t0, sample = set(), 0, time.time(), []
            sheets = {f: make_variant(text, by_sheet.get(f, []), candidates) for f, text in src.items()}
            cands = [meta[i] for i in sorted(candidates)]
            for w in widths:
                url = compare.serve_frontend(APP, compare.start_backend())
                ctx = browser.new_context(viewport={"width": w, "height": 900})
                page = ctx.new_page()
                page.goto(url + "#workspace", wait_until="domcontentloaded", timeout=90000)
                page.wait_for_timeout(2500)
                page.evaluate(HOOK_JS, {"sheets": sheets, "cands": cands})
                page.add_script_tag(content=compare.CAPTURE_JS)
                page.evaluate("() => STATE_CAPTURE.run()")
                res = page.evaluate("() => { const a = window.__STATE_IMPORTANT_AUDIT; return {needed: [...a.needed], seen: [...a.seen], changed: a.changed, states: a.states, sample: a.sample}; }")
                ctx.close()
                needed |= set(res["needed"])
                seen |= set(res["seen"])
                changed += res["changed"]
                sample = sample or res["sample"]
                print(f"  round {round_no} width {w}: {res['states']} states, {res['changed']} changed values, "
                      f"{len(needed)} keep so far", flush=True)
            candidates -= needed
            json.dump({"round": round_no, "candidates": sorted(candidates), "seen": sorted(seen)}, open(progress, "w"))
            if os.environ.get("IMPORTANT_AUDIT_DEBUG"):
                print("   sample:", sample, flush=True)
            print(f"round {round_no}: {changed} changed values, {len(needed)} kept, "
                  f"{len(candidates)} candidates left ({int(time.time() - t0)}s)", flush=True)
            if not needed:
                if changed:
                    print("STOP: removing the remaining candidates still changes computed styles, but no candidate could "
                          "be attributed. Nothing was applied.", flush=True)
                    return 1
                break
        browser.close()
    unobserved = candidates - seen
    removable = [d for d in decls if d["id"] in candidates and d["id"] in seen]
    per: dict[str, int] = {}
    for d in removable:
        per[d["sheet"]] = per.get(d["sheet"], 0) + 1
    print(json.dumps({"removable": len(removable), "of": len(decls), "kept_unobserved": len(unobserved), "per_sheet": per}, indent=1))
    json.dump([{k: d[k] for k in ("id", "sheet", "selector", "props", "media")} for d in removable],
              open(os.path.join(out_dir, f"state_{kind}_removable.json"), "w"), indent=1)
    if "--apply" in sys.argv:
        drop = {d["id"] for d in removable}
        for f, text in src.items():
            new = make_variant(text, by_sheet.get(f, []), drop)
            if new != text:
                open(os.path.join(APP, f), "w").write(new)
        print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
