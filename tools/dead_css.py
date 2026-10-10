#!/usr/bin/env python3
"""Find (and optionally remove) portfolio CSS rules that cannot match anything.

A selector is dead when it requires a class or id that appears in no portfolio page and
no portfolio script. Tokens inside :not(), :is(), :where() and :has() are not treated as
required, and inline <style> text is excluded from the search so CSS cannot vouch for
itself. A rule is removed only when every selector in its list is dead; a rule with some
live selectors keeps them and loses only the dead ones. @media / @supports blocks left
empty are removed too. Comments and formatting are otherwise untouched.

A class assembled at runtime from pieces (for example 'is-' + state) would not be found
in the sources, so always prove the result with
scripts/state_ui_compare/portfolio_compare.py (identical computed styles, text and
structure on every page at every width).

    python3 tools/dead_css.py                 # report
    python3 tools/dead_css.py --apply FILE... # rewrite the given .css / .html files
"""
from __future__ import annotations

import glob
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXCLUDE_PAGES = {"project-health.html", "state-evals.html"}
SCRIPTS = ["site-shell.js", "site-environment.js"]
SHARED_CSS = ["site-shell.css", "site-components.css", "site-redesign.css", "site-polish.css",
              "implementation-context-case.css", "final-freeze-polish.css"]


def source_words() -> set[str]:
    corpus = []
    for page in glob.glob(os.path.join(REPO, "*.html")):
        if os.path.basename(page) in EXCLUDE_PAGES:
            continue
        corpus.append(re.sub(r"<style[^>]*>.*?</style>", "", open(page).read(), flags=re.S))
    for script in SCRIPTS:
        corpus.append(open(os.path.join(REPO, script)).read())
    return set(re.findall(r"[A-Za-z_][\w-]*", "\n".join(corpus)))


def required_tokens(selector: str) -> list[str]:
    s = re.sub(r":(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)", "", selector)
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = re.sub(r"::?[\w-]+(?:\([^)]*\))?", "", s)
    return re.findall(r"[.#]([A-Za-z_][\w-]*)", s)


def blank_comments(css: str) -> str:
    """Same length as css, with comments replaced by spaces, so offsets stay valid."""
    return re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), css, flags=re.S)


def split_selectors(prelude: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in prelude:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def plan_edits(css: str, words: set[str]):
    """Return (edits, stats). Each edit is (start, end, replacement) on the original text."""
    scan = blank_comments(css)
    edits, stats = [], {"rules": 0, "dead_rules": 0, "dead_selectors": 0}

    def block_end(open_brace: int, limit: int) -> int:
        depth, k = 1, open_brace + 1
        while k < limit and depth:
            if scan[k] == "{":
                depth += 1
            elif scan[k] == "}":
                depth -= 1
            k += 1
        return k

    def parse(start: int, end: int) -> bool:
        """Plan edits in [start, end). Returns True if every rule in the range is removed."""
        j, any_rule, all_removed = start, False, True
        while j < end:
            brace = scan.find("{", j, end)
            if brace < 0:
                break
            stop = block_end(brace, end)
            prelude = scan[j:brace].strip()
            if prelude.startswith("@"):
                if re.match(r"@(media|supports|container|layer)\b", prelude):
                    any_rule = True
                    if parse(brace + 1, stop - 1):
                        edits.append((j + (len(scan[j:brace]) - len(scan[j:brace].lstrip())), stop, ""))
                    else:
                        all_removed = False
                else:
                    any_rule, all_removed = True, False  # @font-face, @keyframes, ...: keep
            else:
                any_rule = True
                stats["rules"] += 1
                selectors = split_selectors(prelude)
                dead = [s for s in selectors if any(t not in words for t in required_tokens(s))]
                stats["dead_selectors"] += len(dead)
                lead = j + (len(scan[j:brace]) - len(scan[j:brace].lstrip()))
                if dead and len(dead) == len(selectors):
                    stats["dead_rules"] += 1
                    edits.append((lead, stop, ""))
                else:
                    all_removed = False
                    if dead:
                        live = [s for s in selectors if s not in dead]
                        edits.append((lead, brace, ",".join(live)))
            j = stop
        return any_rule and all_removed

    parse(0, len(css))
    return edits, stats


def apply_edits(text: str, edits) -> str:
    # Outer @media removals contain inner edits; drop edits nested inside a removed range.
    edits = sorted(edits, key=lambda e: (e[0], -e[1]))
    kept, covered_until = [], -1
    for e in edits:
        if e[0] < covered_until:
            continue
        kept.append(e)
        if e[2] == "":
            covered_until = e[1]
    for start, end, repl in sorted(kept, reverse=True):
        text = text[:start] + repl + text[end:]
    return re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", text)


def process_css(text: str, words: set[str]):
    edits, stats = plan_edits(text, words)
    return apply_edits(text, edits), stats


def process_html(text: str, words: set[str]):
    totals = {"rules": 0, "dead_rules": 0, "dead_selectors": 0}

    def fix(m):
        new, stats = process_css(m.group(2), words)
        for k in totals:
            totals[k] += stats[k]
        return m.group(1) + new + m.group(3)

    return re.sub(r"(<style[^>]*>)(.*?)(</style>)", fix, text, flags=re.S), totals


def main() -> int:
    words = source_words()
    apply = "--apply" in sys.argv
    targets = [a for a in sys.argv[1:] if a != "--apply"] or SHARED_CSS + ["index.html"]
    for name in targets:
        path = os.path.join(REPO, name)
        text = open(path).read()
        new, stats = (process_html if name.endswith(".html") else process_css)(text, words)
        print(f"{name:34} rules:{stats['rules']:5}  dead selectors:{stats['dead_selectors']:5}  "
              f"fully-dead rules:{stats['dead_rules']:5}  bytes {len(text):7} -> {len(new):7}")
        if apply and new != text:
            open(path, "w").write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
