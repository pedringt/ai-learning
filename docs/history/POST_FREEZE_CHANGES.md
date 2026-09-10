# Post-freeze change requests

Running list of changes Paige has asked for while the live site is frozen for
manager review. Each entry records what was asked, exactly where it lives, and
anything worth knowing before doing it.

These are product decisions, separate from the technical cleanup batches in
`CLEANUP_PLAN.md`.

---

## 1. Remove "Explore all applied work →" from the homepage

**Requested:** September 4, 2026
**Status:** Applied on the `post-manager-cleanup` branch, September 4, 2026. Still not on `main` and not deployed.
**Risk:** Low

### What it is

A right-aligned text link sitting at the end of the Applied Work card grid on
the homepage.

### Where it lives

`index.html`, line 1054:

```html
<div class="home-all-work">
  <a data-view-link="portfolio" href="#portfolio">Explore all applied work →</a>
</div>
```

Its styling is in the inline `<style>` block at `index.html` line 1035, plus a
mobile override at line 1044:

```css
.home-all-work{display:flex!important;justify-content:flex-end!important;margin:16px 2px 0!important}
.home-all-work a{font-weight:800!important;color:var(--purple)!important;text-decoration:none!important}
/* and, under the mobile media query: */
.home-all-work{justify-content:flex-start!important}
```

The phrase appears nowhere else in the repo — `index.html` only.

### Before removing it

**Nothing gets stranded.** This is the only `href="#portfolio"` link on the
homepage, which sounds alarming but isn't: the homepage's own top nav uses
buttons rather than anchors —

```html
<nav aria-label="Primary pages" class="nav">
  <button class="active" data-view="home">Home</button>
  <button data-view="portfolio">Applied Work</button>
  <button data-view="learn">Learning Guide</button>
</nav>
```

— so Applied Work stays reachable from the nav after this link is gone. Other
pages link in with `index.html#portfolio`, which is unaffected.

`data-view-link="portfolio"` is a routing hook. After removal, `portfolio`
remains a live `data-view` value used by the nav button, so the router needs no
change. Worth a grep for `data-view-link` afterwards to confirm nothing else
depended on this being the only such element.

### The change

1. Delete the `<div class="home-all-work">…</div>` block at `index.html:1054`.
2. Delete the three now-dead `.home-all-work` rules from the inline `<style>`
   blocks (lines 1035 and 1044). Leaving them behind is exactly the kind of
   orphan CSS the cleanup work is removing.
3. Check the spacing under the last Applied Work card — that link was carrying
   `margin:16px 2px 0`, so the section's bottom rhythm may need a small
   adjustment once it's gone.

### Verifying it

Run the screenshot harness before and after and diff. The change should show up
only on the homepage, and only below the Applied Work grid; every other view
should stay pixel-identical.

### Outcome

Applied and checked. The spacing concern did not materialize: the hairline
divider and the "My working notes, references, and practice library live
separately in the Learning Guide →" line already close the section, and there is
115px of breathing room between the last card and that ending. **No spacing
adjustment was needed.**

A 42-shot pixel diff confirms the change is confined to the six homepage
captures, each 34px shorter — the link plus its 16px top margin. Every other
view at every width, in both themes, is pixel-identical. Tests unchanged.

---

## 2. Clarify Review action wording

**Requested:** September 10, 2026
**Status:** Wording/UI-only change on `staging`. Broader Review behavior changes deferred.
**Risk:** Low for current UI change; medium-large for future outcome-model work.

### Current staging change

Keep existing Review behavior intact and clarify only what the interface says and how Open Items is organized:

- Reviews with a concrete proposed State change: **Update Current State** / **Keep Current State**.
- Reviews with no proposed State change: **Mark reviewed** only.
- Remove the misleading phrases **Accept as reviewed evidence**, **Update understanding**, and **Leave unchanged** from these Review actions.
- Explain the Review distinction once at the top of Open Items instead of repeating helper text across the page and inside each Review.
- Remove the bulky per-Review **No Current State change is proposed** message.
- Add subtle spacing and theme-aware dividers between individual Reviews and Questions so record boundaries are easier to scan.

No backend, schema, Question-resolution, History, or Review-resolution behavior
changes are included in this pass.

### Deferred cleanup

A later product pass should revisit the deeper issue that a human Review can
have different effects: update Current State, resolve a Question without changing
State, or establish that Current State is uncertain without yet establishing a
replacement. The current backend resolution vocabulary does not cleanly express
all of those outcomes.

Before changing that model, use the State eval work to define and test realistic
cases for at least:

1. Evidence that should update Current State.
2. Evidence that should be reviewed but leave Current State unchanged.
3. Evidence that resolves an open Question without changing Current State.
4. `state_at_risk` Evidence where the existing State is doubtful but no replacement is known.
5. Evidence that is useful but not consequential enough to require Review.

Then decide whether the product needs explicit uncertainty/qualified-State
outcomes, different Review actions by consequence, richer audit/history entries,
or schema/backend changes. Keep the central boundary intact: Evidence is
immutable; AI interprets; software enforces; people authorize consequential
changes.
