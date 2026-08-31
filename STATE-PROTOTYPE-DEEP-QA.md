# State prototype — deep QA pass

## Scope
Audited the latest deterministic-Ask prototype for behavior, deterministic routing, state transitions, navigation semantics, accessibility basics, responsive CSS structure, and accumulated implementation debt.

## Findings fixed in this pass

- Ask routing could still let broad canned scenarios override explicit History/Open Items/Notes intent. Explicit structured intent now wins before canned scenario matching.
- Fuzzy scenario matching was overweighting generic words such as “what” and “know,” which caused false positives. Generic stop words are now excluded from fuzzy alias scoring.
- Slack-history questions did not reliably find the untagged Slack history record because topic IDs were being compared directly to prose. Historical matching now uses each topic’s synonym terms.
- Newly-created history and question-answer notes lacked `dateISO`, while Ask sorting assumed it existed. Dynamic records now receive normalized ISO dates and sorting uses safe date helpers.
- History page ordering could become mixed after a new Review decision was unshifted into older chronological seed data. The History view now explicitly sorts newest-first; Ask history results remain chronological.
- Notes filter/search state was split between DOM manipulation and application state. Filter and search now compose and persist through rerenders/editing.
- “AI suggestion” was shown as the origin for questions created from deterministic Workspace fallback. Changed to “Added from Workspace.”
- Review reminder used link semantics on a container that also held buttons. The reminder is now a normal informational aside with an explicit Review control.
- Question cards used `role=button` while containing another button. They now use normal article semantics with explicit View / Answer actions.
- Sidebar disclosure buttons now declare `aria-controls`, and their chevrons visibly reflect expanded/collapsed state.
- Renamed internal fixed-path data from `aiScenarios` to `askScenarios` so the implementation does not imply a live AI layer.
- Consolidated a stack of stale QA3/QA4 CSS overrides around the Workspace header into one final rule set. This removes contradictory declarations without redesigning the UI.

## Deterministic Ask regression scenarios

Verified routing logic for current-state, evidence, open-item, history, supported canned-output, and fallback cases. Representative results after fixes:

- “What is the current pilot scope?” → Current State
- “What did we decide about human review?” → Current State
- “Can the AI send replies automatically?” → Current State
- “What are our success metrics?” → Current State
- “Show me notes about security.” → Notes / evidence
- “Find anything about vendor retention.” → Notes / evidence
- “Why did we stop considering auto-send?” → History
- “Why isn’t Slack included?” → History
- “Show me the history of feature access” → History
- “What are the open security questions?” → Open Items
- “Are account-changing actions allowed?” → Current State
- “Who is Maya?” → supported contact scenario
- “Prepare me for the security meeting” → supported meeting-prep scenario
- “What percentage can we safely automate?” → supported known-unknown scenario
- “What are we building?” → honest fallback
- “What should we do next?” → honest fallback
- “Summarize the project.” → honest fallback

The remaining fallbacks are intentional for this deterministic prototype rather than guessed answers.

## Static QA checks passed

- `context-app.js` parses successfully with Node.
- `context-data.js` parses successfully with Node.
- No duplicate IDs in the static prototype HTML.
- All `aria-controls` targets exist.
- Prototype-local CSS/JS asset paths resolve in the package.
- No remaining `aiScenarios` references.
- CSS brace structure is balanced.
- No static nested buttons.
- No generated `role="button"` pattern remains in the application source.
- No unsafe direct `dateISO.localeCompare(...)` assumptions remain.

## Remaining engineering debt / boundaries

This is still intentionally a behavioral prototype, not a production application. `context-app.js` remains a single-file UI/state controller and much of `context-tool.css` still reflects iterative prototype styling with a meaningful number of `!important` declarations. I would not split this into components/state modules or perform a wholesale CSS rewrite for the portfolio demo; that would add implementation work without improving the product learning being demonstrated. If State moved beyond prototype status, those would be the first maintainability refactors.

The prototype also intentionally keeps all demo state in memory, uses a fixed Northstar corpus, has no persistence, authentication, collaboration, backend, or live model. Those are prototype boundaries rather than defects.

## Rendered-browser limitation

I attempted browser-level QA with the installed Chromium/Playwright environment. Browser navigation to both localhost and `file://` is blocked by the execution environment’s administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), so I could not truthfully claim a fresh pixel-level/browser-interaction pass here. The code/static checks above are complete, but the final visual interaction pass should still be done in Paige’s normal local/browser environment before calling the prototype shipped.
