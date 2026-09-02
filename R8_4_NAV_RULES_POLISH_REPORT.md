# State R8.4 — navigation, Project Rules, and review polish

## Changes
- Clicking the State wordmark now returns to Workspace.
- Clicking the main Project nav opens/renders Project without any programmatic page scroll. Smooth scrolling is reserved for Project subsection links.
- Open Items remains a single main-nav destination; its urgency breakdown lives inside the page rather than being duplicated in the sidebar.
- Expanded Review copy strips stray Markdown `**` markers and applies explicit hierarchy to Current, Review question/Proposed, and Still unresolved.
- Blocking-question cards visibly state `Blocks: ...` whenever the required concrete dependency is present.
- Project now has Project settings → Rules. Users can add/remove rules in Authority, Review, Sources, or Interpretation categories.
- Project Rules use the existing backend `project_rules` authority table, are persisted, are retired rather than hard-deleted, and are included in Anthropic/OpenAI interpretation prompts. They remain distinct from Current State and cannot be silently changed by the model.
- Build revision: `r8.4-navigation-rules-polish-2026-09-02`.

## Verification
- Backend/integration: 172 passed, 3 skipped, 7 subtests passed.
- Frontend Ask behavior: 81 passed, 0 failed.
- Note interpretation matrix completed successfully.
- JavaScript syntax checks passed for context-app.js and context-api.js.
