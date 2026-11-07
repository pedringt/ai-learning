"""CSS phase (Nov 7): about 580 State CSS rules styled classes that no State markup or script produces (portfolio pages
copied in, layers deleted since). tools/dead_css.py --state removed them, with scripts/state_ui_compare/compare.py
showing the UI unchanged. This keeps new ones from piling up: when markup or a script stops producing a class, its
CSS goes in the same change. Static check, no browser.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import dead_css  # noqa: E402


def test_state_stylesheets_have_no_dead_selectors():
    words = dead_css.state_source_words()
    report = {}
    for name in ("state-app.css", "context-tool.css", "state-shell.css", "index.html"):
        text = (ROOT / "implementation-context-prototype" / name).read_text()
        _, stats = (dead_css.process_html if name.endswith(".html") else dead_css.process_css)(text, words)
        report[name] = stats["dead_selectors"]
    assert all(count == 0 for count in report.values()), (
        f"Selectors for classes State never produces: {report}. "
        "Run `python3 tools/dead_css.py --state --apply <file>` and prove it with scripts/state_ui_compare/compare.py."
    )
