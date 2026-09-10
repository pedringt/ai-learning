# Post-freeze change requests

Running list of changes Paige has asked for while the live site is frozen for
manager review. **Nothing here has been applied.** Each entry records what was
asked, exactly where it lives, and anything worth knowing before doing it.

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

## 2. Make Review actions describe what the human is authorizing

**Requested:** September 10, 2026
**Status:** Levels 1 and 2 applied on `staging`; Level 3 deliberately deferred. Not on `main` unless explicitly promoted later.
**Risk:** Low for the staging UI change; medium-large for the deferred domain-model work.

### Why this came up

Evidence already exists before a Review. A human Review decides what effect that
Evidence should have, so wording such as "Accept evidence" incorrectly suggests
the reviewer is admitting the source material into the system.

The current backend also allows zero-proposal Reviews, including Reviews that
resolve a Question and `state_at_risk` Reviews where Evidence undermines Current
State without establishing a replacement. Those cases should not be presented
as if every affirmative Review updates Current State.

### Levels 1 and 2: staging behavior

Use the Review's actual consequence to choose the UI:

- **Review has proposed State changes:** `Update Current State` / `Keep Current State`, with a sentence explaining that Current State will change and whether linked Questions will also resolve.
- **No State proposal, but the Review resolves Question(s):** `Confirm answer` / `Keep question open` (or plural), with explicit copy that Current State will not change.
- **`state_at_risk` with no replacement proposal:** do not show a misleading affirmative "accept" action. Explain that the Evidence raises uncertainty without establishing a replacement. The reviewer may `Keep Current State` if they decide the concern does not change maintained understanding, or simply leave the Review open while gathering more Evidence.
- **Other no-State-change Review fallback:** use `Mark reviewed`, not "Accept evidence."
- **Non-consequential Evidence:** continues to require no human Review.

This is intentionally a frontend interpretation of data State already has:
`reviewType`, proposals, affected State items, and linked Questions. It does not
change the backend resolution vocabulary or database schema.

### Level 3: deferred product/domain-model cleanup

Do not fold this into ordinary UI cleanup. Treat it as a separate design change.

The deeper issue is that the backend currently maps `accept` + zero proposals to
`confirmed_current`. That is not expressive enough for a `state_at_risk` Review
where the human agrees that Current State is now uncertain but no replacement is
known yet.

A future pass should define:

1. An explicit Review outcome for reviewed uncertainty / qualified Current State rather than overloading `confirmed_current`.
2. How a Current State item records and displays that qualification without silently replacing the maintained fact.
3. The lifecycle for clearing the qualification when later Evidence establishes a replacement or confirms the original State.
4. Audit/history treatment for meaningful human Review decisions that do not create a `history_transitions` State mutation.
5. Any required schema migration, backend resolution changes, API/read-model changes, and tests.
6. Interaction with linked Questions so resolving a Question, qualifying State, and changing State remain separate effects.

Keep the central boundary intact: Evidence is immutable; AI interprets; software
enforces; people authorize consequential changes.
