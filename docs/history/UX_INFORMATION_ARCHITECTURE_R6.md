# State UX Information Architecture — R6

## Locked product model

- **Notes**: complete chronological project memory. Raw Evidence, searchable and date-filterable.
- **Open Items**: one attention surface, not separate Review and Questions destinations.
  - **Needs your review**: actionable now; enough evidence exists for a human decision.
  - **Blocking questions**: unresolved questions with an evidence-supported dependency on a project goal, milestone, decision, or next step. Important, but not yet actionable as a State transition.
  - **Open questions**: important unknowns that can wait quietly for relevant Evidence.
  - When a later Note appears to answer an open/blocking question, it does **not** silently resolve. It moves into Review when the answer would establish/change consequential Current State; human acceptance closes the question and updates Current State.
  - The sidebar Open Items count represents actionable Reviews only, so long-lived questions do not create notification pressure.
- **Project**: one continuous, clean Current State document. Its sidebar children are in-page outline jumps, not separate pages.
- **History**: separate primary destination showing how accepted Notes changed Current State.

## R6 UI changes

1. Notes filters collapsed to one quiet row: All notes / Today / 7 days / 30 days + a Status dropdown. Removed per-status counts from the toolbar.
2. Open Items is a single page with ordered sections: Needs your review, Blocking questions, Open questions.
3. Project sidebar children now jump to sections of the one Project document.
4. History moved out from under Project and remains its own destination.
5. Demo fixture blocker labels are only applied where existing project Evidence explicitly names a dependency.

## Authority invariant

No change: the model interprets, software enforces, and the human authorizes consequential Current State transitions. Blocker status is presentation/dependency metadata; it is not permission to mutate Current State.
