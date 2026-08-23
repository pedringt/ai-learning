#!/usr/bin/env python3
"""
Read-only regression checks for the Practical AI Learning Portfolio.
This script MUST NOT rewrite HTML.
"""
from pathlib import Path
from urllib.parse import urlparse
from html.parser import HTMLParser
import re, collections, subprocess, sys

ROOT = Path(__file__).resolve().parent
HTML = sorted(ROOT.rglob("*.html"))

EXPECTED_NAV = ["Home","Capabilities","Applied Work","Learning Guide"]
CAPABILITY_PAGES = {"capabilities.html","discovery-workflow.html","measurement-value.html","systems-guardrails.html","evals-quality.html"}
REDIRECT_PAGES = {"agent-flow.html","configure.html","deliverable.html","discovery.html","evals.html","plan.html","eval-runner.html"}
SUBSTANTIVE_PAGES = {p.name for p in HTML} - REDIRECT_PAGES
MERIDIAN_PAGES = {"case-readout.html","tracker.html","measurement-plan.html","system-flow.html","eval-work.html"}

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
        self.main_count=0
        self.main_close_count=0
        self.h1_count=0
        self.description_count=0
        self._capture=None
        self._buf=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if "id" in d: self.ids.append(d["id"])
        if tag=="main": self.main_count+=1
        if tag=="h1": self.h1_count+=1
        if tag=="meta" and d.get("name","").lower()=="description": self.description_count+=1
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
        if tag=="main": self.main_close_count+=1
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


def css_brace_issues(text, label):
    """Return structural CSS brace issues while ignoring comments and quoted strings."""
    issues=[]
    depth=0
    line=1
    i=0
    quote=None
    while i < len(text):
        ch=text[i]
        if ch == "\n":
            line += 1
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote=None
            i += 1
            continue
        if text.startswith("/*", i):
            end=text.find("*/", i+2)
            if end == -1:
                issues.append(f"{label}: unterminated CSS comment near line {line}")
                break
            line += text[i:end+2].count("\n")
            i=end+2
            continue
        if ch in ("'", '\"'):
            quote=ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            if depth == 0:
                issues.append(f"{label}: orphan closing CSS brace at line {line}")
            else:
                depth -= 1
        i += 1
    if quote:
        issues.append(f"{label}: unterminated CSS string")
    if depth:
        issues.append(f"{label}: {depth} unclosed CSS brace(s)")
    return issues

def has_anchor(text, frag):
    return f'id="{frag}"' in text or f"id='{frag}'" in text or f'data-page="{frag}"' in text

