#!/usr/bin/env python3
"""
Read-only regression checks for the Practical AI Learning Portfolio.
This script MUST NOT rewrite HTML.
"""
from pathlib import Path
from urllib.parse import urlparse
from html.parser import HTMLParser
import re, collections, sys

ROOT = Path(__file__).resolve().parent
HTML = sorted(ROOT.glob("*.html"))

EXPECTED_NAV = ["Home","Capabilities","Applied Work","Learning Guide"]
CAPABILITY_PAGES = {"capabilities.html","discovery.html","plan.html","agent-flow.html","evals.html"}

class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids=[]
        self.hrefs=[]
        self.in_nav=False
        self.nav_depth=0
        self.nav_labels=[]
        self.current_label=None
        self.in_select=False
        self.option_labels=[]
        self._capture=None
        self._buf=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if "id" in d: self.ids.append(d["id"])
        if tag=="a" and "href" in d: self.hrefs.append(d["href"])
        if tag=="nav" and d.get("aria-label")=="Primary pages":
            self.in_nav=True; self.nav_depth=1
        elif self.in_nav and tag=="nav":
            self.nav_depth+=1
        if self.in_nav and tag in ("a","button"):
            self._capture="nav"; self._buf=[]
        if tag=="select" and d.get("aria-label")=="Choose page":
            self.in_select=True
        if self.in_select and tag=="option":
            self._capture="option"; self._buf=[]
    def handle_endtag(self, tag):
        if self._capture=="nav" and tag in ("a","button"):
            self.nav_labels.append(" ".join("".join(self._buf).split()))
            self._capture=None
        elif self._capture=="option" and tag=="option":
            self.option_labels.append(" ".join("".join(self._buf).split()))
            self._capture=None
        if self.in_nav and tag=="nav":
            self.nav_depth-=1
            if self.nav_depth<=0: self.in_nav=False
        if self.in_select and tag=="select":
            self.in_select=False
    def handle_data(self, data):
        if self._capture:
            self._buf.append(data)

def has_anchor(text, frag):
    return f'id="{frag}"' in text or f"id='{frag}'" in text or f'data-page="{frag}"' in text

issues=[]
for path in HTML:
    text=path.read_text()
    c=Collector(); c.feed(text)

    dup=[x for x,n in collections.Counter(c.ids).items() if n>1]
    if dup: issues.append(f"{path.name}: duplicate IDs {dup}")

    if c.nav_labels and c.nav_labels!=EXPECTED_NAV:
        issues.append(f"{path.name}: desktop nav {c.nav_labels}")
    if c.option_labels and c.option_labels!=EXPECTED_NAV:
        issues.append(f"{path.name}: mobile nav {c.option_labels}")

    for href in c.hrefs:
        if not href or href.startswith(("http://","https://","mailto:","tel:","javascript:")):
            continue
        if href.startswith("#"):
            frag=href[1:]
            if frag and not has_anchor(text, frag):
                issues.append(f"{path.name}: missing same-page anchor {href}")
            continue
        u=urlparse(href)
        target=ROOT/u.path
        if not target.exists():
            issues.append(f"{path.name}: missing file {href}")
            continue
        if u.fragment and not has_anchor(target.read_text(),u.fragment):
            issues.append(f"{path.name}: missing target anchor {href}")

    if path.name in CAPABILITY_PAGES:
        if text.count('class="capability-local-nav"') != 1:
            issues.append(f"{path.name}: capability local-nav count")
        if "capability-shell" not in text:
            issues.append(f"{path.name}: capability-shell missing")

    # shared stylesheets should be present exactly once
    for sheet in ("site-shell.css","site-components.css"):
        if text.count(sheet)!=1:
            issues.append(f"{path.name}: {sheet} count {text.count(sheet)}")

# Known invariants
if "PRACTICE DATA, NOT A REAL CLIENT OUTCOME" not in (ROOT/"harborstone.html").read_text():
    issues.append("harborstone.html: simulation disclosure missing")

if "max-width:560px" not in (ROOT/"agent-flow.html").read_text():
    issues.append("agent-flow.html: compact flow sizing missing")

if 'href="discovery.html"' not in (ROOT/"capabilities.html").read_text():
    issues.append("capabilities.html: Discovery & Workflow card not routed to discovery.html")

if issues:
    print("REGRESSION CHECK FAILED")
    for i in issues: print(" -",i)
    sys.exit(1)

print(f"REGRESSION CHECK PASSED ({len(HTML)} HTML files)")
