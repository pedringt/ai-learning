#!/usr/bin/env python3
"""Find (and optionally remove) CSS declarations that a later rule in the same file always overrides.

A declaration is overridden when, for every selector in its rule's list, a LATER rule in the same stylesheet lists that
same selector, sets the same property with at least the same importance (an !important declaration is only overridden
by another !important one), and applies whenever the earlier one does (its @media / @supports conditions are a subset
of the earlier rule's). Same selector means same specificity, so the later one wins on every element the earlier one
matches, whatever other rules exist. Only exact property names count: a later `margin` does
not remove an earlier `margin-top`.

The one way a later declaration can fail to win is when the browser drops it as invalid, which is how fallbacks work
(`height:100vh; height:100dvh`). So an earlier declaration is kept whenever the later value uses a vendor prefix or a
newer unit or function (dvh/svh/lvh, fill-available, clamp/min/max, color-mix, ...).

Comments and formatting are otherwise untouched; a rule left with no declarations is removed. Prove the result with
scripts/state_ui_compare/compare.py (State) or portfolio_compare.py.

    python3 tools/overridden_css.py --state                  # report on State's stylesheets
    python3 tools/overridden_css.py --state --apply FILE...  # paths relative to implementation-context-prototype/
"""
from __future__ import annotations

import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATE_DIR = os.path.join(REPO, "implementation-context-prototype")
STATE_CSS = ["state-app.css", "context-tool.css", "state-shell.css"]
RISKY_VALUE = re.compile(r"-webkit-|-moz-|-ms-|fill-available|stretch|\b\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw|cqw|cqh)\b"
                         r"|\b(clamp|min|max|color-mix|light-dark|round|env)\(|@supports", re.I)


def blank(css: str) -> str:
    """Same length as css: comments become spaces and string contents become 'x', so offsets stay valid."""
    css = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), css, flags=re.S)
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'',
                  lambda m: m.group(0)[0] + "x" * (len(m.group(0)) - 2) + m.group(0)[-1], css)


def norm_selector(prelude: str) -> str:
    parts, depth, cur = [], 0, ""
    for ch in prelude:
        depth += ch in "([" and 1 or ch in ")]" and -1 or 0
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return ",".join(re.sub(r"\s+", " ", p).strip() for p in parts if p.strip())


def declarations(scan: str, start: int, end: int):
    """Yield (decl_start, decl_end_incl_semicolon, prop, value, important) for each declaration in [start, end)."""
    i, depth = start, 0
    seg = start
    while i <= end:
        ch = scan[i] if i < end else ";"
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            text = scan[seg:i]
            if ":" in text and text.strip():
                lead = seg + (len(text) - len(text.lstrip()))
                prop, value = text.split(":", 1)
                important = bool(re.search(r"!\s*important\s*$", value.strip(), re.I))
                yield lead, (i + 1 if i < end else end), prop.strip().lower(), value.strip(), important
            seg = i + 1
        i += 1


def plan(css: str):
    scan = blank(css)
    rules = []  # (context, selector, body_start, body_end, rule_start, rule_end)

    def block_end(open_brace: int, limit: int) -> int:
        depth, k = 1, open_brace + 1
        while k < limit and depth:
            depth += {"{": 1, "}": -1}.get(scan[k], 0)
            k += 1
        return k

    def walk(start: int, end: int, context: tuple):
        j = start
        while j < end:
            brace = scan.find("{", j, end)
            if brace < 0:
                break
            stop = block_end(brace, end)
            prelude = scan[j:brace].strip()
            lead = j + (len(scan[j:brace]) - len(scan[j:brace].lstrip()))
            if prelude.startswith("@"):
                if re.match(r"@(media|supports|container|layer)\b", prelude):
                    walk(brace + 1, stop - 1, context + (re.sub(r"\s+", " ", prelude),))
            else:
                rules.append((context, norm_selector(prelude), brace + 1, stop - 1, lead, stop))
            j = stop

    walk(0, len(css), ())
    # Scanning from the end, remember every later (selector, property) with its context, importance and value.
    # A declaration is overridden for one selector when a later rule lists that same selector, sets the same property
    # with at least the same importance, and applies whenever this one does (its @media/@supports conditions are a
    # subset of this rule's). It is removed only when that holds for every selector in its rule's list.
    later: dict[tuple[str, str], list[tuple[frozenset, bool, str]]] = {}
    removals, emptied = [], []
    for context, selector, b0, b1, r0, r1 in reversed(rules):
        selectors = selector.split(",")
        conditions = frozenset(context)
        decls = list(declarations(scan, b0, b1))
        kept = 0
        # Within one rule, a later declaration of the same property overrides an earlier one too.
        for d0, d1, prop, value, important in reversed(decls):
            def beaten(sel):
                return any(ctx <= conditions and (imp or not important) and not RISKY_VALUE.search(val)
                           for ctx, imp, val in later.get((sel, prop), []))
            if not prop.startswith("--") and all(beaten(sel) for sel in selectors):
                removals.append((d0, d1))
            else:
                kept += 1
            for sel in selectors:
                later.setdefault((sel, prop), []).append((conditions, important, value))
        if decls and kept == 0:
            emptied.append((r0, r1))
    return removals, emptied


def apply(css: str, removals, emptied) -> str:
    spans = sorted(set(emptied) | {r for r in removals if not any(e0 <= r[0] and r[1] <= e1 for e0, e1 in emptied)},
                   reverse=True)
    for start, end in spans:
        css = css[:start] + css[end:]
    return css


def main() -> int:
    args = [a for a in sys.argv[1:] if a not in ("--apply", "--state")]
    targets = args or STATE_CSS
    base = STATE_DIR if "--state" in sys.argv else REPO
    for name in targets:
        path = os.path.join(base, name)
        text = open(path).read()
        removals, emptied = plan(text)
        new = apply(text, removals, emptied)
        print(f"{name:20} overridden declarations:{len(removals):5}  rules emptied:{len(emptied):4}  "
              f"!important {text.count('!important'):5} -> {new.count('!important'):5}  bytes {len(text):7} -> {len(new):7}")
        if "--apply" in sys.argv and new != text:
            open(path, "w").write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