issues=[]
for path in HTML:
    text=path.read_text()
    label=path.relative_to(ROOT).as_posix()
    c=Collector(); c.feed(text)

    dup=[x for x,n in collections.Counter(c.ids).items() if n>1]
    if dup: issues.append(f"{label}: duplicate IDs {dup}")

    if c.nav_labels and c.nav_labels!=EXPECTED_NAV:
        issues.append(f"{label}: desktop nav {c.nav_labels}")
    if c.option_labels and c.option_labels!=EXPECTED_NAV:
        issues.append(f"{label}: mobile nav {c.option_labels}")

    if path.name in SUBSTANTIVE_PAGES and path.name != "index.html" and (c.main_count != 1 or c.main_close_count != 1):
        issues.append(f"{label}: expected one balanced main landmark, found {c.main_count} open/{c.main_close_count} close")
    if path.name in SUBSTANTIVE_PAGES and c.h1_count != 1:
        issues.append(f"{label}: expected one document h1, found {c.h1_count}")
    if path.name in SUBSTANTIVE_PAGES and c.description_count != 1:
        issues.append(f"{label}: expected one meta description, found {c.description_count}")

    for href in c.hrefs:
        if not href or href.startswith(("http://","https://","mailto:","tel:","javascript:")):
            continue
        if href.startswith("#"):
            frag=href[1:]
            if frag and not has_anchor(text, frag):
                issues.append(f"{label}: missing same-page anchor {href}")
            continue
        u=urlparse(href)
        target=(path.parent/u.path).resolve()
        if ROOT not in target.parents and target != ROOT:
            issues.append(f"{label}: link escapes site root {href}")
            continue
        if not target.exists():
            issues.append(f"{label}: missing file {href}")
            continue
        if u.fragment and not has_anchor(target.read_text(),u.fragment):
            issues.append(f"{label}: missing target anchor {href}")

    for n, style_body in enumerate(re.findall(r"<style(?:\s[^>]*)?>(.*?)</style>", text, re.S|re.I), start=1):
        issues.extend(css_brace_issues(style_body, f"{label}: inline style #{n}"))

    if path.name in CAPABILITY_PAGES:
        if text.count('class="capability-local-nav"') != 1:
            issues.append(f"{path.name}: capability local-nav count")
        if "capability-shell" not in text:
            issues.append(f"{path.name}: capability-shell missing")

    if path.name in MERIDIAN_PAGES:
        if text.count('class="meridian-section-nav"') != 1:
            issues.append(f"{path.name}: Meridian reading nav count")
        if path.name != "eval-runner.html" and text.count('class="artifact-footer-nav"') != 1:
            issues.append(f"{path.name}: Meridian footer nav count")
        if "All Applied Work" in text:
            issues.append(f"{path.name}: obsolete All Applied Work link")
        if text.count('class="meridian-page-shell') != 1:
            issues.append(f"{path.name}: canonical Meridian shell count")
        if text.count('class="meridian-heading"') != 1:
            issues.append(f"{path.name}: canonical Meridian heading count")
        if text.count('class="meridian-case-hero"') != 1:
            issues.append(f"{path.name}: canonical Meridian hero count")
        hero_match=re.search(r'<header class="meridian-case-hero">(.*?)</header>',text,re.S)
        if not hero_match or hero_match.group(1).count('class="meridian-context-item"') != 4:
            issues.append(f"{path.name}: Meridian hero context row must contain four items")

    # shared stylesheets should be present exactly once
    if path.parent == ROOT and 'http-equiv="refresh"' not in text:
        for sheet in ("site-shell.css","site-components.css"):
            if text.count(sheet)!=1:
                issues.append(f"{path.name}: {sheet} count {text.count(sheet)}")

# CSS files are part of the regression surface too.
for css_path in sorted(ROOT.rglob("*.css")):
    issues.extend(css_brace_issues(css_path.read_text(), css_path.relative_to(ROOT).as_posix()))

# Known invariants
if "PRACTICE DATA, NOT A REAL CLIENT OUTCOME" not in (ROOT/"harborstone.html").read_text():
    issues.append("harborstone.html: simulation disclosure missing")

if "max-width:560px" not in (ROOT/"system-flow.html").read_text():
    issues.append("system-flow.html: compact flow sizing missing")
system_flow=(ROOT/"system-flow.html").read_text()
for required in ('class="flow-artifact-heading"','class="flow-support-grid"','class="flow-validation-note"'):
    if required not in system_flow:
        issues.append(f"system-flow.html: completed flow presentation missing {required}")

if 'href="discovery-workflow.html"' not in (ROOT/"capabilities.html").read_text():
    issues.append("capabilities.html: Discovery & Workflow card not routed to discovery-workflow.html")

eval_work=(ROOT/"eval-work.html").read_text()
index_text=(ROOT/"index.html").read_text()
hero_end=eval_work.find("</header>")
if "meridian-primary-action" in eval_work[:hero_end]:
    issues.append("eval-work.html: primary action must not change shared hero height")
lab_html=(ROOT/"meridian-lab"/"index.html").read_text()
lab_core=(ROOT/"meridian-lab"/"meridian-core.js").read_text()
lab_js=(ROOT/"meridian-lab"/"lab.js").read_text()
lab_css=(ROOT/"meridian-lab"/"lab.css").read_text()
for required in ('data-view="evals"','data-view="knowledge"','data-view="history"','data-view="dashboard"'):
    if required not in lab_html:
        issues.append(f"meridian-lab/index.html: missing Lab view {required}")
for required in ('Test &amp; Learn','Knowledge Base','Learning Log','Learning Dashboard'):
    if required not in lab_html:
        issues.append(f"meridian-lab/index.html: missing Lab navigation label {required}")
if 'MeridianCore' not in lab_core or 'core.evaluate' not in lab_js:
    issues.append("meridian-lab: shared evaluation pipeline contract missing")
for required in ('session-objective','export-workspace','import-workspace','data-review-run','parentRunId'):
    if required not in lab_html+lab_js+lab_core:
        issues.append(f"meridian-lab: learning-workbench contract missing {required}")
if re.search(r'<label class="field-label">',lab_js):
    issues.append("meridian-lab: generated field label missing explicit control association")
