# tools

Visual regression checking for the State prototype and the portfolio site.
Nothing in the application depends on these — they exist so a CSS or layout
change can be shown to be safe rather than asserted to be.

They are deliberately not part of the pytest suite: a run takes about a minute
and needs a local backend.

## Why

Stylesheets here carry layered overrides and heavy `!important` use, so a
change intended for one breakpoint can move something three views away. The
usual answer is "load the page and look", which does not scale to five views ×
three widths × two themes and does not catch a two-pixel shift at all.

These capture that matrix and compare it byte for byte.

## The matrix

`screenshot_matrix.py` captures 42 images: the homepage and the State case
study, plus Workspace, Project, Open Items, Notes and History — at 1440, 834
and 390 px, in light and dark.

```bash
# 1. a backend the prototype can talk to
cd state-project-complete
DATABASE_URL="sqlite:///tmp/state.db" STATE_PROVIDER=anthropic \
  ANTHROPIC_API_KEY=... STATE_DEMO_BOOTSTRAP=1 \
  python -m uvicorn api:app --port 8000

# 2. capture before your change
python tools/screenshot_matrix.py . /tmp/shots/before

# 3. make the change, capture again
python tools/screenshot_matrix.py . /tmp/shots/after

# 4. compare
python tools/diff_screenshots.py /tmp/shots/before /tmp/shots/after /tmp/shots/diff
```

`diff_screenshots.py` reports each image as identical or differing, with the
bounding box and percentage of changed pixels, and writes amplified diff images
to the optional fourth argument.

Set `STATE_API_BASE` to point the capture at a backend elsewhere.

## It is deterministic, and that took work

Two runs against unchanged code produce **42/42 byte-identical images**, so any
difference is a real change rather than noise.

Getting there required masking `.top-actions` — the theme-toggle glyph is a
colour font and the page uses a native `<select>`, and both rasterise slightly
differently between runs. Before that mask the harness produced about a dozen
false positives per run, which is how a visual check becomes noise everyone
learns to ignore.

Worth knowing when reading a diff: a change that alters layout by a sub-pixel
amount can shift glyph antialiasing far down a long page. Text content and
element positions identical while pixels differ means antialiasing, not a
regression — check positions before believing the picture.

## The Ask flow

`ask_flow_capture.py` drives a full Ask cycle — answer, refinement in flight,
appended follow-up — and captures each state in both themes, plus the rendered
button labels, the DOM order inside `.answer-content`, and whether the rotating
wait copy actually rotates.

```bash
python tools/ask_flow_capture.py . /tmp/shots/ask
```

It stubs `window.fetch` after page load rather than mocking `window.STATE_API`,
because `context-api.js` overwrites that global when it loads. Stubbing at the
fetch layer leaves the real client code in play.

**It never calls a model.** If you want a smoke test against the deployed site,
write one deliberately, with a budget, and know that each run costs real
provider time.

## Requirements

```bash
pip install playwright pillow
python -m playwright install chromium
```

## style_parity.py

Proves a CSS cleanup is appearance-neutral by comparing the full computed style of every element (plus `::before` / `::after`) between two copies of the static site, across views, phone/desktop widths and light/dark. Run old-vs-old first (must be 0), then old-vs-new. See `docs/architecture/PORTFOLIO_INLINE_STYLES.md`.

```
git worktree add /tmp/old HEAD
python tools/style_parity.py --old /tmp/old --new .
```


## dead_css.py

Finds portfolio CSS rules that cannot match anything: a selector is dead when it requires a class or id that appears in no portfolio page (inline `<style>` text excluded) and no portfolio script. `--apply FILE...` removes fully dead rules and dead selectors from shared rule lists, plus any `@media` block left empty. A class assembled at runtime would not be found in the sources, so prove every application with the portfolio comparison below (#451).

```
python3 tools/dead_css.py                      # report
python3 tools/dead_css.py --apply site-components.css index.html
```

## important_audit.py

Finds portfolio `!important` flags that change no computed style. Candidates exclude flags on interactive pseudo-classes, JS-toggled classes and attributes, and print / prefers-* / hover media, because those states are never rendered. Each round removes every remaining candidate, renders all portfolio views at a width inside every breakpoint interval, and keeps each flag whose removal changed a computed value. Rounds repeat until nothing changes; if a change cannot be traced to a candidate it prints STOP and applies nothing. `--apply` rewrites the sources. A full run takes about two hours; prove the result with the portfolio comparison below (#451).

```
python3 tools/important_audit.py           # report
python3 tools/important_audit.py --apply
```

## Portfolio comparison (scripts/state_ui_compare/portfolio_compare.py)

The broader successor to `style_parity.py` for the portfolio: every root portfolio page at desktop, tablet and phone widths, after scrolling through each page, comparing computed styles, own text, attributes and structure between a git ref and the working tree. Run `--self` first for the noise floor.

```
state-project-complete/.venv/bin/python scripts/state_ui_compare/portfolio_compare.py --base origin/staging
```
