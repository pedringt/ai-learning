# Portfolio editor

A private, local editor for portfolio copy (#617). It runs only on Paige's Mac,
edits the real HTML pages, and publishes to `staging`. Going public is still the
usual staging → main pull request. Nothing in this folder is deployed
(`.vercelignore`).

## Using it

1. Click **Edit Portfolio** in the Dock. The portfolio opens in your browser,
   served from your Mac. Editable text has a faint dashed outline.
2. Click a heading, paragraph or list and type. The toolbar has bold, italic,
   add/change link and remove link. Press Esc to cancel.
3. **Save draft** (or ⌘S) saves that block. Drafts are private until you publish.
4. **Publish…** runs the site checks and sends all drafts to staging. Check them
   on the staging site, then approve the staging → main pull request as usual.
5. **History** lists your saves. **Restore** undoes one with a new draft.
6. **Close editor** stops it. Drafts stay saved for next time.

Editable now: the homepage and Applied Work copy, plus the seven case studies.
Not editable: the Library, navigation, buttons, diagrams, the State
illustration, and new pages. Ask Claude for those.

## How it works

- Editable blocks carry `data-edit="<page>-<n>"`. A save replaces only that
  block's inner HTML and keeps every other byte of the file. Edited markup is
  cleaned to text, links, `strong`/`em`/`b`/`i`, `span`, `br` and list items.
- Drafts are commits on a local `content` branch in the editor's own clone,
  `~/code/portfolio-content` (never Paige's working checkout). Vercel never sees
  drafts.
- On start and before publishing, drafts are rebased onto the latest
  `origin/staging`. When git reports a conflict only because two blocks share a
  source line, the drafts are replayed block by block. A real conflict (the same
  block changed on both sides) stops with a message and changes nothing.
- Publish = checks (`implementation-context-prototype/state-portfolio-*-tests.js`)
  and then a fast-forward push of `content` to `staging`. Never a force push.
- The server listens on 127.0.0.1:4317 and rejects requests from other sites.
- Log: `~/Library/Logs/portfolio-editor.log`.

## For coding agents

- Keep `data-edit` attributes when you change copy. After adding copy to an
  editor page, run `node tools/portfolio-editor/mark.js`. The marker test
  (`state-portfolio-edit-markers-tests.js`) fails if a block is unmarked.
- Markup the editor can't keep intact gets `data-edit-skip` and stays hand-edited.
- Before editing marked copy, check for unpublished drafts:
  `git -C ~/code/portfolio-content log --oneline origin/staging..content`.
  If there are any, tell Paige so she can publish them first.
- To change the editor's page list or scope, edit `PAGES` and the exclusions in
  `lib/html.js`.

## Building the app

```bash
tools/portfolio-editor/make-app.sh
```

This writes `~/Applications/Edit Portfolio.app`; drag it into the Dock. The app
runs the editor code from the drafts clone when present, so it picks up editor
changes once they reach `staging`. A trial build
(`make-app.sh --trial <branch>`) uses a separate clone with publishing off.

Tests: `node --test tools/portfolio-editor/test/*.test.js` (also in `make qa-js`
and CI).
