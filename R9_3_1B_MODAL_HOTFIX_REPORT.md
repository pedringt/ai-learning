# R9.3.1b modal hotfix

The prior R9.3.1a fix still depended on the HTML `hidden` attribute winning a CSS cascade and did not force browsers to fetch a fresh stylesheet/script bundle.

R9.3.1b makes modal visibility explicit:
- overlays are `display:none !important` by default;
- only `.overlay.is-open` may display a modal;
- `showDialog()` adds `is-open`;
- `closeDialog()` removes `is-open` before clearing the dialog;
- startup forcibly resets the overlay to closed/empty;
- the prototype index cache-busts `context-tool.css`, `context-api.js`, `context-ask.js`, and `context-app.js` with `?v=r9.3.1b`.

This is frontend-only. Render does not need to redeploy.

Verification:
- `node --check context-app.js`: pass
- `node --check context-ask.js`: pass
- existing Ask behavior suite: 81 passed, 0 failed