for required in ('class="lab-orientation"','Try a ticket','Run fixed cases','Diagnose and rerun','Prototype activity · not pilot outcomes'):
    if required not in lab_html:
        issues.append(f"meridian-lab: shared-audience orientation missing {required}")
for required in ('deterministic practice environment','not a production application'):
    if required not in lab_html:
        issues.append(f"meridian-lab: prototype positioning missing {required}")
for required in ('class="portfolio-menu"','../index.html#meridian','../index.html#portfolio','../index.html#learn'):
    if required not in lab_html:
        issues.append(f"meridian-lab: portfolio exit path missing {required}")
if '[hidden]{display:none!important}' not in lab_css:
    issues.append("meridian-lab: hidden-state CSS invariant missing")
for required in ('.review-grid select','.save-review,.save-history-review','.case-learning-context'):
    if required not in lab_css:
        issues.append(f"meridian-lab: learning-review presentation missing {required}")
for required in ('id="eval-example"','id="explore-case"','id="regression-suite"','event.metaKey||event.ctrlKey',"requested==='support'?'evals'"):
    if required not in lab_html+lab_js:
        issues.append(f"meridian-lab: consolidated Test & Learn contract missing {required}")
for retired in ('data-view="support"','>Support Tool <','>Eval Runner <','id="support-input"','function resetSupport'):
    if retired in lab_html+lab_js:
        issues.append(f"meridian-lab: retired duplicate workflow returned {retired}")
for required in ('id="meridian-lab-styles"',"'/meridian-lab/lab.css'","?'/meridian-lab/':''","core.onload"):
    if required not in lab_html:
        issues.append(f"meridian-lab: deployment asset-path contract missing {required}")

# Execute the deterministic domain contract; static string checks cannot catch
# threshold, guardrail, persistence, or workspace-import regressions.
try:
    subprocess.run(["node", str(ROOT/"meridian-lab"/"meridian-core.test.js")], check=True, capture_output=True, text=True)
except FileNotFoundError:
    issues.append("meridian-lab: Node.js is required for domain regression tests")
except subprocess.CalledProcessError as error:
    detail=(error.stderr or error.stdout).strip()
    issues.append(f"meridian-lab: domain regression tests failed: {detail}")
if 'meridian-lab/index.html#evals' not in (ROOT/"eval-runner.html").read_text():
    issues.append("eval-runner.html: compatibility redirect missing")
if 'href="meridian-lab/index.html"' not in index_text:
    issues.append("index.html: Meridian Lab entry point missing")
if index_text.count('class="view meridian-page-shell meridian-overview-shell"') != 1:
    issues.append("index.html: canonical Meridian overview shell missing")
for component in ("meridian-case-hero","meridian-context-grid","meridian-section-nav"):
    if component not in index_text[index_text.find('data-page="meridian"'):]:
        issues.append(f"index.html: Meridian overview missing {component}")
if re.search(r'<details class="learning-stage"[^>]*\sopen(?:\s|>)',index_text):
    issues.append("index.html: Learning Guide stages must be collapsed by default")
if 'querySelectorAll("details.learning-stage").forEach(function(stage){stage.open=false;})' not in index_text:
    issues.append("index.html: Learning Guide initial-collapse behavior missing")
if 'learning-curriculum-intro' not in index_text:
    issues.append("index.html: compact Learning Guide introduction missing")
for retired in ('class="learning-roadmap-card"','class="learning-roadmap-depth"','class="learning-roadmap-lenses"'):
    if retired in index_text:
        issues.append(f"index.html: retired Learning Guide orientation returned {retired}")
for required in ('class="learning-next-grid"','class="learning-footer-note"','class="evidence-views"','class="evidence-views-grid"'):
    if required not in index_text:
        issues.append(f"index.html: supporting-section presentation missing {required}")
if 'primary-artifact .artifact-action{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;margin-top:auto' not in index_text:
    issues.append("index.html: Meridian artifact actions are not bottom-aligned by the shared rule")
measurement=(ROOT/"measurement-plan.html").read_text()
tracker=(ROOT/"tracker.html").read_text()
if 'id="measurement-reasoning"' not in measurement or '<details class="reasoning-disclosure surface-card">' not in measurement:
    issues.append("measurement-plan.html: collapsed target-reasoning section missing")
