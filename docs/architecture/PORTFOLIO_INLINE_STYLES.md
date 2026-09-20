# Portfolio `index.html` inline styles

Written for #139 (Sept 2026). `index.html` carries ten inline `<style>` blocks (about 34 KB of CSS, roughly half the file), left over from earlier polish passes.

## What was done

Only the provably neutral cleanup: removed **46 empty `@media` shells** (rules with no declarations cannot affect the cascade) and **41 copies of the boilerplate comment** "Consolidated from an adjacent historical style layer." The file went from 74.7 KB to 70.4 KB. Comments that explain intent (`v90 final polish: ...`, `v91 checkpoint: ...`) were kept.

Verified with `tools/style_parity.py`: the full computed style (every property, plus `::before` / `::after`) of all 291 elements is **identical** before and after, for Home, Applied Work and Learning Guide, at 1280 px and 390 px, in light and dark. The tool's noise floor (old vs old) is 0, and a positive control (a deliberate 1 px font-size change) is detected.

## Why the CSS was not moved out of `index.html`

**The order of the blocks relative to the two `<link>` stylesheets is load-bearing.** In document order:

1. `<style id="v893-style">`
2. `<link href="site-shell.css">`
3. `<style id="v932-manager-readiness">`, `<style id="v9515-learning-type">`
4. `<link href="site-components.css">`
5. two unnamed blocks, `<style id="issue176-final-polish">`
6. (in the body) four more blocks, one of them 10 KB

Rules of equal specificity are decided by this order, so putting everything in one external file would silently change which rule wins somewhere. A safe externalization would need one file per position, linked at the same place, which adds requests and risk for a purely organizational gain. The site works and looks right; this stays accepted debt beyond the neutral cleanup.

## If you clean up further

- Run the parity tool before and after; it must report identical computed styles everywhere:
  ```
  git worktree add /tmp/old HEAD
  python tools/style_parity.py --old . --new .          # noise floor, must be 0
  python tools/style_parity.py --old /tmp/old --new .   # the change under test
  ```
- Change one thing at a time. Merging two blocks that sit on different sides of a `<link>` changes the cascade.
- The likeliest next wins are duplicate declarations inside a single block and rules overridden later by an equal-or-higher-specificity rule in a later block. Confirm with the parity tool, not by reading.