if 'measurement-plan.html#measurement-reasoning' not in tracker:
    issues.append("tracker.html: measurement reflection cross-reference missing")
if 'class="evidence-source-link" href="measurement-plan.html#measurement-reasoning"' not in (ROOT/"measurement-value.html").read_text():
    issues.append("measurement-value.html: Meridian success-criteria source link missing")
for required in ('class="eval-experiments"','id="executed-experiments-heading"','1 completed','id="guardrail-cycle"','4 / 4 expected routes after revision','This demonstrates the correction across a four-case deterministic regression set','class="eval-experiment-details"'):
    if required not in eval_work:
        issues.append(f"eval-work.html: executed guardrail-cycle evidence missing {required}")
if 'eval-work.html#guardrail-cycle' not in (ROOT/"case-readout.html").read_text():
    issues.append("case-readout.html: executed guardrail-cycle link missing")
if 'eval-work.html#guardrail-cycle' not in (ROOT/"evals-quality.html").read_text():
    issues.append("evals-quality.html: executed guardrail-cycle link missing")

# Redirect routes are retained only for inbound compatibility and must stay tiny and explicit.
for name in REDIRECT_PAGES:
    text=(ROOT/name).read_text()
    if 'http-equiv="refresh"' not in text or len(text)>1200:
        issues.append(f"{name}: compatibility redirect contract broken")

# Guard the exact layout invariants that have recently drifted.
components=(ROOT/"site-components.css").read_text()
for selector in (".meridian-page-shell",".meridian-case-hero",".meridian-section-nav",".meridian-breadcrumb",".artifact-footer-nav"):
    if selector not in components:
        issues.append(f"site-components.css: missing shared invariant {selector}")
for invariant in ("padding:66px 28px 90px!important","padding:48px 18px 70px!important","max-width:1180px!important"):
    if invariant not in components:
        issues.append(f"site-components.css: missing Meridian geometry invariant {invariant}")
for invariant in (".meridian-overview-shell{padding-top:66px!important",".meridian-overview-shell{padding-top:48px!important"):
    if invariant not in components:
        issues.append(f"site-components.css: missing Overview parity invariant {invariant}")

# v95.82 keeps Home evidence-first and gives Meridian two non-duplicated entry paths.
for retired in ('class="band manager-fast-path"','class="band foundation-north-star"','class="primary-artifact meridian-lab-entry"'):
    if retired in index_text:
        issues.append(f"index.html: retired hierarchy returned: {retired}")
for required in ('class="home-applied-heading"','class="home-option-d-links"','The current case readout in 3 minutes','The same judgment in Operations','class="meridian-entry-choice"','Interactive validation rig','Deterministic rules · browser-local'):
    if required not in index_text:
        issues.append(f"index.html: v95.82 hierarchy missing {required}")
meridian_slice=index_text[index_text.find('data-page="meridian"'):index_text.find('data-page="workbench"')]
artifact_slice=meridian_slice[meridian_slice.find('class="primary-artifact-grid"'):meridian_slice.find('class="concepts-applied"')]
if 'case-readout.html' in artifact_slice or 'meridian-lab/index.html' in artifact_slice:
    issues.append("index.html: Readout or Lab duplicated inside supporting-artifact grid")
if '.home-applied-heading' not in components or '.home-option-d-links' not in components or '.meridian-entry-choice' not in components:
    issues.append("site-components.css: v95.82 entry styles missing")
for retired in ('class="home-context-strip"','Prefer evidence by skill?','class="home-foundation-line"'):
    if retired in index_text:
        issues.append(f"index.html: removed Home repetition returned: {retired}")
for required in ('background in custom software project management and QA','Interactive validation rig'):
    if required not in index_text:
        issues.append(f"index.html: final positioning copy missing {required}")
for required in ('Interactive validation rig','deterministic rules rather than a production model'):
    if required not in lab_html+eval_work+(ROOT/"case-readout.html").read_text():
        issues.append(f"Meridian Lab framing missing {required}")
for required in ('class="workbench-case harborstone-summary"','class="harborstone-summary-grid"','class="harborstone-explore"'):
    if required not in index_text:
        issues.append(f"index.html: quiet Harborstone summary missing {required}")

if issues:
    print("REGRESSION CHECK FAILED")
    for i in issues: print(" -",i)
    sys.exit(1)

print(f"REGRESSION CHECK PASSED ({len(HTML)} HTML files)")
